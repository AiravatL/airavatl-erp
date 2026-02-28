begin;

alter table public.vehicles
  add column if not exists vehicle_length text;

create or replace function public.leased_vehicle_list_v2(
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
    )
  order by v.created_at desc
  limit least(p_limit, 500)
  offset greatest(p_offset, 0);
end;
$$;

create or replace function public.leased_vehicle_get_v2(
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

create or replace function public.leased_vehicle_create_v2(
  p_actor uuid,
  p_number text,
  p_type text,
  p_vehicle_length text default null,
  p_vendor_id uuid default null,
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

  if p_mileage_min > p_mileage_max then
    raise exception 'mileage_min_exceeds_max';
  end if;

  insert into public.vehicles (number, type, vehicle_length, ownership_type, vendor_id, status)
  values (
    upper(trim(p_number)),
    trim(p_type),
    nullif(trim(coalesce(p_vehicle_length, '')), ''),
    'leased',
    p_vendor_id,
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

create or replace function public.leased_vehicle_update_v2(
  p_actor uuid,
  p_vehicle_id uuid,
  p_number text default null,
  p_type text default null,
  p_vehicle_length text default null,
  p_vendor_id uuid default null,
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

grant execute on function public.leased_vehicle_list_v2(uuid, text, text, integer, integer) to authenticated;
grant execute on function public.leased_vehicle_get_v2(uuid, uuid) to authenticated;
grant execute on function public.leased_vehicle_create_v2(uuid, text, text, text, uuid, numeric, numeric, numeric, numeric, route_terrain, numeric, numeric, numeric, numeric) to authenticated;
grant execute on function public.leased_vehicle_update_v2(uuid, uuid, text, text, text, uuid, vehicle_status) to authenticated;

notify pgrst, 'reload schema';

commit;
