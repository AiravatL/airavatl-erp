begin;

alter table public.market_rates
  add column if not exists vehicle_type_id uuid;

alter table public.trips
  add column if not exists vehicle_type_id uuid;

-- Seed vehicle master with any historical vehicle types found in rates/trips.
insert into public.vehicle_master_types (name, active)
select src.name, true
from (
  select distinct btrim(mr.vehicle_type) as name
  from public.market_rates mr
  where nullif(btrim(mr.vehicle_type), '') is not null

  union

  select distinct btrim(t.vehicle_type) as name
  from public.trips t
  where nullif(btrim(t.vehicle_type), '') is not null
) as src
where src.name is not null
  and not exists (
    select 1
    from public.vehicle_master_types vmt
    where lower(btrim(vmt.name)) = lower(src.name)
  );

-- Backfill and canonicalize market_rates vehicle type + id.
with resolved_rates as (
  select
    mr.id as rate_id,
    vmt.id as type_id,
    vmt.name as type_name
  from public.market_rates mr
  join lateral (
    select t.id, t.name
    from public.vehicle_master_types t
    where lower(btrim(t.name)) = lower(btrim(mr.vehicle_type))
    order by t.created_at asc
    limit 1
  ) vmt on true
)
update public.market_rates mr
set
  vehicle_type_id = rr.type_id,
  vehicle_type = rr.type_name
from resolved_rates rr
where rr.rate_id = mr.id;

-- Backfill and canonicalize trips vehicle type + id.
with resolved_trips as (
  select
    tr.id as trip_id,
    vmt.id as type_id,
    vmt.name as type_name
  from public.trips tr
  join lateral (
    select t.id, t.name
    from public.vehicle_master_types t
    where lower(btrim(t.name)) = lower(btrim(tr.vehicle_type))
    order by t.created_at asc
    limit 1
  ) vmt on true
  where nullif(btrim(tr.vehicle_type), '') is not null
)
update public.trips tr
set
  vehicle_type_id = rt.type_id,
  vehicle_type = rt.type_name
from resolved_trips rt
where rt.trip_id = tr.id;

-- Ensure all market rates are mapped.
do $$
begin
  if exists (
    select 1
    from public.market_rates mr
    where mr.vehicle_type_id is null
  ) then
    raise exception 'market_rates_vehicle_type_backfill_failed' using errcode = '22023';
  end if;
end;
$$;

-- Ensure all non-empty trip vehicle types are mapped.
do $$
begin
  if exists (
    select 1
    from public.trips tr
    where nullif(btrim(tr.vehicle_type), '') is not null
      and tr.vehicle_type_id is null
  ) then
    raise exception 'trips_vehicle_type_backfill_failed' using errcode = '22023';
  end if;
end;
$$;

alter table public.market_rates
  alter column vehicle_type_id set not null;

create index if not exists idx_market_rates_vehicle_type_id
  on public.market_rates (vehicle_type_id);

create index if not exists idx_trips_vehicle_type_id
  on public.trips (vehicle_type_id);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where connamespace = 'public'::regnamespace
      and conname = 'market_rates_vehicle_type_id_fkey'
  ) then
    alter table public.market_rates
      add constraint market_rates_vehicle_type_id_fkey
      foreign key (vehicle_type_id)
      references public.vehicle_master_types (id);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where connamespace = 'public'::regnamespace
      and conname = 'trips_vehicle_type_id_fkey'
  ) then
    alter table public.trips
      add constraint trips_vehicle_type_id_fkey
      foreign key (vehicle_type_id)
      references public.vehicle_master_types (id);
  end if;
end;
$$;

commit;
