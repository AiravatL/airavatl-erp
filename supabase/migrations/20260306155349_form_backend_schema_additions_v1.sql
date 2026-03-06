begin;

alter type public.lead_source add value if not exists 'field_visit';

alter table public.consigner_leads
  add column if not exists company_address text,
  add column if not exists contact_person_designation text,
  add column if not exists nature_of_business text,
  add column if not exists vehicle_requirements text[] not null default '{}';

update public.consigner_leads
set vehicle_requirements = case
  when coalesce(array_length(vehicle_requirements, 1), 0) > 0 then vehicle_requirements
  when nullif(btrim(coalesce(vehicle_type, '')), '') is not null then array[nullif(btrim(vehicle_type), '')]
  else '{}'::text[]
end;

alter table public.trips
  add column if not exists pickup_points text[] not null default '{}',
  add column if not exists drop_points text[] not null default '{}',
  add column if not exists material_details text,
  add column if not exists material_length text;

update public.trips
set
  pickup_points = case
    when coalesce(array_length(pickup_points, 1), 0) > 0 then pickup_points
    when nullif(btrim(coalesce(pickup_location, '')), '') is not null then array[nullif(btrim(pickup_location), '')]
    else '{}'::text[]
  end,
  drop_points = case
    when coalesce(array_length(drop_points, 1), 0) > 0 then drop_points
    when nullif(btrim(coalesce(drop_location, '')), '') is not null then array[nullif(btrim(drop_location), '')]
    else '{}'::text[]
  end;

commit;
