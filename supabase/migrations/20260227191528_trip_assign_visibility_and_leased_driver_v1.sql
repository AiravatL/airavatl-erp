begin;

alter table public.vehicles
  add column if not exists leased_driver_name text,
  add column if not exists leased_driver_phone text;

create or replace function public.leased_vehicle_list_v3(
  p_actor uuid,
  p_status text default null,
  p_search text default null,
  p_limit integer default 200,
  p_offset integer default 0
)
returns table(
  id uuid,
  number text,
  type text,
  vehicle_length text,
  status vehicle_status,
  vendor_id uuid,
  vendor_name text,
  leased_driver_name text,
  leased_driver_phone text,
  current_trip_id uuid,
  policy_id uuid,
  driver_da_per_day numeric,
  vehicle_rent_per_day numeric,
  mileage_min numeric,
  mileage_max numeric,
  default_terrain route_terrain,
  fuel_variance_threshold_percent numeric,
  unofficial_gate_cap numeric,
  dala_kharcha_cap numeric,
  parking_cap numeric,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  v_role text;
begin
  select p.role into v_role
  from public.profiles p
  where p.id = p_actor and p.active = true;

  if v_role is null or v_role not in ('admin', 'super_admin', 'operations_vehicles', 'operations_consigner') then
    raise exception 'forbidden';
  end if;

  return query
  select
    v.id,
    v.number,
    v.type,
    v.vehicle_length,
    v.status,
    v.vendor_id,
    vn.name as vendor_name,
    v.leased_driver_name,
    v.leased_driver_phone,
    v.current_trip_id,
    lp.id as policy_id,
    coalesce(lp.driver_da_per_day, 0) as driver_da_per_day,
    coalesce(lp.vehicle_rent_per_day, 0) as vehicle_rent_per_day,
    coalesce(lp.mileage_min, 0) as mileage_min,
    coalesce(lp.mileage_max, 0) as mileage_max,
    coalesce(lp.default_terrain, 'plain'::route_terrain) as default_terrain,
    coalesce(lp.fuel_variance_threshold_percent, 10) as fuel_variance_threshold_percent,
    lp.unofficial_gate_cap,
    lp.dala_kharcha_cap,
    lp.parking_cap,
    v.created_at,
    v.updated_at
  from public.vehicles v
  left join public.leased_vehicle_policies lp on lp.vehicle_id = v.id
  left join public.vendors vn on vn.id = v.vendor_id
  where v.ownership_type = 'leased'
    and (p_status is null or v.status::text = p_status)
    and (
      p_search is null
      or v.number ilike '%' || p_search || '%'
      or v.type ilike '%' || p_search || '%'
      or coalesce(v.vehicle_length, '') ilike '%' || p_search || '%'
      or coalesce(v.leased_driver_name, '') ilike '%' || p_search || '%'
      or coalesce(v.leased_driver_phone, '') ilike '%' || p_search || '%'
    )
  order by v.created_at desc
  limit least(p_limit, 500)
  offset greatest(p_offset, 0);
end;
$$;

create or replace function public.leased_vehicle_get_v3(
  p_actor uuid,
  p_vehicle_id uuid
)
returns table(
  id uuid,
  number text,
  type text,
  vehicle_length text,
  status vehicle_status,
  vendor_id uuid,
  vendor_name text,
  leased_driver_name text,
  leased_driver_phone text,
  current_trip_id uuid,
  policy_id uuid,
  driver_da_per_day numeric,
  vehicle_rent_per_day numeric,
  mileage_min numeric,
  mileage_max numeric,
  default_terrain route_terrain,
  fuel_variance_threshold_percent numeric,
  unofficial_gate_cap numeric,
  dala_kharcha_cap numeric,
  parking_cap numeric,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  v_role text;
  v_ownership text;
begin
  select p.role into v_role
  from public.profiles p
  where p.id = p_actor and p.active = true;

  if v_role is null or v_role not in ('admin', 'super_admin', 'operations_vehicles', 'operations_consigner') then
    raise exception 'forbidden';
  end if;

  select v.ownership_type::text
  into v_ownership
  from public.vehicles v
  where v.id = p_vehicle_id;

  if v_ownership is null then
    raise exception 'not_found';
  end if;

  if v_ownership != 'leased' then
    raise exception 'not_found';
  end if;

  return query
  select
    v.id,
    v.number,
    v.type,
    v.vehicle_length,
    v.status,
    v.vendor_id,
    vn.name as vendor_name,
    v.leased_driver_name,
    v.leased_driver_phone,
    v.current_trip_id,
    lp.id as policy_id,
    coalesce(lp.driver_da_per_day, 0),
    coalesce(lp.vehicle_rent_per_day, 0),
    coalesce(lp.mileage_min, 0),
    coalesce(lp.mileage_max, 0),
    coalesce(lp.default_terrain, 'plain'::route_terrain),
    coalesce(lp.fuel_variance_threshold_percent, 10),
    lp.unofficial_gate_cap,
    lp.dala_kharcha_cap,
    lp.parking_cap,
    v.created_at,
    v.updated_at
  from public.vehicles v
  left join public.leased_vehicle_policies lp on lp.vehicle_id = v.id
  left join public.vendors vn on vn.id = v.vendor_id
  where v.id = p_vehicle_id;
end;
$$;

create or replace function public.leased_vehicle_create_v3(
  p_actor uuid,
  p_number text,
  p_type text,
  p_vehicle_length text default null,
  p_vendor_id uuid default null,
  p_leased_driver_name text default null,
  p_leased_driver_phone text default null,
  p_driver_da_per_day numeric default 1000,
  p_vehicle_rent_per_day numeric default 3333,
  p_mileage_min numeric default 3.0,
  p_mileage_max numeric default 5.0,
  p_default_terrain route_terrain default 'plain'::route_terrain,
  p_fuel_variance_threshold_percent numeric default 10,
  p_unofficial_gate_cap numeric default 1500,
  p_dala_kharcha_cap numeric default 500,
  p_parking_cap numeric default 300
)
returns table(
  id uuid,
  number text,
  type text,
  vehicle_length text,
  status vehicle_status,
  vendor_id uuid,
  vendor_name text,
  leased_driver_name text,
  leased_driver_phone text,
  current_trip_id uuid,
  policy_id uuid,
  driver_da_per_day numeric,
  vehicle_rent_per_day numeric,
  mileage_min numeric,
  mileage_max numeric,
  default_terrain route_terrain,
  fuel_variance_threshold_percent numeric,
  unofficial_gate_cap numeric,
  dala_kharcha_cap numeric,
  parking_cap numeric,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  v_role text;
  v_vehicle_id uuid;
begin
  select p.role into v_role
  from public.profiles p
  where p.id = p_actor and p.active = true;

  if v_role is null or v_role not in ('admin', 'super_admin') then
    raise exception 'forbidden';
  end if;

  if p_number is null or trim(p_number) = '' then
    raise exception 'number_required';
  end if;

  if p_type is null or trim(p_type) = '' then
    raise exception 'type_required';
  end if;

  if p_leased_driver_name is null or trim(p_leased_driver_name) = '' then
    raise exception 'leased_driver_name_required';
  end if;

  if p_leased_driver_phone is null or trim(p_leased_driver_phone) = '' then
    raise exception 'leased_driver_phone_required';
  end if;

  if p_mileage_min > p_mileage_max then
    raise exception 'mileage_min_exceeds_max';
  end if;

  insert into public.vehicles (
    number,
    type,
    vehicle_length,
    ownership_type,
    vendor_id,
    leased_driver_name,
    leased_driver_phone,
    status
  )
  values (
    upper(trim(p_number)),
    trim(p_type),
    nullif(trim(coalesce(p_vehicle_length, '')), ''),
    'leased',
    p_vendor_id,
    nullif(trim(coalesce(p_leased_driver_name, '')), ''),
    nullif(trim(coalesce(p_leased_driver_phone, '')), ''),
    'available'
  )
  returning vehicles.id into v_vehicle_id;

  insert into public.leased_vehicle_policies (
    vehicle_id,
    driver_da_per_day,
    vehicle_rent_per_day,
    mileage_min,
    mileage_max,
    default_terrain,
    fuel_variance_threshold_percent,
    unofficial_gate_cap,
    dala_kharcha_cap,
    parking_cap
  )
  values (
    v_vehicle_id,
    p_driver_da_per_day,
    p_vehicle_rent_per_day,
    p_mileage_min,
    p_mileage_max,
    p_default_terrain,
    p_fuel_variance_threshold_percent,
    p_unofficial_gate_cap,
    p_dala_kharcha_cap,
    p_parking_cap
  );

  return query
  select
    v.id,
    v.number,
    v.type,
    v.vehicle_length,
    v.status,
    v.vendor_id,
    vn.name as vendor_name,
    v.leased_driver_name,
    v.leased_driver_phone,
    v.current_trip_id,
    lp.id as policy_id,
    lp.driver_da_per_day,
    lp.vehicle_rent_per_day,
    lp.mileage_min,
    lp.mileage_max,
    lp.default_terrain,
    lp.fuel_variance_threshold_percent,
    lp.unofficial_gate_cap,
    lp.dala_kharcha_cap,
    lp.parking_cap,
    v.created_at,
    v.updated_at
  from public.vehicles v
  left join public.leased_vehicle_policies lp on lp.vehicle_id = v.id
  left join public.vendors vn on vn.id = v.vendor_id
  where v.id = v_vehicle_id;
end;
$$;

create or replace function public.leased_vehicle_update_v3(
  p_actor uuid,
  p_vehicle_id uuid,
  p_number text default null,
  p_type text default null,
  p_vehicle_length text default null,
  p_vendor_id uuid default null,
  p_leased_driver_name text default null,
  p_leased_driver_phone text default null,
  p_status vehicle_status default null
)
returns table(
  id uuid,
  number text,
  type text,
  vehicle_length text,
  status vehicle_status,
  vendor_id uuid,
  vendor_name text,
  leased_driver_name text,
  leased_driver_phone text,
  current_trip_id uuid,
  policy_id uuid,
  driver_da_per_day numeric,
  vehicle_rent_per_day numeric,
  mileage_min numeric,
  mileage_max numeric,
  default_terrain route_terrain,
  fuel_variance_threshold_percent numeric,
  unofficial_gate_cap numeric,
  dala_kharcha_cap numeric,
  parking_cap numeric,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  v_role text;
  v_ownership text;
begin
  select p.role into v_role
  from public.profiles p
  where p.id = p_actor and p.active = true;

  if v_role is null or v_role not in ('admin', 'super_admin') then
    raise exception 'forbidden';
  end if;

  select v.ownership_type::text
  into v_ownership
  from public.vehicles v
  where v.id = p_vehicle_id;

  if v_ownership is null or v_ownership != 'leased' then
    raise exception 'not_found';
  end if;

  update public.vehicles v
  set
    number = coalesce(upper(trim(nullif(p_number, ''))), v.number),
    type = coalesce(trim(nullif(p_type, '')), v.type),
    vehicle_length = case
      when p_vehicle_length is null then v.vehicle_length
      else nullif(trim(p_vehicle_length), '')
    end,
    vendor_id = coalesce(p_vendor_id, v.vendor_id),
    leased_driver_name = case
      when p_leased_driver_name is null then v.leased_driver_name
      else nullif(trim(coalesce(p_leased_driver_name, '')), '')
    end,
    leased_driver_phone = case
      when p_leased_driver_phone is null then v.leased_driver_phone
      else nullif(trim(coalesce(p_leased_driver_phone, '')), '')
    end,
    status = coalesce(p_status, v.status)
  where v.id = p_vehicle_id;

  return query
  select
    v2.id,
    v2.number,
    v2.type,
    v2.vehicle_length,
    v2.status,
    v2.vendor_id,
    vn.name as vendor_name,
    v2.leased_driver_name,
    v2.leased_driver_phone,
    v2.current_trip_id,
    lp.id as policy_id,
    coalesce(lp.driver_da_per_day, 0),
    coalesce(lp.vehicle_rent_per_day, 0),
    coalesce(lp.mileage_min, 0),
    coalesce(lp.mileage_max, 0),
    coalesce(lp.default_terrain, 'plain'::route_terrain),
    coalesce(lp.fuel_variance_threshold_percent, 10),
    lp.unofficial_gate_cap,
    lp.dala_kharcha_cap,
    lp.parking_cap,
    v2.created_at,
    v2.updated_at
  from public.vehicles v2
  left join public.leased_vehicle_policies lp on lp.vehicle_id = v2.id
  left join public.vendors vn on vn.id = v2.vendor_id
  where v2.id = p_vehicle_id;
end;
$$;

create or replace function public.trip_available_vehicles_v3(
  p_actor_user_id uuid,
  p_vehicle_type text default null,
  p_search text default null,
  p_limit integer default 50,
  p_offset integer default 0
)
returns jsonb
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  v_role text;
  v_result jsonb;
begin
  v_role := trip_assert_actor_v1(p_actor_user_id);

  if v_role not in ('operations_vehicles', 'operations_consigner', 'admin', 'super_admin') then
    raise exception 'permission_denied';
  end if;

  select coalesce(jsonb_agg(row_data), '[]'::jsonb) into v_result
  from (
    select jsonb_build_object(
      'id', v.id,
      'number', v.number,
      'type', v.type,
      'vehicle_length', v.vehicle_length,
      'ownership_type', v.ownership_type::text,
      'vendor_id', v.vendor_id,
      'vendor_name', coalesce(vn.name, ''),
      'is_owner_driver', coalesce(vd_owner.exists_flag, false),
      'leased_driver_name', v.leased_driver_name,
      'leased_driver_phone', v.leased_driver_phone,
      'current_driver_id', v.current_driver_id,
      'current_driver_name', coalesce(vd_current.full_name, '')
    ) as row_data
    from public.vehicles v
    left join public.vendors vn on vn.id = v.vendor_id
    left join public.vendor_drivers vd_current on vd_current.id = v.current_driver_id
    left join lateral (
      select exists (
        select 1
        from public.vendor_drivers vd
        where vd.vendor_id = v.vendor_id
          and vd.is_owner_driver = true
          and vd.active = true
      ) as exists_flag
    ) vd_owner on true
    where v.status = 'available'
      and (p_vehicle_type is null or p_vehicle_type = '' or lower(v.type) = lower(p_vehicle_type))
      and (
        p_search is null or p_search = ''
        or v.number ilike '%' || p_search || '%'
        or v.type ilike '%' || p_search || '%'
        or coalesce(vn.name, '') ilike '%' || p_search || '%'
        or coalesce(vd_current.full_name, '') ilike '%' || p_search || '%'
        or coalesce(v.leased_driver_name, '') ilike '%' || p_search || '%'
        or coalesce(v.leased_driver_phone, '') ilike '%' || p_search || '%'
      )
    order by v.ownership_type, v.number
    limit least(greatest(coalesce(p_limit, 50), 1), 200)
    offset greatest(coalesce(p_offset, 0), 0)
  ) sub;

  return v_result;
end;
$$;

create or replace function public.trip_assign_vehicle_v3(
  p_actor_user_id uuid,
  p_trip_id uuid,
  p_vehicle_id uuid,
  p_driver_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  v_role text;
  v_trip record;
  v_vehicle record;
  v_driver record;
  v_started_at timestamptz;
  v_vendor_name text;
  v_trip_driver_name text;
begin
  v_role := trip_assert_actor_v1(p_actor_user_id);

  if v_role not in ('operations_vehicles', 'admin', 'super_admin') then
    raise exception 'permission_denied';
  end if;

  select id, trip_code, current_stage
  into v_trip
  from public.trips
  where id = p_trip_id;

  if v_trip.id is null then
    raise exception 'trip_not_found';
  end if;

  if v_trip.current_stage != 'confirmed' then
    raise exception 'trip_not_confirmed';
  end if;

  select v.id, v.number, v.status, v.ownership_type, v.vendor_id, v.current_driver_id, v.leased_driver_name
  into v_vehicle
  from public.vehicles v
  where v.id = p_vehicle_id;

  if v_vehicle.id is null then
    raise exception 'vehicle_not_found';
  end if;

  if v_vehicle.status != 'available' then
    raise exception 'vehicle_not_available';
  end if;

  if v_vehicle.ownership_type = 'vendor' then
    if v_vehicle.vendor_id is null then
      raise exception 'vehicle_vendor_missing';
    end if;

    if p_driver_id is not null then
      select id, vendor_id, full_name, active
      into v_driver
      from public.vendor_drivers
      where id = p_driver_id;

      if v_driver.id is null then
        raise exception 'driver_not_found';
      end if;

      if v_driver.active is not true then
        raise exception 'driver_inactive';
      end if;

      if v_driver.vendor_id <> v_vehicle.vendor_id then
        raise exception 'driver_vendor_mismatch';
      end if;
    elsif v_vehicle.current_driver_id is not null then
      select id, vendor_id, full_name, active
      into v_driver
      from public.vendor_drivers
      where id = v_vehicle.current_driver_id;

      if v_driver.id is null or v_driver.active is not true or v_driver.vendor_id <> v_vehicle.vendor_id then
        v_driver := null;
      end if;
    end if;

    if v_driver.id is null then
      raise exception 'driver_required_for_vendor_vehicle';
    end if;

    if v_vehicle.current_driver_id is distinct from v_driver.id then
      update public.vehicle_driver_assignments
      set unassigned_at = now()
      where vehicle_id = p_vehicle_id
        and unassigned_at is null;

      insert into public.vehicle_driver_assignments (vehicle_id, driver_id, assigned_by_id, notes)
      values (p_vehicle_id, v_driver.id, p_actor_user_id, 'Assigned during trip vehicle assignment');

      update public.vehicles
      set current_driver_id = v_driver.id, updated_at = now()
      where id = p_vehicle_id;
    end if;
  else
    v_driver := null;
  end if;

  v_trip_driver_name := case
    when v_vehicle.ownership_type = 'vendor' then v_driver.full_name
    else nullif(trim(coalesce(v_vehicle.leased_driver_name, '')), '')
  end;

  if v_vehicle.vendor_id is not null then
    select vn.name into v_vendor_name from public.vendors vn where vn.id = v_vehicle.vendor_id;
  end if;

  update public.trips
  set
    current_stage = 'vehicle_assigned',
    vehicle_id = p_vehicle_id,
    vehicle_number = v_vehicle.number,
    vendor_id = v_vehicle.vendor_id,
    driver_id = case when v_vehicle.ownership_type = 'vendor' then v_driver.id else null end,
    driver_name = v_trip_driver_name,
    leased_flag = (v_vehicle.ownership_type = 'leased'),
    started_at = coalesce(started_at, now()),
    started_by_id = p_actor_user_id,
    updated_at = now()
  where id = p_trip_id
  returning started_at into v_started_at;

  update public.vehicles
  set status = 'on_trip', current_trip_id = p_trip_id, updated_at = now()
  where id = p_vehicle_id;

  update public.trip_owners
  set operations_vehicles_owner_id = p_actor_user_id, updated_at = now()
  where trip_id = p_trip_id;

  insert into public.trip_stage_history (trip_id, from_stage, to_stage, actor_id)
  values (p_trip_id, 'confirmed', 'vehicle_assigned', p_actor_user_id);

  return jsonb_build_object(
    'trip_id', v_trip.id,
    'trip_code', v_trip.trip_code,
    'vehicle_number', v_vehicle.number,
    'ops_vehicles_owner_id', p_actor_user_id,
    'started_at', v_started_at,
    'driver_id', case when v_vehicle.ownership_type = 'vendor' then v_driver.id else null end,
    'driver_name', v_trip_driver_name,
    'vendor_name', coalesce(v_vendor_name, '')
  );
end;
$$;

grant execute on function public.leased_vehicle_list_v3(uuid, text, text, integer, integer) to authenticated;
grant execute on function public.leased_vehicle_get_v3(uuid, uuid) to authenticated;
grant execute on function public.leased_vehicle_create_v3(uuid, text, text, text, uuid, text, text, numeric, numeric, numeric, numeric, route_terrain, numeric, numeric, numeric, numeric) to authenticated;
grant execute on function public.leased_vehicle_update_v3(uuid, uuid, text, text, text, uuid, text, text, vehicle_status) to authenticated;
grant execute on function public.trip_available_vehicles_v3(uuid, text, text, integer, integer) to authenticated;

notify pgrst, 'reload schema';

commit;
