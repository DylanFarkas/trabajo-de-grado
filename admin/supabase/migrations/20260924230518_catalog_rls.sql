-- Fase 1: catálogo, contribuciones y rutas, con RLS.
-- El rol admin vive en profiles.role y solo se cambia desde SQL (no desde el cliente).

create schema if not exists private;

revoke all on schema private from public;
grant usage on schema private to authenticated, service_role, supabase_auth_admin;

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

create or replace function private.set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email, full_name, avatar_url)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name'),
    coalesce(new.raw_user_meta_data ->> 'avatar_url', new.raw_user_meta_data ->> 'picture')
  );
  return new;
end;
$$;

create or replace function private.sync_user_profile()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.profiles
  set
    email = new.email,
    full_name = coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name'),
    avatar_url = coalesce(new.raw_user_meta_data ->> 'avatar_url', new.raw_user_meta_data ->> 'picture')
  where id = new.id;
  return new;
end;
$$;

revoke all on function private.set_updated_at() from public;
revoke all on function private.handle_new_user() from public;
revoke all on function private.sync_user_profile() from public;

grant execute on function private.set_updated_at() to authenticated, service_role;
grant execute on function private.handle_new_user() to supabase_auth_admin;
grant execute on function private.sync_user_profile() to supabase_auth_admin;

-- ---------------------------------------------------------------------------
-- Tablas
-- ---------------------------------------------------------------------------

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text,
  full_name text,
  avatar_url text,
  role text not null default 'user',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_role_check check (role in ('user', 'admin')),
  constraint profiles_email_check check (email is null or char_length(btrim(email)) > 0)
);

create or replace function private.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles
    where id = (select auth.uid())
      and role = 'admin'
  );
$$;

revoke all on function private.is_admin() from public;
grant execute on function private.is_admin() to authenticated;

create table public.places (
  id text primary key,
  name text not null,
  kind text not null,
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint places_id_check check (id ~ '^[A-Za-z0-9][A-Za-z0-9_-]*$'),
  constraint places_kind_check check (kind in ('building', 'space')),
  constraint places_name_check check (char_length(btrim(name)) > 0)
);

create table public.categories (
  id text primary key,
  name text not null,
  description text,
  tone text not null,
  sort_order integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint categories_id_check check (id ~ '^[a-z0-9_]+$'),
  constraint categories_tone_check check (tone in ('food', 'sport', 'library', 'culture')),
  constraint categories_name_check check (char_length(btrim(name)) > 0)
);

create table public.place_categories (
  place_id text not null references public.places (id) on delete cascade,
  category_id text not null references public.categories (id) on delete cascade,
  primary key (place_id, category_id)
);

create table public.contributions (
  id bigint generated always as identity primary key,
  place_id text not null references public.places (id) on delete restrict,
  author_id uuid not null references public.profiles (id) on delete cascade,
  title text not null,
  body text not null,
  status text not null default 'pending',
  reviewer_id uuid references public.profiles (id) on delete restrict,
  review_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint contributions_title_check check (char_length(btrim(title)) > 0),
  constraint contributions_body_check check (char_length(btrim(body)) > 0),
  constraint contributions_status_check check (status in ('pending', 'approved', 'rejected')),
  constraint contributions_review_check check (
    (status = 'pending' and reviewer_id is null)
    or (status <> 'pending' and reviewer_id is not null)
  )
);

create table public.routes (
  id bigint generated always as identity primary key,
  name text not null,
  description text,
  published boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint routes_name_check check (char_length(btrim(name)) > 0)
);

create table public.route_stops (
  route_id bigint not null references public.routes (id) on delete cascade,
  place_id text not null references public.places (id) on delete restrict,
  position integer not null,
  primary key (route_id, position),
  constraint route_stops_place_unique unique (route_id, place_id),
  constraint route_stops_position_check check (position >= 0)
);

create index place_categories_category_id_idx on public.place_categories (category_id);
create index contributions_place_id_idx on public.contributions (place_id);
create index contributions_author_id_idx on public.contributions (author_id);
create index contributions_reviewer_id_idx on public.contributions (reviewer_id);
create index contributions_pending_idx on public.contributions (created_at) where status = 'pending';
create index route_stops_place_id_idx on public.route_stops (place_id);
create index routes_published_idx on public.routes (id) where published;

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function private.set_updated_at();

create trigger places_set_updated_at
  before update on public.places
  for each row execute function private.set_updated_at();

create trigger categories_set_updated_at
  before update on public.categories
  for each row execute function private.set_updated_at();

create trigger contributions_set_updated_at
  before update on public.contributions
  for each row execute function private.set_updated_at();

create trigger routes_set_updated_at
  before update on public.routes
  for each row execute function private.set_updated_at();

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_user();

create trigger on_auth_user_updated
  after update of email, raw_user_meta_data on auth.users
  for each row execute function private.sync_user_profile();

-- ---------------------------------------------------------------------------
-- Privilegios: mínimo, después de habilitar RLS
-- ---------------------------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.places enable row level security;
alter table public.categories enable row level security;
alter table public.place_categories enable row level security;
alter table public.contributions enable row level security;
alter table public.routes enable row level security;
alter table public.route_stops enable row level security;

alter table public.profiles force row level security;
alter table public.places force row level security;
alter table public.categories force row level security;
alter table public.place_categories force row level security;
alter table public.contributions force row level security;
alter table public.routes force row level security;
alter table public.route_stops force row level security;

revoke all on table public.profiles from anon, authenticated;
revoke all on table public.places from anon, authenticated;
revoke all on table public.categories from anon, authenticated;
revoke all on table public.place_categories from anon, authenticated;
revoke all on table public.contributions from anon, authenticated;
revoke all on table public.routes from anon, authenticated;
revoke all on table public.route_stops from anon, authenticated;

grant select on table public.profiles to authenticated;
grant select on table public.places to anon, authenticated;
grant select on table public.categories to anon, authenticated;
grant select on table public.place_categories to anon, authenticated;
grant select on table public.contributions to anon, authenticated;
grant select on table public.routes to anon, authenticated;
grant select on table public.route_stops to anon, authenticated;

grant insert, update, delete on table public.places to authenticated;
grant insert, update, delete on table public.categories to authenticated;
grant insert, update, delete on table public.place_categories to authenticated;
grant insert, update, delete on table public.contributions to authenticated;
grant insert, update, delete on table public.routes to authenticated;
grant insert, update, delete on table public.route_stops to authenticated;

grant all on table public.profiles to service_role;
grant all on table public.places to service_role;
grant all on table public.categories to service_role;
grant all on table public.place_categories to service_role;
grant all on table public.contributions to service_role;
grant all on table public.routes to service_role;
grant all on table public.route_stops to service_role;

grant usage, select on sequence public.contributions_id_seq to authenticated, service_role;
grant usage, select on sequence public.routes_id_seq to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Políticas
-- ---------------------------------------------------------------------------

create policy profiles_select_own_or_admin
  on public.profiles
  for select
  to authenticated
  using (
    id = (select auth.uid())
    or (select private.is_admin())
  );

create policy places_public_read
  on public.places
  for select
  to anon, authenticated
  using (true);

create policy places_admin_write
  on public.places
  for insert
  to authenticated
  with check ((select private.is_admin()));

create policy places_admin_update
  on public.places
  for update
  to authenticated
  using ((select private.is_admin()))
  with check ((select private.is_admin()));

create policy places_admin_delete
  on public.places
  for delete
  to authenticated
  using ((select private.is_admin()));

create policy categories_public_read
  on public.categories
  for select
  to anon, authenticated
  using (active);

create policy categories_admin_read
  on public.categories
  for select
  to authenticated
  using ((select private.is_admin()));

create policy categories_admin_insert
  on public.categories
  for insert
  to authenticated
  with check ((select private.is_admin()));

create policy categories_admin_update
  on public.categories
  for update
  to authenticated
  using ((select private.is_admin()))
  with check ((select private.is_admin()));

create policy categories_admin_delete
  on public.categories
  for delete
  to authenticated
  using ((select private.is_admin()));

create policy place_categories_public_read
  on public.place_categories
  for select
  to anon, authenticated
  using (
    exists (
      select 1
      from public.categories
      where categories.id = place_categories.category_id
        and categories.active
    )
  );

create policy place_categories_admin_read
  on public.place_categories
  for select
  to authenticated
  using ((select private.is_admin()));

create policy place_categories_admin_insert
  on public.place_categories
  for insert
  to authenticated
  with check ((select private.is_admin()));

create policy place_categories_admin_delete
  on public.place_categories
  for delete
  to authenticated
  using ((select private.is_admin()));

create policy contributions_public_read
  on public.contributions
  for select
  to anon, authenticated
  using (status = 'approved');

create policy contributions_author_read
  on public.contributions
  for select
  to authenticated
  using (author_id = (select auth.uid()));

create policy contributions_admin_read
  on public.contributions
  for select
  to authenticated
  using ((select private.is_admin()));

create policy contributions_author_insert
  on public.contributions
  for insert
  to authenticated
  with check (
    author_id = (select auth.uid())
    and status = 'pending'
    and reviewer_id is null
  );

create policy contributions_author_update
  on public.contributions
  for update
  to authenticated
  using (
    author_id = (select auth.uid())
    and status = 'pending'
  )
  with check (
    author_id = (select auth.uid())
    and status = 'pending'
    and reviewer_id is null
  );

create policy contributions_admin_update
  on public.contributions
  for update
  to authenticated
  using ((select private.is_admin()))
  with check ((select private.is_admin()));

create policy contributions_author_delete
  on public.contributions
  for delete
  to authenticated
  using (
    author_id = (select auth.uid())
    and status = 'pending'
  );

create policy routes_public_read
  on public.routes
  for select
  to anon, authenticated
  using (published);

create policy routes_admin_read
  on public.routes
  for select
  to authenticated
  using ((select private.is_admin()));

create policy routes_admin_insert
  on public.routes
  for insert
  to authenticated
  with check ((select private.is_admin()));

create policy routes_admin_update
  on public.routes
  for update
  to authenticated
  using ((select private.is_admin()))
  with check ((select private.is_admin()));

create policy routes_admin_delete
  on public.routes
  for delete
  to authenticated
  using ((select private.is_admin()));

create policy route_stops_public_read
  on public.route_stops
  for select
  to anon, authenticated
  using (
    exists (
      select 1
      from public.routes
      where routes.id = route_stops.route_id
        and routes.published
    )
  );

create policy route_stops_admin_read
  on public.route_stops
  for select
  to authenticated
  using ((select private.is_admin()));

create policy route_stops_admin_insert
  on public.route_stops
  for insert
  to authenticated
  with check ((select private.is_admin()));

create policy route_stops_admin_update
  on public.route_stops
  for update
  to authenticated
  using ((select private.is_admin()))
  with check ((select private.is_admin()));

create policy route_stops_admin_delete
  on public.route_stops
  for delete
  to authenticated
  using ((select private.is_admin()));
