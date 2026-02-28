begin;

create table if not exists public.vendor_drivers (
  id uuid primary key default gen_random_uuid(),
  vendor_id uuid not null references public.vendors(id) on delete cascade,
  full_name text not null,
  phone text not null,
  alternate_phone text,
  license_number text,
  license_expiry date,
  is_owner_driver boolean not null default false,
  active boolean not null default true,
  notes text,
  created_by_id uuid not null references public.profiles(id),
  updated_by_id uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint vendor_drivers_full_name_chk check (length(btrim(full_name)) > 0),
  constraint vendor_drivers_phone_chk check (length(btrim(phone)) > 0)
);

create index if not exists idx_vendor_drivers_vendor_active_created
  on public.vendor_drivers (vendor_id, active, created_at desc);

create index if not exists idx_vendor_drivers_phone
  on public.vendor_drivers (phone);

create table if not exists public.vehicle_driver_assignments (
  id uuid primary key default gen_random_uuid(),
  vehicle_id uuid not null references public.vehicles(id) on delete cascade,
  driver_id uuid not null references public.vendor_drivers(id) on delete cascade,
  assigned_at timestamptz not null default now(),
  unassigned_at timestamptz,
  assigned_by_id uuid not null references public.profiles(id),
  notes text,
  created_at timestamptz not null default now()
);

create unique index if not exists uq_vehicle_driver_assignments_active_vehicle
  on public.vehicle_driver_assignments (vehicle_id)
  where unassigned_at is null;

alter table public.vehicles
  add column if not exists current_driver_id uuid;

alter table public.trips
  add column if not exists driver_id uuid;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where connamespace = 'public'::regnamespace
      and conname = 'vehicles_current_driver_id_fkey'
  ) then
    alter table public.vehicles
      add constraint vehicles_current_driver_id_fkey
      foreign key (current_driver_id)
      references public.vendor_drivers(id)
      on delete set null;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where connamespace = 'public'::regnamespace
      and conname = 'trips_driver_id_fkey'
  ) then
    alter table public.trips
      add constraint trips_driver_id_fkey
      foreign key (driver_id)
      references public.vendor_drivers(id)
      on delete set null;
  end if;
end;
$$;

create index if not exists idx_vehicles_current_driver_id
  on public.vehicles (current_driver_id);

create index if not exists idx_trips_driver_id
  on public.trips (driver_id);

create or replace function public.fleet_assert_actor_v1(
  p_actor uuid,
  p_require_write boolean default false
)
returns role_type
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  v_role role_type;
begin
  if p_actor is null then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select p.role
  into v_role
  from public.profiles p
  where p.id = p_actor
    and p.active = true;

  if v_role is null then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if p_require_write and v_role not in ('super_admin', 'admin', 'operations_vehicles') then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  return v_role;
end;
$$;

create or replace function public.vendor_get_v1(
  p_actor uuid,
  p_vendor_id uuid
)
returns table (
  id uuid,
  name text,
  contact_phone text,
  kyc_status kyc_status,
  active boolean,
  notes text,
  vehicles_count bigint,
  drivers_count bigint,
  owner_driver_flag boolean
)
language plpgsql
security definer
set search_path = 'public'
as $$
begin
  perform public.fleet_assert_actor_v1(p_actor, false);

  return query
  select
    vn.id,
    vn.name,
    vn.contact_phone,
    vn.kyc_status,
    vn.active,
    vn.notes,
    (
      select count(*)::bigint from public.vehicles v where v.vendor_id = vn.id
    ) as vehicles_count,
    (
      select count(*)::bigint from public.vendor_drivers vd where vd.vendor_id = vn.id and vd.active = true
    ) as drivers_count,
    exists (
      select 1 from public.vendor_drivers vd where vd.vendor_id = vn.id and vd.active = true and vd.is_owner_driver = true
    ) as owner_driver_flag
  from public.vendors vn
  where vn.id = p_vendor_id;
end;
$$;

create or replace function public.vendor_driver_list_v1(
  p_actor uuid,
  p_vendor_id uuid,
  p_search text default null,
  p_limit integer default 200,
  p_offset integer default 0
)
returns table (
  id uuid,
  vendor_id uuid,
  full_name text,
  phone text,
  alternate_phone text,
  is_owner_driver boolean,
  active boolean,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = 'public'
as $$
begin
  perform public.fleet_assert_actor_v1(p_actor, false);

  return query
  select
    vd.id,
    vd.vendor_id,
    vd.full_name,
    vd.phone,
    vd.alternate_phone,
    vd.is_owner_driver,
    vd.active,
    vd.created_at,
    vd.updated_at
  from public.vendor_drivers vd
  where vd.vendor_id = p_vendor_id
    and (
      p_search is null
      or vd.full_name ilike '%' || p_search || '%'
      or vd.phone ilike '%' || p_search || '%'
    )
  order by vd.is_owner_driver desc, vd.active desc, lower(vd.full_name), vd.created_at desc
  limit least(greatest(coalesce(p_limit, 200), 1), 500)
  offset greatest(coalesce(p_offset, 0), 0);
end;
$$;

create or replace function public.vendor_driver_create_v1(
  p_actor uuid,
  p_vendor_id uuid,
  p_full_name text,
  p_phone text,
  p_alternate_phone text default null,
  p_is_owner_driver boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  v_row public.vendor_drivers;
begin
  perform public.fleet_assert_actor_v1(p_actor, true);

  if not exists (select 1 from public.vendors v where v.id = p_vendor_id and v.active = true) then
    raise exception 'vendor_not_found';
  end if;

  if nullif(btrim(coalesce(p_full_name, '')), '') is null then
    raise exception 'full_name_required' using errcode = '22023';
  end if;

  if nullif(btrim(coalesce(p_phone, '')), '') is null then
    raise exception 'phone_required' using errcode = '22023';
  end if;

  insert into public.vendor_drivers (
    vendor_id,
    full_name,
    phone,
    alternate_phone,
    is_owner_driver,
    active,
    created_by_id,
    updated_by_id
  )
  values (
    p_vendor_id,
    btrim(p_full_name),
    btrim(p_phone),
    nullif(btrim(coalesce(p_alternate_phone, '')), ''),
    coalesce(p_is_owner_driver, false),
    true,
    p_actor,
    p_actor
  )
  returning * into v_row;

  return jsonb_build_object(
    'id', v_row.id,
    'vendor_id', v_row.vendor_id,
    'full_name', v_row.full_name,
    'phone', v_row.phone,
    'alternate_phone', v_row.alternate_phone,
    'is_owner_driver', v_row.is_owner_driver,
    'active', v_row.active
  );
end;
$$;

create or replace function public.vendor_vehicle_list_v1(
  p_actor uuid,
  p_vendor_id uuid,
  p_search text default null,
  p_limit integer default 200,
  p_offset integer default 0
)
returns table (
  id uuid,
  number text,
  type text,
  vehicle_length text,
  ownership_type ownership_type,
  status vehicle_status,
  vendor_id uuid,
  current_trip_id uuid,
  current_driver_id uuid,
  current_driver_name text,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = 'public'
as $$
begin
  perform public.fleet_assert_actor_v1(p_actor, false);

  return query
  select
    v.id,
    v.number,
    v.type,
    v.vehicle_length,
    v.ownership_type,
    v.status,
    v.vendor_id,
    v.current_trip_id,
    v.current_driver_id,
    vd.full_name as current_driver_name,
    v.created_at,
    v.updated_at
  from public.vehicles v
  left join public.vendor_drivers vd on vd.id = v.current_driver_id
  where v.vendor_id = p_vendor_id
    and v.ownership_type = 'vendor'
    and (
      p_search is null
      or v.number ilike '%' || p_search || '%'
      or v.type ilike '%' || p_search || '%'
      or coalesce(vd.full_name, '') ilike '%' || p_search || '%'
    )
  order by v.created_at desc
  limit least(greatest(coalesce(p_limit, 200), 1), 500)
  offset greatest(coalesce(p_offset, 0), 0);
end;
$$;

create or replace function public.vendor_vehicle_create_v1(
  p_actor uuid,
  p_vendor_id uuid,
  p_number text,
  p_type text,
  p_vehicle_length text default null
)
returns jsonb
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  v_row public.vehicles;
begin
  perform public.fleet_assert_actor_v1(p_actor, true);

  if not exists (select 1 from public.vendors v where v.id = p_vendor_id and v.active = true) then
    raise exception 'vendor_not_found';
  end if;

  if nullif(btrim(coalesce(p_number, '')), '') is null then
    raise exception 'vehicle_number_required' using errcode = '22023';
  end if;

  if nullif(btrim(coalesce(p_type, '')), '') is null then
    raise exception 'vehicle_type_required' using errcode = '22023';
  end if;

  insert into public.vehicles (
    number,
    type,
    vehicle_length,
    ownership_type,
    vendor_id,
    status
  )
  values (
    upper(btrim(p_number)),
    btrim(p_type),
    nullif(btrim(coalesce(p_vehicle_length, '')), ''),
    'vendor',
    p_vendor_id,
    'available'
  )
  returning * into v_row;

  return jsonb_build_object(
    'id', v_row.id,
    'number', v_row.number,
    'type', v_row.type,
    'vehicle_length', v_row.vehicle_length,
    'status', v_row.status::text,
    'vendor_id', v_row.vendor_id
  );
end;
$$;

create or replace function public.vehicle_driver_assign_v1(
  p_actor uuid,
  p_vehicle_id uuid,
  p_driver_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  v_vehicle record;
  v_driver record;
begin
  perform public.fleet_assert_actor_v1(p_actor, true);

  select id, vendor_id, ownership_type
  into v_vehicle
  from public.vehicles
  where id = p_vehicle_id;

  if v_vehicle.id is null then
    raise exception 'vehicle_not_found';
  end if;

  if v_vehicle.ownership_type <> 'vendor' or v_vehicle.vendor_id is null then
    raise exception 'vehicle_not_vendor';
  end if;

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

  update public.vehicle_driver_assignments
  set unassigned_at = now()
  where vehicle_id = p_vehicle_id
    and unassigned_at is null;

  insert into public.vehicle_driver_assignments (
    vehicle_id,
    driver_id,
    assigned_by_id
  )
  values (
    p_vehicle_id,
    p_driver_id,
    p_actor
  );

  update public.vehicles
  set
    current_driver_id = p_driver_id,
    updated_at = now()
  where id = p_vehicle_id;

  return jsonb_build_object(
    'vehicle_id', p_vehicle_id,
    'driver_id', p_driver_id,
    'driver_name', v_driver.full_name
  );
end;
$$;

create or replace function public.trip_available_vehicles_v2(
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

  select v.id, v.number, v.status, v.ownership_type, v.vendor_id, v.current_driver_id
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
    driver_name = case
      when v_vehicle.ownership_type = 'vendor' then v_driver.full_name
      else null
    end,
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
    'driver_name', case when v_vehicle.ownership_type = 'vendor' then v_driver.full_name else null end,
    'vendor_name', coalesce(v_vendor_name, '')
  );
end;
$$;

create or replace function public.vehicle_lead_onboard_v2(
  p_actor_user_id uuid,
  p_lead_id uuid,
  p_onboard_mode text,
  p_vendor_name text default null,
  p_vendor_phone text default null,
  p_vendor_notes text default null,
  p_existing_vendor_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  v_lead record;
  v_vendor_id uuid;
  v_vehicle_id uuid;
  v_driver_id uuid;
  v_actor_role role_type;
begin
  v_actor_role := vehicle_crm_assert_actor_role_v1(p_actor_user_id);

  select * into v_lead
  from public.vehicle_leads
  where id = p_lead_id
  for update;

  if v_lead.id is null then
    raise exception 'not_found: vehicle lead does not exist' using errcode = 'P0002';
  end if;

  if v_actor_role = 'sales_vehicles' and v_lead.added_by_id <> p_actor_user_id then
    raise exception 'forbidden: not lead owner' using errcode = '42501';
  end if;

  if v_lead.stage in ('onboarded', 'rejected') then
    raise exception 'already_in_stage: lead is already in stage %', v_lead.stage using errcode = '22023';
  end if;

  if v_lead.converted_vendor_id is not null then
    raise exception 'lead_already_converted: vendor already created for this lead' using errcode = '22023';
  end if;

  if nullif(btrim(coalesce(v_lead.vehicle_registration, '')), '') is null then
    raise exception 'validation_error: vehicle_registration is required for onboarding' using errcode = '22023';
  end if;

  if coalesce(p_onboard_mode, '') = 'attach_to_existing_vendor' then
    if p_existing_vendor_id is null then
      raise exception 'existing_vendor_id_required' using errcode = '22023';
    end if;

    select v.id
    into v_vendor_id
    from public.vendors v
    where v.id = p_existing_vendor_id
      and v.active = true;

    if v_vendor_id is null then
      raise exception 'vendor_not_found' using errcode = 'P0002';
    end if;
  else
    if nullif(btrim(coalesce(p_vendor_name, '')), '') is null then
      raise exception 'vendor_name_required' using errcode = '22023';
    end if;

    if nullif(btrim(coalesce(p_vendor_phone, '')), '') is null then
      raise exception 'vendor_phone_required' using errcode = '22023';
    end if;

    insert into public.vendors (name, contact_phone, kyc_status, notes)
    values (
      btrim(p_vendor_name),
      btrim(p_vendor_phone),
      'pending',
      nullif(btrim(coalesce(p_vendor_notes, '')), '')
    )
    returning id into v_vendor_id;
  end if;

  insert into public.vehicles (
    number,
    type,
    vehicle_length,
    ownership_type,
    vendor_id,
    status
  )
  values (
    upper(btrim(v_lead.vehicle_registration)),
    coalesce(nullif(btrim(coalesce(v_lead.vehicle_type, '')), ''), 'unknown'),
    nullif(btrim(coalesce(v_lead.vehicle_length, '')), ''),
    'vendor',
    v_vendor_id,
    'available'
  )
  returning id into v_vehicle_id;

  insert into public.vendor_drivers (
    vendor_id,
    full_name,
    phone,
    alternate_phone,
    is_owner_driver,
    active,
    created_by_id,
    updated_by_id
  )
  values (
    v_vendor_id,
    btrim(v_lead.driver_name),
    btrim(v_lead.mobile),
    nullif(btrim(coalesce(v_lead.alternate_contact, '')), ''),
    coalesce(v_lead.is_owner_cum_driver, false),
    true,
    p_actor_user_id,
    p_actor_user_id
  )
  returning id into v_driver_id;

  insert into public.vehicle_driver_assignments (
    vehicle_id,
    driver_id,
    assigned_by_id,
    notes
  )
  values (
    v_vehicle_id,
    v_driver_id,
    p_actor_user_id,
    'Initial assignment from onboarding'
  );

  update public.vehicles
  set current_driver_id = v_driver_id, updated_at = now()
  where id = v_vehicle_id;

  update public.vehicle_leads
  set stage = 'onboarded', converted_vendor_id = v_vendor_id, updated_at = now()
  where id = p_lead_id;

  insert into public.vehicle_lead_activities (vehicle_lead_id, type, description, created_by_id)
  values (
    p_lead_id,
    'stage_change',
    format('Lead onboarded — vendor %s, vehicle %s and driver %s created', v_vendor_id, v_vehicle_id, v_driver_id),
    p_actor_user_id
  );

  return jsonb_build_object(
    'lead_id', p_lead_id,
    'vendor_id', v_vendor_id,
    'vehicle_id', v_vehicle_id,
    'driver_id', v_driver_id
  );
end;
$$;

insert into public.vendor_drivers (
  vendor_id,
  full_name,
  phone,
  alternate_phone,
  is_owner_driver,
  active,
  notes,
  created_by_id,
  updated_by_id,
  created_at,
  updated_at
)
select
  vl.converted_vendor_id,
  btrim(vl.driver_name),
  btrim(vl.mobile),
  nullif(btrim(coalesce(vl.alternate_contact, '')), ''),
  coalesce(vl.is_owner_cum_driver, false),
  true,
  'Backfilled from vehicle lead',
  vl.added_by_id,
  vl.added_by_id,
  coalesce(vl.created_at, now()),
  now()
from public.vehicle_leads vl
where vl.converted_vendor_id is not null
  and nullif(btrim(coalesce(vl.driver_name, '')), '') is not null
  and nullif(btrim(coalesce(vl.mobile, '')), '') is not null
  and not exists (
    select 1
    from public.vendor_drivers vd
    where vd.vendor_id = vl.converted_vendor_id
      and lower(btrim(vd.phone)) = lower(btrim(vl.mobile))
      and lower(btrim(vd.full_name)) = lower(btrim(vl.driver_name))
  );

update public.vehicles v
set current_driver_id = vd.id,
    updated_at = now()
from public.vendor_drivers vd
where v.vendor_id = vd.vendor_id
  and v.ownership_type = 'vendor'
  and v.current_driver_id is null
  and vd.is_owner_driver = true
  and vd.active = true;

grant execute on function public.fleet_assert_actor_v1(uuid, boolean) to authenticated;
grant execute on function public.vendor_get_v1(uuid, uuid) to authenticated;
grant execute on function public.vendor_driver_list_v1(uuid, uuid, text, integer, integer) to authenticated;
grant execute on function public.vendor_driver_create_v1(uuid, uuid, text, text, text, boolean) to authenticated;
grant execute on function public.vendor_vehicle_list_v1(uuid, uuid, text, integer, integer) to authenticated;
grant execute on function public.vendor_vehicle_create_v1(uuid, uuid, text, text, text) to authenticated;
grant execute on function public.vehicle_driver_assign_v1(uuid, uuid, uuid) to authenticated;
grant execute on function public.trip_available_vehicles_v2(uuid, text, text, integer, integer) to authenticated;
grant execute on function public.trip_assign_vehicle_v3(uuid, uuid, uuid, uuid) to authenticated;
grant execute on function public.vehicle_lead_onboard_v2(uuid, uuid, text, text, text, text, uuid) to authenticated;

commit;
