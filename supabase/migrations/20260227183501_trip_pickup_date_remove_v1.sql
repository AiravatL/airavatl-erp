begin;

alter table public.trips
  drop column if exists pickup_date;

commit;
