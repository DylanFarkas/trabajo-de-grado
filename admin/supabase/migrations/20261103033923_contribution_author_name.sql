-- Nombre visible de quien escribió el texto. No se publica el correo ni el perfil completo.
-- Se copia al crear el aporte y no se deja cambiar después.

alter table public.contributions
  add column author_name text;

update public.contributions as contribution
set author_name = nullif(btrim(profile.full_name), '')
from public.profiles as profile
where profile.id = contribution.author_id;

grant select (author_name) on table public.contributions to anon;

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

  if tg_op = 'INSERT' then
    new.author_name := nullif(btrim((
      select profile.full_name
      from public.profiles as profile
      where profile.id = new.author_id
    )), '');
  else
    new.author_name := old.author_name;
  end if;

  return new;
end;
$$;
