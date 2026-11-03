-- La universidad reconoce el lugar. Las fichas que ya existen quedan oficiales.

alter table public.places
  add column official boolean not null default true;
