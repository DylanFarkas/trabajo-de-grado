-- Semilla de Baños EISC desde app/assets/geojson/espacios.json.
-- No pisa una ficha que el admin ya haya editado.
-- Piso y público viven en espacios.json (banos), no en esta tabla.

insert into public.places (id, name, kind)
values ('bano-b13', 'Baños EISC', 'space')
on conflict (id) do nothing;
