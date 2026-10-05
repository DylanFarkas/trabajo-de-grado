-- Semilla de Parqueadero 7 desde app/assets/geojson/espacios.json.
-- No pisa una ficha que el admin ya haya editado.

insert into public.places (id, name, kind)
values ('p7', 'Parqueadero 7', 'space')
on conflict (id) do nothing;
