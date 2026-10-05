-- Semilla de Parqueadero 6 desde app/assets/geojson/espacios.json.
-- No pisa una ficha que el admin ya haya editado.

insert into public.places (id, name, kind)
values ('p6', 'Parqueadero 6', 'space')
on conflict (id) do nothing;
