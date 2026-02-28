begin;

create or replace function public.trip_request_create_v1(
  p_actor_user_id uuid,
  p_customer_id uuid,
  p_pickup_location text default null,
  p_drop_location text default null,
  p_vehicle_type text default null,
  p_weight_estimate numeric default null,
  p_planned_km integer default null,
  p_schedule_date date default null,
  p_trip_amount numeric default null,
  p_internal_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  v_role text;
  v_trip_id uuid;
  v_trip_code text;
  v_route text;
  v_customer_owner uuid;
  v_vehicle_valid boolean;
  v_vehicle_type text;
  v_vehicle_type_id uuid;
begin
  v_role := trip_assert_actor_v1(p_actor_user_id);

  if v_role not in ('sales_consigner', 'operations_consigner', 'admin', 'super_admin') then
    raise exception 'permission_denied';
  end if;

  if nullif(trim(coalesce(p_vehicle_type, '')), '') is null then
    raise exception 'vehicle_type_required';
  end if;

  select vm.is_valid, vm.normalized_vehicle_type
  into v_vehicle_valid, v_vehicle_type
  from public.vehicle_master_validate_selection_v1(trim(p_vehicle_type), null, false) vm
  limit 1;

  if coalesce(v_vehicle_valid, false) is false then
    raise exception 'unknown_vehicle_type';
  end if;

  select t.id, t.name
  into v_vehicle_type_id, v_vehicle_type
  from public.vehicle_master_types t
  where lower(btrim(t.name)) = lower(btrim(coalesce(v_vehicle_type, p_vehicle_type)))
  limit 1;

  if v_vehicle_type_id is null then
    raise exception 'unknown_vehicle_type';
  end if;

  if v_role = 'sales_consigner' then
    select sales_consigner_owner_id into v_customer_owner
    from customers where id = p_customer_id and active = true;

    if v_customer_owner is null then
      raise exception 'customer_not_found';
    end if;
    if v_customer_owner != p_actor_user_id then
      raise exception 'not_customer_owner';
    end if;
  else
    if not exists (select 1 from customers where id = p_customer_id and active = true) then
      raise exception 'customer_not_found';
    end if;
  end if;

  v_trip_code := trip_generate_code_v1();

  v_route := null;
  if p_pickup_location is not null and p_drop_location is not null then
    v_route := p_pickup_location || ' - ' || p_drop_location;
  end if;

  insert into trips (
    trip_code, customer_id, current_stage, leased_flag,
    pickup_location, drop_location, route, vehicle_type, vehicle_type_id,
    weight_estimate, planned_km, schedule_date,
    trip_amount, requested_by_id, internal_notes
  ) values (
    v_trip_code, p_customer_id, 'request_received', false,
    p_pickup_location, p_drop_location, v_route, v_vehicle_type, v_vehicle_type_id,
    p_weight_estimate, p_planned_km, p_schedule_date,
    p_trip_amount, p_actor_user_id, p_internal_notes
  )
  returning id into v_trip_id;

  insert into trip_owners (trip_id, sales_consigner_owner_id)
  values (
    v_trip_id,
    case when v_role = 'sales_consigner' then p_actor_user_id else null end
  );

  insert into trip_stage_history (trip_id, from_stage, to_stage, actor_id)
  values (v_trip_id, null, 'request_received', p_actor_user_id);

  return jsonb_build_object('trip_id', v_trip_id, 'trip_code', v_trip_code);
end;
$$;

create or replace function public.trip_request_create_v1(
  p_actor_user_id uuid,
  p_customer_id uuid,
  p_pickup_location text default null,
  p_drop_location text default null,
  p_vehicle_type text default null,
  p_weight_estimate numeric default null,
  p_planned_km integer default null,
  p_schedule_date date default null,
  p_trip_amount numeric default null,
  p_internal_notes text default null,
  p_pickup_date date default null
)
returns jsonb
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  v_role text;
  v_trip_id uuid;
  v_trip_code text;
  v_route text;
  v_customer_owner uuid;
  v_vehicle_valid boolean;
  v_vehicle_type text;
  v_vehicle_type_id uuid;
begin
  v_role := trip_assert_actor_v1(p_actor_user_id);

  if v_role not in ('sales_consigner', 'operations_consigner', 'admin', 'super_admin') then
    raise exception 'permission_denied';
  end if;

  if nullif(trim(coalesce(p_vehicle_type, '')), '') is null then
    raise exception 'vehicle_type_required';
  end if;

  select vm.is_valid, vm.normalized_vehicle_type
  into v_vehicle_valid, v_vehicle_type
  from public.vehicle_master_validate_selection_v1(trim(p_vehicle_type), null, false) vm
  limit 1;

  if coalesce(v_vehicle_valid, false) is false then
    raise exception 'unknown_vehicle_type';
  end if;

  select t.id, t.name
  into v_vehicle_type_id, v_vehicle_type
  from public.vehicle_master_types t
  where lower(btrim(t.name)) = lower(btrim(coalesce(v_vehicle_type, p_vehicle_type)))
  limit 1;

  if v_vehicle_type_id is null then
    raise exception 'unknown_vehicle_type';
  end if;

  if v_role = 'sales_consigner' then
    select sales_consigner_owner_id into v_customer_owner
    from customers where id = p_customer_id and active = true;
    if v_customer_owner is null then raise exception 'customer_not_found'; end if;
    if v_customer_owner != p_actor_user_id then raise exception 'not_customer_owner'; end if;
  else
    if not exists (select 1 from customers where id = p_customer_id and active = true) then
      raise exception 'customer_not_found';
    end if;
  end if;

  v_trip_code := trip_generate_code_v1();

  v_route := null;
  if p_pickup_location is not null and p_drop_location is not null then
    v_route := p_pickup_location || ' - ' || p_drop_location;
  end if;

  insert into trips (
    trip_code, customer_id, current_stage, leased_flag,
    pickup_location, drop_location, route, vehicle_type, vehicle_type_id,
    weight_estimate, planned_km, schedule_date,
    trip_amount, requested_by_id, internal_notes, pickup_date
  ) values (
    v_trip_code, p_customer_id, 'request_received', false,
    p_pickup_location, p_drop_location, v_route, v_vehicle_type, v_vehicle_type_id,
    p_weight_estimate, p_planned_km, p_schedule_date,
    p_trip_amount, p_actor_user_id, p_internal_notes, p_pickup_date
  )
  returning id into v_trip_id;

  insert into trip_owners (trip_id, sales_consigner_owner_id)
  values (
    v_trip_id,
    case when v_role = 'sales_consigner' then p_actor_user_id else null end
  );

  insert into trip_stage_history (trip_id, from_stage, to_stage, actor_id)
  values (v_trip_id, null, 'request_received', p_actor_user_id);

  return jsonb_build_object('trip_id', v_trip_id, 'trip_code', v_trip_code);
end;
$$;

create or replace function public.trip_request_update_v1(
  p_actor_user_id uuid,
  p_trip_id uuid,
  p_pickup_location text default null,
  p_drop_location text default null,
  p_vehicle_type text default null,
  p_weight_estimate numeric default null,
  p_planned_km integer default null,
  p_schedule_date date default null,
  p_trip_amount numeric default null,
  p_internal_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  v_role text;
  v_trip record;
  v_new_route text;
  v_pickup text;
  v_drop text;
  v_vehicle_valid boolean;
  v_vehicle_type text;
  v_vehicle_type_id uuid;
begin
  v_role := trip_assert_actor_v1(p_actor_user_id);

  if v_role not in ('sales_consigner', 'admin', 'super_admin') then
    raise exception 'permission_denied';
  end if;

  select id, trip_code, current_stage, requested_by_id, pickup_location, drop_location
  into v_trip
  from trips where id = p_trip_id;

  if v_trip.id is null then
    raise exception 'trip_not_found';
  end if;

  if v_trip.current_stage != 'request_received' then
    raise exception 'trip_not_editable';
  end if;

  if v_role = 'sales_consigner' and v_trip.requested_by_id != p_actor_user_id then
    raise exception 'not_request_owner';
  end if;

  if nullif(trim(coalesce(p_vehicle_type, '')), '') is not null then
    select vm.is_valid, vm.normalized_vehicle_type
    into v_vehicle_valid, v_vehicle_type
    from public.vehicle_master_validate_selection_v1(trim(p_vehicle_type), null, true) vm
    limit 1;

    if coalesce(v_vehicle_valid, false) is false then
      raise exception 'unknown_vehicle_type';
    end if;

    select t.id, t.name
    into v_vehicle_type_id, v_vehicle_type
    from public.vehicle_master_types t
    where lower(btrim(t.name)) = lower(btrim(coalesce(v_vehicle_type, p_vehicle_type)))
    limit 1;

    if v_vehicle_type_id is null then
      raise exception 'unknown_vehicle_type';
    end if;
  end if;

  v_pickup := coalesce(p_pickup_location, v_trip.pickup_location);
  v_drop := coalesce(p_drop_location, v_trip.drop_location);
  if v_pickup is not null and v_drop is not null then
    v_new_route := v_pickup || ' - ' || v_drop;
  else
    v_new_route := null;
  end if;

  update trips set
    pickup_location = coalesce(p_pickup_location, pickup_location),
    drop_location   = coalesce(p_drop_location, drop_location),
    route           = v_new_route,
    vehicle_type    = coalesce(v_vehicle_type, vehicle_type),
    vehicle_type_id = coalesce(v_vehicle_type_id, vehicle_type_id),
    weight_estimate = coalesce(p_weight_estimate, weight_estimate),
    planned_km      = coalesce(p_planned_km, planned_km),
    schedule_date   = coalesce(p_schedule_date, schedule_date),
    trip_amount     = coalesce(p_trip_amount, trip_amount),
    internal_notes  = coalesce(p_internal_notes, internal_notes),
    updated_at      = now()
  where id = p_trip_id;

  return jsonb_build_object('trip_id', v_trip.id, 'trip_code', v_trip.trip_code);
end;
$$;

create or replace function public.trip_request_update_v1(
  p_actor_user_id uuid,
  p_trip_id uuid,
  p_pickup_location text default null,
  p_drop_location text default null,
  p_vehicle_type text default null,
  p_weight_estimate numeric default null,
  p_planned_km integer default null,
  p_schedule_date date default null,
  p_trip_amount numeric default null,
  p_internal_notes text default null,
  p_pickup_date date default null
)
returns jsonb
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  v_role text;
  v_trip record;
  v_new_route text;
  v_pickup text;
  v_drop text;
  v_vehicle_valid boolean;
  v_vehicle_type text;
  v_vehicle_type_id uuid;
begin
  v_role := trip_assert_actor_v1(p_actor_user_id);

  if v_role not in ('sales_consigner', 'admin', 'super_admin') then
    raise exception 'permission_denied';
  end if;

  select id, trip_code, current_stage, requested_by_id, pickup_location, drop_location
  into v_trip
  from trips where id = p_trip_id;

  if v_trip.id is null then raise exception 'trip_not_found'; end if;
  if v_trip.current_stage != 'request_received' then raise exception 'trip_not_editable'; end if;
  if v_role = 'sales_consigner' and v_trip.requested_by_id != p_actor_user_id then
    raise exception 'not_request_owner';
  end if;

  if nullif(trim(coalesce(p_vehicle_type, '')), '') is not null then
    select vm.is_valid, vm.normalized_vehicle_type
    into v_vehicle_valid, v_vehicle_type
    from public.vehicle_master_validate_selection_v1(trim(p_vehicle_type), null, true) vm
    limit 1;

    if coalesce(v_vehicle_valid, false) is false then
      raise exception 'unknown_vehicle_type';
    end if;

    select t.id, t.name
    into v_vehicle_type_id, v_vehicle_type
    from public.vehicle_master_types t
    where lower(btrim(t.name)) = lower(btrim(coalesce(v_vehicle_type, p_vehicle_type)))
    limit 1;

    if v_vehicle_type_id is null then
      raise exception 'unknown_vehicle_type';
    end if;
  end if;

  v_pickup := coalesce(p_pickup_location, v_trip.pickup_location);
  v_drop := coalesce(p_drop_location, v_trip.drop_location);
  if v_pickup is not null and v_drop is not null then
    v_new_route := v_pickup || ' - ' || v_drop;
  else
    v_new_route := null;
  end if;

  update trips set
    pickup_location = coalesce(p_pickup_location, pickup_location),
    drop_location   = coalesce(p_drop_location, drop_location),
    route           = v_new_route,
    vehicle_type    = coalesce(v_vehicle_type, vehicle_type),
    vehicle_type_id = coalesce(v_vehicle_type_id, vehicle_type_id),
    weight_estimate = coalesce(p_weight_estimate, weight_estimate),
    planned_km      = coalesce(p_planned_km, planned_km),
    schedule_date   = coalesce(p_schedule_date, schedule_date),
    trip_amount     = coalesce(p_trip_amount, trip_amount),
    internal_notes  = coalesce(p_internal_notes, internal_notes),
    pickup_date     = coalesce(p_pickup_date, pickup_date),
    updated_at      = now()
  where id = p_trip_id;

  return jsonb_build_object('trip_id', v_trip.id, 'trip_code', v_trip.trip_code);
end;
$$;

commit;
