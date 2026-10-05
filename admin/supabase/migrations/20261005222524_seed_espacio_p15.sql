-- Semilla de Parqueadero 15 desde app/assets/geojson/espacios.json.
-- No pisa una ficha que el admin ya haya editado.

insert into public.places (id, name, kind)
values ('p15', 'Parqueadero 15', 'space')
on conflict (id) do nothing;
