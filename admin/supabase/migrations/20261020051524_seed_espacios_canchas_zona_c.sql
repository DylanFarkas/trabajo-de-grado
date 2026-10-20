-- Semilla de las canchas de la Zona C desde app/assets/geojson/espacios.json.
-- No pisa una ficha que el admin ya haya editado.
-- El grupo de cuatro canchas sin código al oriente de la Zona C no se siembra:
-- no es un espacio.

insert into public.places (id, name, kind)
values
  ('c10', 'Cancha de fútbol C10', 'space'),
  ('c11', 'Cancha de fútbol C11', 'space'),
  ('c12', 'Cancha de fútbol C12', 'space'),
  ('c13', 'Cancha de fútbol C13', 'space'),
  ('c14', 'Cancha de fútbol C14', 'space'),
  ('c15', 'Cancha de fútbol C15', 'space'),
  ('c16', 'Cancha de fútbol C16', 'space'),
  ('c17', 'Cancha de fútbol C17', 'space'),
  ('c18', 'Cancha de fútbol C18', 'space'),
  ('c19', 'Cancha de fútbol C19', 'space'),
  ('c20', 'Cancha de fútbol C20', 'space'),
  ('c21', 'Canchas de tenis C21', 'space')
on conflict (id) do nothing;
