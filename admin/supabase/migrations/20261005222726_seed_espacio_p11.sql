-- Semilla de Parqueadero 11 desde app/assets/geojson/espacios.json.
-- No pisa una ficha que el admin ya haya editado.

insert into public.places (id, name, kind)
values ('p11', 'Parqueadero 11', 'space')
on conflict (id) do nothing;
