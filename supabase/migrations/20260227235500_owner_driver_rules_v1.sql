begin;

create unique index if not exists uq_vendor_drivers_one_active_owner
  on public.vendor_drivers (vendor_id)
  where active = true and is_owner_driver = true;

create or replace function public.fleet_vendor_driver_rules_tg_v1()
returns trigger
language plpgsql
as $$
declare
  v_other_active_drivers integer := 0;
  v_other_active_owner_drivers integer := 0;
  v_vendor_vehicle_count integer := 0;
begin
  if new.vendor_id is null then
    return new;
  end if;

  select
    count(*)::int,
    count(*) filter (where vd.is_owner_driver = true)::int
  into v_other_active_drivers, v_other_active_owner_drivers
  from public.vendor_drivers vd
  where vd.vendor_id = new.vendor_id
    and vd.active = true
    and vd.id <> coalesce(new.id, '00000000-0000-0000-0000-000000000000'::uuid);

  if coalesce(new.active, false) then
    if coalesce(new.is_owner_driver, false) then
      if v_other_active_owner_drivers > 0 then
        raise exception 'owner_driver_vendor_single_driver_only';
      end if;

      if v_other_active_drivers > 0 then
        raise exception 'owner_driver_not_allowed_for_vendor_fleet';
      end if;

      select count(*)::int
      into v_vendor_vehicle_count
      from public.vehicles v
      where v.vendor_id = new.vendor_id
        and v.ownership_type = 'vendor';

      if v_vendor_vehicle_count > 1 then
        raise exception 'owner_driver_vendor_single_vehicle_only';
      end if;
    else
      if v_other_active_owner_drivers > 0 then
        raise exception 'owner_driver_vendor_single_driver_only';
      end if;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_vendor_driver_rules_v1 on public.vendor_drivers;
create trigger trg_vendor_driver_rules_v1
before insert or update of vendor_id, is_owner_driver, active
on public.vendor_drivers
for each row execute function public.fleet_vendor_driver_rules_tg_v1();

create or replace function public.fleet_vendor_vehicle_rules_tg_v1()
returns trigger
language plpgsql
as $$
declare
  v_active_owner_driver_count integer := 0;
  v_other_vendor_vehicle_count integer := 0;
begin
  if new.ownership_type <> 'vendor' or new.vendor_id is null then
    return new;
  end if;

  select count(*)::int
  into v_active_owner_driver_count
  from public.vendor_drivers vd
  where vd.vendor_id = new.vendor_id
    and vd.active = true
    and vd.is_owner_driver = true;

  if v_active_owner_driver_count = 0 then
    return new;
  end if;

  select count(*)::int
  into v_other_vendor_vehicle_count
  from public.vehicles v
  where v.vendor_id = new.vendor_id
    and v.ownership_type = 'vendor'
    and v.id <> coalesce(new.id, '00000000-0000-0000-0000-000000000000'::uuid);

  if v_other_vendor_vehicle_count > 0 then
    raise exception 'owner_driver_vendor_single_vehicle_only';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_vendor_vehicle_rules_v1 on public.vehicles;
create trigger trg_vendor_vehicle_rules_v1
before insert or update of vendor_id, ownership_type
on public.vehicles
for each row execute function public.fleet_vendor_vehicle_rules_tg_v1();

create or replace function public.fleet_owner_driver_assignment_rules_tg_v1()
returns trigger
language plpgsql
as $$
declare
  v_vehicle_vendor_id uuid;
  v_vehicle_ownership public.ownership_type;
  v_owner_driver_exists boolean := false;
  v_driver_vendor_id uuid;
  v_driver_active boolean;
  v_driver_is_owner boolean;
begin
  select v.vendor_id, v.ownership_type
  into v_vehicle_vendor_id, v_vehicle_ownership
  from public.vehicles v
  where v.id = new.vehicle_id;

  if v_vehicle_vendor_id is null or v_vehicle_ownership <> 'vendor' then
    return new;
  end if;

  select exists (
    select 1
    from public.vendor_drivers vd
    where vd.vendor_id = v_vehicle_vendor_id
      and vd.active = true
      and vd.is_owner_driver = true
  ) into v_owner_driver_exists;

  if not v_owner_driver_exists then
    return new;
  end if;

  select vd.vendor_id, vd.active, vd.is_owner_driver
  into v_driver_vendor_id, v_driver_active, v_driver_is_owner
  from public.vendor_drivers vd
  where vd.id = new.driver_id;

  if v_driver_vendor_id is null or v_driver_vendor_id <> v_vehicle_vendor_id then
    raise exception 'driver_vendor_mismatch';
  end if;

  if v_driver_active is not true then
    raise exception 'driver_inactive';
  end if;

  if v_driver_is_owner is not true then
    raise exception 'owner_driver_required_for_owner_vehicle';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_owner_driver_assignment_rules_v1 on public.vehicle_driver_assignments;
create trigger trg_owner_driver_assignment_rules_v1
before insert or update of vehicle_id, driver_id
on public.vehicle_driver_assignments
for each row execute function public.fleet_owner_driver_assignment_rules_tg_v1();

create or replace function public.fleet_owner_driver_trip_rules_tg_v1()
returns trigger
language plpgsql
as $$
declare
  v_owner_driver_exists boolean := false;
  v_driver_vendor_id uuid;
  v_driver_active boolean;
  v_driver_is_owner boolean;
begin
  if new.vendor_id is null or new.driver_id is null then
    return new;
  end if;

  select exists (
    select 1
    from public.vendor_drivers vd
    where vd.vendor_id = new.vendor_id
      and vd.active = true
      and vd.is_owner_driver = true
  ) into v_owner_driver_exists;

  if not v_owner_driver_exists then
    return new;
  end if;

  select vd.vendor_id, vd.active, vd.is_owner_driver
  into v_driver_vendor_id, v_driver_active, v_driver_is_owner
  from public.vendor_drivers vd
  where vd.id = new.driver_id;

  if v_driver_vendor_id is null or v_driver_vendor_id <> new.vendor_id then
    raise exception 'driver_vendor_mismatch';
  end if;

  if v_driver_active is not true then
    raise exception 'driver_inactive';
  end if;

  if v_driver_is_owner is not true then
    raise exception 'owner_driver_required_for_owner_vehicle';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_owner_driver_trip_rules_v1 on public.trips;
create trigger trg_owner_driver_trip_rules_v1
before insert or update of vendor_id, driver_id
on public.trips
for each row execute function public.fleet_owner_driver_trip_rules_tg_v1();

commit;
