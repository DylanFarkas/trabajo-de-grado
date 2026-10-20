-- Fase 7: reportes de vías cerradas.
--
-- Un cierre es temporal y lo valida la comunidad, no un revisor:
--   candidate   reporte remoto. No cambia las rutas.
--   provisional alguien lo vio en el sitio. Las rutas lo penalizan.
--   confirmed   suficiente evidencia (o lo creó un admin). Las rutas no lo cruzan.
--   expired / reopened / rejected: ya no afecta a nadie.
--
-- Puntaje: el reporte vale 2 si se hizo en el sitio y 1 si no; cada voto igual.
-- Con 6 puntos netos se confirma. Los votos "ya está abierta" restan y, si igualan
-- a los de "sigue cerrada" con al menos 4, lo reabren. Todo cierre comunitario
-- vence solo si nadie lo reconfirma. Los de admin solo vencen en la fecha que elige.
--
-- La geometría vive en el GeoJSON de la app. Aquí solo se guarda la clave del tramo:
-- osm:<id_segmento> (aristas_red.json) o pasillo:<id_pasillo> (pasillos.json).

create extension if not exists pg_cron with schema pg_catalog;

-- ---------------------------------------------------------------------------
-- Reputación: la ajusta la base al resolverse un cierre. El cliente no la escribe
-- (profiles no tiene GRANT de escritura).
-- ---------------------------------------------------------------------------

alter table public.profiles
  add column if not exists reputation integer not null default 0;

-- ---------------------------------------------------------------------------
-- Tablas
-- ---------------------------------------------------------------------------

create table public.road_closures (
  id bigint generated always as identity primary key,
  reported_by uuid not null references public.profiles (id) on delete cascade,
  source text not null default 'community',
  category text not null,
  description text not null,
  status text not null default 'candidate',
  on_site_report boolean not null default false,
  position_source text not null default 'simulated',
  estimated_hours integer,
  confirm_score integer not null default 0,
  deny_score integer not null default 0,
  review_note text,
  resolved_by uuid references public.profiles (id) on delete set null,
  resolved_at timestamptz,
  confirmed_at timestamptz,
  last_confirmed_at timestamptz,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint road_closures_source_check check (source in ('community', 'admin')),
  constraint road_closures_category_check check (category in ('obra', 'evento', 'inundacion', 'dano', 'otro')),
  constraint road_closures_description_check check (char_length(btrim(description)) between 10 and 500),
  constraint road_closures_status_check check (
    status in ('candidate', 'provisional', 'confirmed', 'expired', 'reopened', 'rejected')
  ),
  constraint road_closures_position_source_check check (position_source in ('simulated', 'gps')),
  constraint road_closures_estimated_hours_check check (estimated_hours is null or estimated_hours between 1 and 720),
  constraint road_closures_scores_check check (confirm_score >= 0 and deny_score >= 0),
  constraint road_closures_review_note_check check (review_note is null or char_length(review_note) <= 500),
  constraint road_closures_expires_check check (expires_at > created_at)
);

create table public.closure_segments (
  closure_id bigint not null references public.road_closures (id) on delete cascade,
  segment_key text not null,
  primary key (closure_id, segment_key),
  constraint closure_segments_key_check check (segment_key ~ '^(osm|pasillo):[0-9]+$')
);

create table public.closure_votes (
  closure_id bigint not null references public.road_closures (id) on delete cascade,
  voter_id uuid not null references public.profiles (id) on delete cascade,
  vote text not null,
  on_site boolean not null default false,
  position_source text not null default 'simulated',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (closure_id, voter_id),
  constraint closure_votes_vote_check check (vote in ('still_closed', 'now_open')),
  constraint closure_votes_position_source_check check (position_source in ('simulated', 'gps'))
);

create index road_closures_reported_by_idx on public.road_closures (reported_by);
create index road_closures_resolved_by_idx on public.road_closures (resolved_by);
create index road_closures_open_idx
  on public.road_closures (expires_at)
  where status in ('candidate', 'provisional', 'confirmed');
create index closure_segments_segment_key_idx on public.closure_segments (segment_key);
create index closure_votes_voter_id_idx on public.closure_votes (voter_id);

create trigger road_closures_set_updated_at
  before update on public.road_closures
  for each row execute function private.set_updated_at();

-- ---------------------------------------------------------------------------
-- Ventana de vida según estado. Cada "sigue cerrada" la vuelve a abrir desde ahora.
-- ---------------------------------------------------------------------------

create or replace function private.closure_window(status text)
returns interval
language sql
immutable
set search_path = ''
as $$
  select case status
    when 'candidate' then interval '2 hours'
    when 'provisional' then interval '4 hours'
    when 'confirmed' then interval '12 hours'
    else interval '0'
  end;
$$;

revoke all on function private.closure_window(text) from public;
grant execute on function private.closure_window(text) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Guarda de road_closures. SECURITY INVOKER: no salta RLS.
--   INSERT: el estado, el puntaje y las fechas los decide la base. Solo un admin
--           crea un cierre 'admin', que nace confirmado con la fecha que elige.
--   UPDATE desde la Data API (solo el admin pasa RLS): confirma, rechaza, reabre o
--           extiende. No toca puntajes. Las funciones de la base (current_user
--           distinto de authenticated) sí recalculan puntaje y estado.
-- ---------------------------------------------------------------------------

create or replace function private.guard_road_closure()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
  is_admin boolean := coalesce((select private.is_admin()), false);
  open_states constant text[] := array['candidate', 'provisional', 'confirmed'];
  open_count integer;
  daily_count integer;
begin
  if tg_op = 'INSERT' then
    new.created_at := now();
    new.last_confirmed_at := now();
    new.deny_score := 0;
    new.review_note := null;
    new.resolved_by := null;
    new.resolved_at := null;

    if is_admin and new.source = 'admin' then
      if new.expires_at is null or new.expires_at <= now() then
        raise exception 'closure_expiry' using detail = 'El cierre necesita una fecha de fin futura.';
      end if;
      if new.expires_at > now() + interval '90 days' then
        raise exception 'closure_expiry' using detail = 'Un cierre dura como máximo 90 días.';
      end if;
      new.status := 'confirmed';
      new.confirmed_at := now();
      new.confirm_score := 0;
      return new;
    end if;

    if actor is not null and not is_admin then
      select count(*) filter (where status = any (open_states) and expires_at > now()),
             count(*) filter (where created_at > now() - interval '1 day')
        into open_count, daily_count
        from public.road_closures
        where reported_by = actor;
      if open_count >= 3 then
        raise exception 'closure_limit' using detail = 'Tienes 3 reportes activos. Espera a que se resuelvan.';
      end if;
      if daily_count >= 5 then
        raise exception 'closure_limit' using detail = 'Llegaste al límite de 5 reportes por día.';
      end if;
    end if;

    new.source := 'community';
    new.confirmed_at := null;
    new.status := case when new.on_site_report then 'provisional' else 'candidate' end;
    new.confirm_score := case when new.on_site_report then 2 else 1 end;
    new.expires_at := now() + private.closure_window(new.status);
    return new;
  end if;

  new.reported_by := old.reported_by;
  new.source := old.source;
  new.created_at := old.created_at;
  new.on_site_report := old.on_site_report;
  new.position_source := old.position_source;

  if current_user <> 'authenticated' then
    return new;
  end if;

  new.confirm_score := old.confirm_score;
  new.deny_score := old.deny_score;
  new.confirmed_at := old.confirmed_at;
  new.last_confirmed_at := old.last_confirmed_at;
  new.resolved_by := old.resolved_by;
  new.resolved_at := old.resolved_at;

  if not (old.status = any (open_states)) then
    if new.status is distinct from old.status or new.expires_at is distinct from old.expires_at then
      raise exception 'closure_resolved' using detail = 'Este cierre ya terminó.';
    end if;
    return new;
  end if;

  if new.status is distinct from old.status then
    if new.status not in ('confirmed', 'rejected', 'reopened') then
      raise exception 'closure_transition' using detail = 'Solo se puede confirmar, rechazar o reabrir.';
    end if;
    new.resolved_by := actor;
    new.resolved_at := now();
    if new.status = 'confirmed' then
      new.confirmed_at := coalesce(old.confirmed_at, now());
      new.last_confirmed_at := now();
      if new.expires_at is not distinct from old.expires_at then
        new.expires_at := greatest(old.expires_at, now() + private.closure_window('confirmed'));
      end if;
    end if;
  end if;

  if new.status = any (open_states) and new.expires_at is distinct from old.expires_at then
    if new.expires_at <= now() then
      raise exception 'closure_expiry' using detail = 'El cierre necesita una fecha de fin futura.';
    end if;
    if new.expires_at > now() + interval '90 days' then
      raise exception 'closure_expiry' using detail = 'Un cierre dura como máximo 90 días.';
    end if;
  end if;

  return new;
end;
$$;

revoke all on function private.guard_road_closure() from public;
grant execute on function private.guard_road_closure() to authenticated, service_role;

create trigger road_closures_guard
  before insert or update on public.road_closures
  for each row execute function private.guard_road_closure();

-- ---------------------------------------------------------------------------
-- Un tramo no puede estar en dos cierres abiertos: el segundo reporte se vuelve
-- una confirmación del primero (la app lee el id en detail).
-- ---------------------------------------------------------------------------

create or replace function private.guard_closure_segment()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  existing bigint;
begin
  select s.closure_id into existing
  from public.closure_segments s
  join public.road_closures c on c.id = s.closure_id
  where s.segment_key = new.segment_key
    and s.closure_id <> new.closure_id
    and c.status in ('candidate', 'provisional', 'confirmed')
    and c.expires_at > now()
  limit 1;
  if existing is not null then
    raise exception 'closure_overlap' using detail = existing::text;
  end if;
  return new;
end;
$$;

revoke all on function private.guard_closure_segment() from public;
grant execute on function private.guard_closure_segment() to authenticated, service_role;

create trigger closure_segments_guard
  before insert on public.closure_segments
  for each row execute function private.guard_closure_segment();

-- ---------------------------------------------------------------------------
-- Guarda de votos. SECURITY INVOKER. Un voto por persona y cierre; se puede cambiar.
-- ---------------------------------------------------------------------------

create or replace function private.guard_closure_vote()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
  closure public.road_closures%rowtype;
begin
  if tg_op = 'INSERT' then
    if actor is not null then
      new.voter_id := actor;
    end if;
    new.created_at := now();
  else
    new.closure_id := old.closure_id;
    new.voter_id := old.voter_id;
    new.created_at := old.created_at;
  end if;
  new.updated_at := now();

  select * into closure from public.road_closures where id = new.closure_id;
  if not found then
    raise exception 'closure_not_found' using detail = 'Este cierre ya no existe.';
  end if;
  if closure.reported_by = new.voter_id then
    raise exception 'closure_own_vote' using detail = 'No puedes validar tu propio reporte.';
  end if;
  if closure.status not in ('candidate', 'provisional', 'confirmed') or closure.expires_at <= now() then
    raise exception 'closure_resolved' using detail = 'Este cierre ya terminó.';
  end if;
  return new;
end;
$$;

revoke all on function private.guard_closure_vote() from public;
grant execute on function private.guard_closure_vote() to authenticated, service_role;

create trigger closure_votes_guard
  before insert or update on public.closure_votes
  for each row execute function private.guard_closure_vote();

-- ---------------------------------------------------------------------------
-- Recálculo tras cada voto. SECURITY DEFINER a propósito: quien vota no tiene
-- UPDATE sobre road_closures, pero su voto sí debe mover puntaje, estado y fecha.
-- Vive en private (fuera de la Data API) y solo lo llaman triggers.
-- ---------------------------------------------------------------------------

create or replace function private.recalc_road_closure(target bigint, extend boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  closure public.road_closures%rowtype;
  confirm_total integer;
  deny_total integer;
  net integer;
  witness boolean;
  next_status text;
begin
  select * into closure from public.road_closures where id = target for update;
  if not found or closure.status not in ('candidate', 'provisional', 'confirmed') then
    return;
  end if;

  select
    coalesce(sum(case when vote = 'still_closed' then case when on_site then 2 else 1 end end), 0),
    coalesce(sum(case when vote = 'now_open' then case when on_site then 2 else 1 end end), 0),
    coalesce(bool_or(vote = 'still_closed' and on_site), false)
  into confirm_total, deny_total, witness
  from public.closure_votes
  where closure_id = target;

  if closure.source = 'community' then
    confirm_total := confirm_total + case when closure.on_site_report then 2 else 1 end;
  end if;
  witness := witness or closure.on_site_report;
  net := confirm_total - deny_total;

  if closure.source = 'admin' then
    next_status := closure.status;
  elsif deny_total >= 4 and deny_total >= confirm_total then
    next_status := 'reopened';
  elsif net >= 6 or (closure.status = 'confirmed' and net >= 4) then
    next_status := 'confirmed';
  elsif witness and net >= 2 then
    next_status := 'provisional';
  else
    next_status := 'candidate';
  end if;

  update public.road_closures
  set
    confirm_score = confirm_total,
    deny_score = deny_total,
    status = next_status,
    confirmed_at = case when next_status = 'confirmed' then coalesce(confirmed_at, now()) else confirmed_at end,
    last_confirmed_at = case when extend then now() else last_confirmed_at end,
    resolved_at = case when next_status = 'reopened' then now() else resolved_at end,
    expires_at = case
      when closure.source = 'community'
        and next_status in ('candidate', 'provisional', 'confirmed')
        and (extend or next_status <> closure.status)
        then greatest(expires_at, now() + private.closure_window(next_status))
      else expires_at
    end
  where id = target;
end;
$$;

revoke all on function private.recalc_road_closure(bigint, boolean) from public;

create or replace function private.closure_vote_changed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.recalc_road_closure(new.closure_id, new.vote = 'still_closed');
  return null;
end;
$$;

revoke all on function private.closure_vote_changed() from public;
grant execute on function private.closure_vote_changed() to authenticated, service_role;

create trigger closure_votes_recalc
  after insert or update on public.closure_votes
  for each row execute function private.closure_vote_changed();

-- ---------------------------------------------------------------------------
-- Reputación al cambiar de estado. SECURITY DEFINER: escribe profiles, que no
-- tiene GRANT de escritura para ningún cliente.
--   +2 al autor y +1 a quienes lo vieron en el sitio cuando se confirma por primera vez.
--   -2 al autor si vence o lo reabren sin haberse confirmado nunca y sin evidencia en el sitio
--      (vencer) o tumbado por los votantes (reabrir).
--   -5 al autor si un admin lo rechaza.
-- ---------------------------------------------------------------------------

create or replace function private.settle_closure_reputation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.source <> 'community' then
    return null;
  end if;

  if new.status = 'confirmed' and old.confirmed_at is null then
    update public.profiles set reputation = reputation + 2 where id = new.reported_by;
    update public.profiles set reputation = reputation + 1
    where id in (
      select voter_id from public.closure_votes
      where closure_id = new.id and vote = 'still_closed' and on_site
    );
  elsif new.status = 'rejected' then
    update public.profiles set reputation = reputation - 5 where id = new.reported_by;
  elsif new.status = 'reopened' and new.confirmed_at is null and new.resolved_by is null then
    update public.profiles set reputation = reputation - 2 where id = new.reported_by;
  elsif new.status = 'expired'
    and new.confirmed_at is null
    and not new.on_site_report
    and not exists (
      select 1 from public.closure_votes
      where closure_id = new.id and vote = 'still_closed' and on_site
    ) then
    update public.profiles set reputation = reputation - 2 where id = new.reported_by;
  end if;
  return null;
end;
$$;

revoke all on function private.settle_closure_reputation() from public;
grant execute on function private.settle_closure_reputation() to authenticated, service_role;

create trigger road_closures_reputation
  after update of status on public.road_closures
  for each row
  when (old.status is distinct from new.status)
  execute function private.settle_closure_reputation();

-- ---------------------------------------------------------------------------
-- Vencimiento. La app ya filtra expires_at > now(); el job deja el estado al día
-- y liquida reputación.
-- ---------------------------------------------------------------------------

create or replace function private.expire_road_closures()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  affected integer;
begin
  update public.road_closures
  set status = 'expired'
  where status in ('candidate', 'provisional', 'confirmed')
    and expires_at <= now();
  get diagnostics affected = row_count;
  return affected;
end;
$$;

revoke all on function private.expire_road_closures() from public;

select cron.schedule('expire-road-closures', '*/5 * * * *', 'select private.expire_road_closures()');

-- ---------------------------------------------------------------------------
-- Alta atómica: el cierre y sus tramos en una sola transacción.
-- SECURITY INVOKER: corre con los permisos de quien llama.
-- ---------------------------------------------------------------------------

create or replace function public.report_closure(
  p_segment_keys text[],
  p_category text,
  p_description text,
  p_on_site boolean default false,
  p_position_source text default 'simulated',
  p_estimated_hours integer default null,
  p_as_admin boolean default false,
  p_expires_at timestamptz default null
)
returns bigint
language plpgsql
security invoker
set search_path = ''
as $$
declare
  new_id bigint;
begin
  if p_segment_keys is null or cardinality(p_segment_keys) = 0 then
    raise exception 'closure_segments' using detail = 'Elige al menos un tramo.';
  end if;
  if cardinality(p_segment_keys) > 40 then
    raise exception 'closure_segments' using detail = 'Un cierre admite hasta 40 tramos.';
  end if;

  insert into public.road_closures (
    reported_by, source, category, description, on_site_report,
    position_source, estimated_hours, expires_at
  )
  values (
    (select auth.uid()),
    case when p_as_admin then 'admin' else 'community' end,
    p_category,
    btrim(p_description),
    coalesce(p_on_site, false),
    p_position_source,
    p_estimated_hours,
    coalesce(p_expires_at, now() + interval '2 hours')
  )
  returning id into new_id;

  insert into public.closure_segments (closure_id, segment_key)
  select distinct new_id, key from unnest(p_segment_keys) as key;

  return new_id;
end;
$$;

revoke all on function public.report_closure(text[], text, text, boolean, text, integer, boolean, timestamptz) from public, anon;
grant execute on function public.report_closure(text[], text, text, boolean, text, integer, boolean, timestamptz) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- RLS y privilegios
-- ---------------------------------------------------------------------------

alter table public.road_closures enable row level security;
alter table public.closure_segments enable row level security;
alter table public.closure_votes enable row level security;
alter table public.road_closures force row level security;
alter table public.closure_segments force row level security;
alter table public.closure_votes force row level security;

revoke all on table public.road_closures from anon, authenticated;
revoke all on table public.closure_segments from anon, authenticated;
revoke all on table public.closure_votes from anon, authenticated;

-- Sin sesión no se publica autor, revisor ni nota interna.
grant select (
  id, source, category, description, status, estimated_hours, confirm_score, deny_score,
  confirmed_at, last_confirmed_at, expires_at, created_at, updated_at
) on table public.road_closures to anon;
grant select, insert, update, delete on table public.road_closures to authenticated;
grant select on table public.closure_segments to anon, authenticated;
grant insert, delete on table public.closure_segments to authenticated;
grant select, insert, update on table public.closure_votes to authenticated;
grant all on table public.road_closures to service_role;
grant all on table public.closure_segments to service_role;
grant all on table public.closure_votes to service_role;
grant usage, select on sequence public.road_closures_id_seq to authenticated, service_role;

create policy road_closures_select_anon
  on public.road_closures
  for select
  to anon
  using (status in ('provisional', 'confirmed') and expires_at > now());

create policy road_closures_select_authenticated
  on public.road_closures
  for select
  to authenticated
  using (
    (status in ('candidate', 'provisional', 'confirmed') and expires_at > now())
    or reported_by = (select auth.uid())
    or (select private.is_admin())
  );

create policy road_closures_insert
  on public.road_closures
  for insert
  to authenticated
  with check (
    reported_by = (select auth.uid())
    and (source = 'community' or (select private.is_admin()))
  );

create policy road_closures_admin_update
  on public.road_closures
  for update
  to authenticated
  using ((select private.is_admin()))
  with check ((select private.is_admin()));

create policy road_closures_admin_delete
  on public.road_closures
  for delete
  to authenticated
  using ((select private.is_admin()));

create policy closure_segments_select_anon
  on public.closure_segments
  for select
  to anon
  using (exists (select 1 from public.road_closures c where c.id = closure_segments.closure_id));

create policy closure_segments_select_authenticated
  on public.closure_segments
  for select
  to authenticated
  using (exists (select 1 from public.road_closures c where c.id = closure_segments.closure_id));

-- Un autor solo agrega tramos en la misma transacción que creó el cierre
-- (created_at lo fija el trigger a now(), la hora de la transacción).
create policy closure_segments_insert
  on public.closure_segments
  for insert
  to authenticated
  with check (
    exists (
      select 1 from public.road_closures c
      where c.id = closure_segments.closure_id
        and (
          (select private.is_admin())
          or (c.reported_by = (select auth.uid()) and c.created_at = now())
        )
    )
  );

create policy closure_segments_admin_delete
  on public.closure_segments
  for delete
  to authenticated
  using ((select private.is_admin()));

create policy closure_votes_select
  on public.closure_votes
  for select
  to authenticated
  using (voter_id = (select auth.uid()) or (select private.is_admin()));

create policy closure_votes_insert
  on public.closure_votes
  for insert
  to authenticated
  with check (voter_id = (select auth.uid()));

create policy closure_votes_update
  on public.closure_votes
  for update
  to authenticated
  using (voter_id = (select auth.uid()))
  with check (voter_id = (select auth.uid()));
