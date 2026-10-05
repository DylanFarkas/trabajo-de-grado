-- Semilla de Parqueadero 10 desde app/assets/geojson/espacios.json.
-- No pisa una ficha que el admin ya haya editado.

insert into public.places (id, name, kind)
values ('p10', 'Parqueadero 10', 'space')
on conflict (id) do nothing;
