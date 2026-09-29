-- Por ahora un aporte es solo texto. La columna title se conserva, pero opcional.

alter table public.contributions
  alter column title drop not null;

alter table public.contributions drop constraint if exists contributions_title_check;
alter table public.contributions
  add constraint contributions_title_check
  check (title is null or char_length(btrim(title)) > 0);
