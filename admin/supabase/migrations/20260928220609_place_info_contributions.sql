-- Fase 6: información contextual de los espacios.
--
-- Un mismo registro (public.contributions) cubre dos flujos:
--   1. Un usuario con sesión propone información de un espacio -> nace 'pending'.
--   2. Un admin la revisa (approved / rejected) o registra información directamente,
--      y esa nace 'approved'.
-- La app solo muestra 'approved' al público. El autor ve las suyas en cualquier estado.

-- ---------------------------------------------------------------------------
-- Deriva entre migraciones y proyecto: el tono 'academic' ya existe en remoto
-- (lo usan las facultades) pero la migración inicial no lo incluía. Se deja
-- explícito para que un reset local dé el mismo esquema.
-- ---------------------------------------------------------------------------

alter table public.categories drop constraint if exists categories_tone_check;
alter table public.categories
  add constraint categories_tone_check
  check (tone in ('food', 'sport', 'library', 'culture', 'academic'));

-- ---------------------------------------------------------------------------
-- Columnas y límites
-- ---------------------------------------------------------------------------

alter table public.contributions
  add column if not exists reviewed_at timestamptz;

alter table public.contributions
  add constraint contributions_title_length_check check (char_length(title) <= 120),
  add constraint contributions_body_length_check check (char_length(body) <= 2000),
  add constraint contributions_review_note_length_check check (review_note is null or char_length(review_note) <= 500);

-- Lectura pública de lo aprobado de un espacio, ordenado por fecha.
create index if not exists contributions_place_approved_idx
  on public.contributions (place_id, created_at desc)
  where status = 'approved';

-- ---------------------------------------------------------------------------
-- Trigger de guarda: quién revisó y cuándo lo decide la base, no el cliente.
--   - Un autor (no admin) no puede tocar review_note ni cambiar de autor.
--   - reviewer_id / reviewed_at se rellenan con auth.uid() al salir de 'pending'
--     (o al insertar directamente como aprobada) y se limpian si vuelve a 'pending'.
--   - Sin sesión (SQL editor, service_role) no se inventa revisor.
-- SECURITY INVOKER: no salta RLS.
-- ---------------------------------------------------------------------------

create or replace function private.guard_contribution()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
  is_admin boolean := coalesce((select private.is_admin()), false);
begin
  if actor is not null and not is_admin then
    if tg_op = 'INSERT' then
      new.review_note := null;
    else
      new.review_note := old.review_note;
      new.author_id := old.author_id;
    end if;
  end if;

  if new.status = 'pending' then
    new.reviewer_id := null;
    new.reviewed_at := null;
  elsif actor is not null and (tg_op = 'INSERT' or new.status is distinct from old.status) then
    new.reviewer_id := actor;
    new.reviewed_at := now();
  end if;

  return new;
end;
$$;

revoke all on function private.guard_contribution() from public;
grant execute on function private.guard_contribution() to authenticated, service_role;

drop trigger if exists contributions_guard on public.contributions;
create trigger contributions_guard
  before insert or update on public.contributions
  for each row execute function private.guard_contribution();

-- ---------------------------------------------------------------------------
-- RLS: el admin también escribe información (aprobada) y puede borrar cualquier
-- registro. Una política permisiva por rol y acción, como en las demás tablas.
-- ---------------------------------------------------------------------------

drop policy if exists contributions_author_insert on public.contributions;
create policy contributions_insert
  on public.contributions
  for insert
  to authenticated
  with check (
    author_id = (select auth.uid())
    and (
      (select private.is_admin())
      or (status = 'pending' and reviewer_id is null)
    )
  );

drop policy if exists contributions_author_delete on public.contributions;
create policy contributions_delete
  on public.contributions
  for delete
  to authenticated
  using (
    (select private.is_admin())
    or (author_id = (select auth.uid()) and status = 'pending')
  );

-- ---------------------------------------------------------------------------
-- Columnas visibles sin sesión: no se publican autor, revisor ni nota interna.
-- ---------------------------------------------------------------------------

revoke select on table public.contributions from anon;
grant select (id, place_id, title, body, status, created_at, updated_at)
  on table public.contributions to anon;
