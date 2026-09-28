-- Miniatura opcional de cada recorrido. El archivo vive en Cloudinary; aquí solo se guarda la URL.

alter table public.routes
  add column if not exists image_url text;
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'routes_image_url_check'
      and conrelid = 'public.routes'::regclass
  ) then
    alter table public.routes
      add constraint routes_image_url_check
      check (image_url is null or char_length(btrim(image_url)) > 0);
  end if;
end $$;
