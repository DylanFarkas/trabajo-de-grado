-- Semilla de Parqueadero de bicicletas B13 desde app/assets/geojson/espacios.json.
-- No pisa una ficha que el admin ya haya editado.

insert into public.places (id, name, kind)
values ('bici-b13', 'Parqueadero de bicicletas B13', 'space')
on conflict (id) do nothing;
