-- Semilla de Parqueadero de bicicletas E20 desde app/assets/geojson/espacios.json.
-- No pisa una ficha que el admin ya haya editado.

insert into public.places (id, name, kind)
values ('bici-e20', 'Parqueadero de bicicletas E20', 'space')
on conflict (id) do nothing;
