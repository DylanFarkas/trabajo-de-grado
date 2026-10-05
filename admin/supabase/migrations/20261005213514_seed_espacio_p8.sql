-- Semilla de Parqueadero 8 desde app/assets/geojson/espacios.json.
-- No pisa una ficha que el admin ya haya editado.

insert into public.places (id, name, kind)
values ('p8', 'Parqueadero 8', 'space')
on conflict (id) do nothing;
