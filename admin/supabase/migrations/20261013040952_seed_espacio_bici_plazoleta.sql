-- Semilla de Parqueadero de bicicletas Plazoleta de Ingeniería desde app/assets/geojson/espacios.json.
-- No pisa una ficha que el admin ya haya editado.

insert into public.places (id, name, kind)
values ('bici-plazoleta', 'Parqueadero de bicicletas Plazoleta de Ingeniería', 'space')
on conflict (id) do nothing;
