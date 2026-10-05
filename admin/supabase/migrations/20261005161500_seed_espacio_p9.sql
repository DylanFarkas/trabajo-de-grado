-- Semilla de Parqueadero 9 desde app/assets/geojson/espacios.json.
-- No pisa una ficha que el admin ya haya editado.

insert into public.places (id, name, kind)
values ('p9', 'Parqueadero 9', 'space')
on conflict (id) do nothing;
