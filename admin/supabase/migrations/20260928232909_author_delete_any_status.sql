-- El autor puede retirar sus aportes en cualquier estado (también los publicados).
-- Editar sigue permitido solo mientras están en 'pending' (política contributions_update).

drop policy if exists contributions_delete on public.contributions;
create policy contributions_delete
  on public.contributions
  for delete
  to authenticated
  using (
    (select private.is_admin())
    or author_id = (select auth.uid())
  );
