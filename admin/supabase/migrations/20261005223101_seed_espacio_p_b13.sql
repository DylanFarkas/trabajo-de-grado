-- Semilla del parqueadero frente al B13 desde app/assets/geojson/espacios.json.
-- No tiene código oficial en el mapa. No pisa una ficha que el admin ya haya editado.

insert into public.places (id, name, kind)
values ('p-b13', 'Parqueadero B13', 'space')
on conflict (id) do nothing;
