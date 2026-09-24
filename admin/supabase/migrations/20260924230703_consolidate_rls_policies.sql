-- Una política permisiva por rol y acción.
-- anon no llama a private.is_admin(): no tiene permiso sobre ese esquema.

drop policy categories_public_read on public.categories;
drop policy categories_admin_read on public.categories;
create policy categories_select_anon
  on public.categories
  for select
  to anon
  using (active);
create policy categories_select_authenticated
  on public.categories
  for select
  to authenticated
  using (active or (select private.is_admin()));

drop policy place_categories_public_read on public.place_categories;
drop policy place_categories_admin_read on public.place_categories;
create policy place_categories_select_anon
  on public.place_categories
  for select
  to anon
  using (
    exists (
      select 1
      from public.categories
      where categories.id = place_categories.category_id
        and categories.active
    )
  );
create policy place_categories_select_authenticated
  on public.place_categories
  for select
  to authenticated
  using (
    (select private.is_admin())
    or exists (
      select 1
      from public.categories
      where categories.id = place_categories.category_id
        and categories.active
    )
  );

drop policy contributions_public_read on public.contributions;
drop policy contributions_author_read on public.contributions;
drop policy contributions_admin_read on public.contributions;
create policy contributions_select_anon
  on public.contributions
  for select
  to anon
  using (status = 'approved');
create policy contributions_select_authenticated
  on public.contributions
  for select
  to authenticated
  using (
    status = 'approved'
    or author_id = (select auth.uid())
    or (select private.is_admin())
  );

drop policy contributions_author_update on public.contributions;
drop policy contributions_admin_update on public.contributions;
create policy contributions_update
  on public.contributions
  for update
  to authenticated
  using (
    (select private.is_admin())
    or (
      author_id = (select auth.uid())
      and status = 'pending'
    )
  )
  with check (
    (select private.is_admin())
    or (
      author_id = (select auth.uid())
      and status = 'pending'
      and reviewer_id is null
    )
  );

drop policy routes_public_read on public.routes;
drop policy routes_admin_read on public.routes;
create policy routes_select_anon
  on public.routes
  for select
  to anon
  using (published);
create policy routes_select_authenticated
  on public.routes
  for select
  to authenticated
  using (published or (select private.is_admin()));

drop policy route_stops_public_read on public.route_stops;
drop policy route_stops_admin_read on public.route_stops;
create policy route_stops_select_anon
  on public.route_stops
  for select
  to anon
  using (
    exists (
      select 1
      from public.routes
      where routes.id = route_stops.route_id
        and routes.published
    )
  );
create policy route_stops_select_authenticated
  on public.route_stops
  for select
  to authenticated
  using (
    (select private.is_admin())
    or exists (
      select 1
      from public.routes
      where routes.id = route_stops.route_id
        and routes.published
    )
  );
