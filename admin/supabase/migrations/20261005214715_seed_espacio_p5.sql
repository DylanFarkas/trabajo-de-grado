-- Semilla de Parqueadero 5 desde app/assets/geojson/espacios.json.
-- No pisa una ficha que el admin ya haya editado.

insert into public.places (id, name, kind)
values ('p5', 'Parqueadero 5', 'space')
on conflict (id) do nothing;
