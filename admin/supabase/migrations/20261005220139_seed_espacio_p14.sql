-- Semilla de Parqueadero 14 desde app/assets/geojson/espacios.json.
-- No pisa una ficha que el admin ya haya editado.

insert into public.places (id, name, kind)
values ('p14', 'Parqueadero 14', 'space')
on conflict (id) do nothing;
