-- Semilla de Parqueadero de bicicletas E20 este desde app/assets/geojson/espacios.json.
-- No pisa una ficha que el admin ya haya editado.

insert into public.places (id, name, kind)
values ('bici-e20-este', 'Parqueadero de bicicletas E20 este', 'space')
on conflict (id) do nothing;
