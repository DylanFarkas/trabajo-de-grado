-- Oculta un texto de la ficha sin cambiar si está publicado, pendiente o rechazado.
-- Los textos que ya existen quedan activos.

alter table public.contributions
  add column active boolean not null default true;

grant select (active) on table public.contributions to anon;

drop index if exists public.contributions_place_approved_idx;
create index contributions_place_approved_idx
  on public.contributions (place_id, created_at desc)
  where status = 'approved' and active;

drop policy if exists contributions_select_anon on public.contributions;
create policy contributions_select_anon
  on public.contributions
  for select
  to anon
  using (status = 'approved' and active);

drop policy if exists contributions_select_authenticated on public.contributions;
create policy contributions_select_authenticated
  on public.contributions
  for select
  to authenticated
  using (
    (status = 'approved' and active)
    or author_id = (select auth.uid())
    or (select private.is_admin())
  );

-- Un autor no puede encender ni apagar su texto. El admin sí.
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
      new.active := true;
    else
      new.review_note := old.review_note;
      new.author_id := old.author_id;
      new.active := old.active;
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
