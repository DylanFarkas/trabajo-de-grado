-- Avisa a las apps abiertas cuando cambia un cierre. Se usa Broadcast privado
-- en vez de depender solo de postgres_changes: una reapertura puede dejar la
-- fila fuera del SELECT de un usuario normal y aun así debe quitar el tramo
-- rojo de su mapa. El mensaje no lleva datos del cierre; la app vuelve a leer
-- con RLS y aplica el resultado.

create or replace function private.broadcast_closure_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform realtime.send(
    jsonb_build_object('changed_at', now()),
    'closures_changed',
    'campus-closures',
    true
  );
  return null;
end;
$$;

revoke all on function private.broadcast_closure_change() from public;
grant execute on function private.broadcast_closure_change() to authenticated, service_role;

drop trigger if exists road_closures_broadcast on public.road_closures;
create trigger road_closures_broadcast
  after insert or update or delete on public.road_closures
  for each row execute function private.broadcast_closure_change();

drop trigger if exists closure_segments_broadcast on public.closure_segments;
create trigger closure_segments_broadcast
  after insert or update or delete on public.closure_segments
  for each row execute function private.broadcast_closure_change();

-- Solo recibir el aviso. Ningún cliente puede publicar en este canal.
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'realtime'
      and tablename = 'messages'
      and policyname = 'closure_updates_receive_anon'
  ) then
    create policy closure_updates_receive_anon
      on realtime.messages
      for select
      to anon
      using ((select realtime.topic()) = 'campus-closures');
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'realtime'
      and tablename = 'messages'
      and policyname = 'closure_updates_receive_authenticated'
  ) then
    create policy closure_updates_receive_authenticated
      on realtime.messages
      for select
      to authenticated
      using ((select realtime.topic()) = 'campus-closures');
  end if;
end;
$$;
