begin;

create or replace function public.trip_request_create_v2(
  p_actor_user_id uuid,
  p_customer_id uuid,
  p_pickup_location text default null,
  p_drop_location text default null,
  p_vehicle_type text default null,
  p_vehicle_length text default null,
  p_weight_estimate numeric default null,
  p_planned_km integer default null,
  p_schedule_date date default null,
  p_trip_amount numeric default null,
  p_internal_notes text default null,
  p_pickup_points text[] default null,
  p_drop_points text[] default null,
  p_material_details text default null,
  p_material_length text default null
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
  v_vehicle_length text;
  v_vehicle_msg text;
  v_pickup_points text[];
  v_drop_points text[];
  v_pickup_primary text;
  v_drop_primary text;
begin
  v_role := trip_assert_actor_v1(p_actor_user_id);

  if v_role not in ('sales_consigner', 'operations_consigner', 'admin', 'super_admin') then
    raise exception 'permission_denied';
  end if;

  if nullif(trim(coalesce(p_vehicle_type, '')), '') is null then
    raise exception 'vehicle_type_required';
  end if;

  select vm.is_valid, vm.normalized_vehicle_type, vm.normalized_vehicle_length, vm.message
  into v_vehicle_valid, v_vehicle_type, v_vehicle_length, v_vehicle_msg
  from public.vehicle_master_validate_selection_v1(
    trim(p_vehicle_type),
    nullif(trim(coalesce(p_vehicle_length, '')), ''),
    false
  ) vm
  limit 1;

  if coalesce(v_vehicle_valid, false) is false then
    if v_vehicle_msg = 'unknown_vehicle_length' then
      raise exception 'unknown_vehicle_length';
    end if;
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

  if v_vehicle_length is null then
    v_vehicle_length := nullif(trim(coalesce(p_vehicle_length, '')), '');
  end if;

  if v_role = 'sales_consigner' then
    select sales_consigner_owner_id into v_customer_owner
    from customers
    where id = p_customer_id and active = true;

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

  select coalesce(array_agg(v.item), '{}'::text[])
  into v_pickup_points
  from (
    select nullif(btrim(point), '') as item
    from unnest(
      case
        when p_pickup_points is not null then p_pickup_points
        when nullif(btrim(coalesce(p_pickup_location, '')), '') is not null then array[nullif(btrim(p_pickup_location), '')]
        else '{}'::text[]
      end
    ) as point
  ) v
  where v.item is not null;

  select coalesce(array_agg(v.item), '{}'::text[])
  into v_drop_points
  from (
    select nullif(btrim(point), '') as item
    from unnest(
      case
        when p_drop_points is not null then p_drop_points
        when nullif(btrim(coalesce(p_drop_location, '')), '') is not null then array[nullif(btrim(p_drop_location), '')]
        else '{}'::text[]
      end
    ) as point
  ) v
  where v.item is not null;

  if coalesce(array_length(v_pickup_points, 1), 0) = 0 then
    raise exception 'pickup_point_required';
  end if;
  if coalesce(array_length(v_drop_points, 1), 0) = 0 then
    raise exception 'drop_point_required';
  end if;

  v_pickup_primary := v_pickup_points[1];
  v_drop_primary := v_drop_points[array_length(v_drop_points, 1)];

  if v_pickup_primary is not null and v_drop_primary is not null then
    v_route := v_pickup_primary || ' - ' || v_drop_primary;
  else
    v_route := null;
  end if;

  v_trip_code := trip_generate_code_v1();

  insert into trips (
    trip_code,
    customer_id,
    current_stage,
    leased_flag,
    pickup_location,
    drop_location,
    pickup_points,
    drop_points,
    route,
    vehicle_type,
    vehicle_type_id,
    vehicle_length,
    weight_estimate,
    planned_km,
    schedule_date,
    trip_amount,
    requested_by_id,
    internal_notes,
    material_details,
    material_length
  ) values (
    v_trip_code,
    p_customer_id,
    'request_received',
    false,
    v_pickup_primary,
    v_drop_primary,
    v_pickup_points,
    v_drop_points,
    v_route,
    v_vehicle_type,
    v_vehicle_type_id,
    v_vehicle_length,
    p_weight_estimate,
    p_planned_km,
    p_schedule_date,
    p_trip_amount,
    p_actor_user_id,
    p_internal_notes,
    nullif(btrim(coalesce(p_material_details, '')), ''),
    nullif(btrim(coalesce(p_material_length, '')), '')
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

create or replace function public.trip_request_update_v2(
  p_actor_user_id uuid,
  p_trip_id uuid,
  p_pickup_location text default null,
  p_drop_location text default null,
  p_vehicle_type text default null,
  p_vehicle_length text default null,
  p_weight_estimate numeric default null,
  p_planned_km integer default null,
  p_schedule_date date default null,
  p_trip_amount numeric default null,
  p_internal_notes text default null,
  p_pickup_points text[] default null,
  p_drop_points text[] default null,
  p_material_details text default null,
  p_material_length text default null
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
  v_vehicle_valid boolean;
  v_vehicle_type text;
  v_vehicle_type_id uuid;
  v_vehicle_length text;
  v_vehicle_msg text;
  v_candidate_type text;
  v_candidate_length text;
  v_pickup_points text[];
  v_drop_points text[];
  v_pickup_primary text;
  v_drop_primary text;
begin
  v_role := trip_assert_actor_v1(p_actor_user_id);

  if v_role not in ('sales_consigner', 'admin', 'super_admin') then
    raise exception 'permission_denied';
  end if;

  select
    id,
    trip_code,
    current_stage,
    requested_by_id,
    pickup_location,
    drop_location,
    pickup_points,
    drop_points,
    vehicle_type,
    vehicle_length
  into v_trip
  from trips
  where id = p_trip_id;

  if v_trip.id is null then
    raise exception 'trip_not_found';
  end if;
  if v_trip.current_stage != 'request_received' then
    raise exception 'trip_not_editable';
  end if;
  if v_role = 'sales_consigner' and v_trip.requested_by_id != p_actor_user_id then
    raise exception 'not_request_owner';
  end if;

  if p_vehicle_type is not null or p_vehicle_length is not null then
    v_candidate_type := coalesce(nullif(trim(coalesce(p_vehicle_type, '')), ''), v_trip.vehicle_type);
    if p_vehicle_length is null then
      v_candidate_length := v_trip.vehicle_length;
    else
      v_candidate_length := nullif(trim(coalesce(p_vehicle_length, '')), '');
    end if;

    if nullif(trim(coalesce(v_candidate_type, '')), '') is null then
      raise exception 'vehicle_type_required';
    end if;

    select vm.is_valid, vm.normalized_vehicle_type, vm.normalized_vehicle_length, vm.message
    into v_vehicle_valid, v_vehicle_type, v_vehicle_length, v_vehicle_msg
    from public.vehicle_master_validate_selection_v1(v_candidate_type, v_candidate_length, true) vm
    limit 1;

    if coalesce(v_vehicle_valid, false) is false then
      if v_vehicle_msg = 'unknown_vehicle_length' then
        raise exception 'unknown_vehicle_length';
      end if;
      raise exception 'unknown_vehicle_type';
    end if;

    select t.id, t.name
    into v_vehicle_type_id, v_vehicle_type
    from public.vehicle_master_types t
    where lower(btrim(t.name)) = lower(btrim(coalesce(v_vehicle_type, v_candidate_type)))
    limit 1;

    if v_vehicle_type_id is null then
      raise exception 'unknown_vehicle_type';
    end if;

    if v_vehicle_length is null then
      v_vehicle_length := v_candidate_length;
    end if;
  end if;

  select coalesce(array_agg(v.item), '{}'::text[])
  into v_pickup_points
  from (
    select nullif(btrim(point), '') as item
    from unnest(
      case
        when p_pickup_points is not null then p_pickup_points
        when nullif(btrim(coalesce(p_pickup_location, '')), '') is not null then array[nullif(btrim(p_pickup_location), '')]
        when coalesce(array_length(v_trip.pickup_points, 1), 0) > 0 then v_trip.pickup_points
        when nullif(btrim(coalesce(v_trip.pickup_location, '')), '') is not null then array[nullif(btrim(v_trip.pickup_location), '')]
        else '{}'::text[]
      end
    ) as point
  ) v
  where v.item is not null;

  select coalesce(array_agg(v.item), '{}'::text[])
  into v_drop_points
  from (
    select nullif(btrim(point), '') as item
    from unnest(
      case
        when p_drop_points is not null then p_drop_points
        when nullif(btrim(coalesce(p_drop_location, '')), '') is not null then array[nullif(btrim(p_drop_location), '')]
        when coalesce(array_length(v_trip.drop_points, 1), 0) > 0 then v_trip.drop_points
        when nullif(btrim(coalesce(v_trip.drop_location, '')), '') is not null then array[nullif(btrim(v_trip.drop_location), '')]
        else '{}'::text[]
      end
    ) as point
  ) v
  where v.item is not null;

  if coalesce(array_length(v_pickup_points, 1), 0) = 0 then
    raise exception 'pickup_point_required';
  end if;
  if coalesce(array_length(v_drop_points, 1), 0) = 0 then
    raise exception 'drop_point_required';
  end if;

  v_pickup_primary := v_pickup_points[1];
  v_drop_primary := v_drop_points[array_length(v_drop_points, 1)];

  if v_pickup_primary is not null and v_drop_primary is not null then
    v_new_route := v_pickup_primary || ' - ' || v_drop_primary;
  else
    v_new_route := null;
  end if;

  update trips
  set
    pickup_location = v_pickup_primary,
    drop_location = v_drop_primary,
    pickup_points = v_pickup_points,
    drop_points = v_drop_points,
    route = v_new_route,
    vehicle_type = coalesce(v_vehicle_type, vehicle_type),
    vehicle_type_id = coalesce(v_vehicle_type_id, vehicle_type_id),
    vehicle_length = case
      when p_vehicle_type is null and p_vehicle_length is null then vehicle_length
      else v_vehicle_length
    end,
    weight_estimate = coalesce(p_weight_estimate, weight_estimate),
    planned_km = coalesce(p_planned_km, planned_km),
    schedule_date = coalesce(p_schedule_date, schedule_date),
    trip_amount = coalesce(p_trip_amount, trip_amount),
    internal_notes = coalesce(p_internal_notes, internal_notes),
    material_details = case
      when p_material_details is null then material_details
      else nullif(btrim(p_material_details), '')
    end,
    material_length = case
      when p_material_length is null then material_length
      else nullif(btrim(p_material_length), '')
    end,
    updated_at = now()
  where id = p_trip_id;

  return jsonb_build_object('trip_id', v_trip.id, 'trip_code', v_trip.trip_code);
end;
$$;

create or replace function public.trip_get_v2(
  p_actor_user_id uuid,
  p_trip_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  v_role text;
  v_result jsonb;
  v_owner_id uuid;
begin
  v_role := trip_assert_actor_v1(p_actor_user_id);

  if v_role not in ('sales_consigner', 'operations_consigner', 'operations_vehicles', 'admin', 'super_admin') then
    raise exception 'permission_denied';
  end if;

  if v_role = 'sales_consigner' then
    select tow.sales_consigner_owner_id into v_owner_id
    from trip_owners tow
    where tow.trip_id = p_trip_id;
    if v_owner_id is null or v_owner_id != p_actor_user_id then
      raise exception 'permission_denied';
    end if;
  end if;

  select jsonb_build_object(
    'id', t.id,
    'trip_code', t.trip_code,
    'customer_id', t.customer_id,
    'customer_name', c.name,
    'pickup_location', t.pickup_location,
    'drop_location', t.drop_location,
    'pickup_points', coalesce(t.pickup_points, '{}'::text[]),
    'drop_points', coalesce(t.drop_points, '{}'::text[]),
    'route', t.route,
    'current_stage', t.current_stage::text,
    'leased_flag', t.leased_flag,
    'vehicle_type', t.vehicle_type,
    'vehicle_length', t.vehicle_length,
    'weight_estimate', t.weight_estimate,
    'planned_km', t.planned_km,
    'schedule_date', t.schedule_date,
    'trip_amount', t.trip_amount,
    'material_details', t.material_details,
    'material_length', t.material_length,
    'requested_by_id', t.requested_by_id,
    'requested_by_name', coalesce(req.full_name, 'Unknown'),
    'vehicle_id', t.vehicle_id,
    'vehicle_number', t.vehicle_number,
    'driver_name', t.driver_name,
    'driver_phone', coalesce(
      nullif(btrim(coalesce(vd_trip.phone, '')), ''),
      nullif(btrim(coalesce(vd_current.phone, '')), ''),
      nullif(btrim(coalesce(veh.leased_driver_phone, '')), '')
    ),
    'vendor_id', t.vendor_id,
    'vendor_name', vn.name,
    'vendor_phone', vn.contact_phone,
    'started_at', t.started_at,
    'started_by_id', t.started_by_id,
    'completed_at', t.completed_at,
    'completed_by_id', t.completed_by_id,
    'internal_notes', t.internal_notes,
    'created_at', t.created_at,
    'updated_at', t.updated_at,
    'sales_consigner_owner_id', tow.sales_consigner_owner_id,
    'sales_consigner_owner_name', coalesce(sc.full_name, ''),
    'operations_consigner_owner_id', tow.operations_consigner_owner_id,
    'operations_consigner_owner_name', coalesce(oc.full_name, ''),
    'operations_vehicles_owner_id', tow.operations_vehicles_owner_id,
    'operations_vehicles_owner_name', coalesce(ov.full_name, ''),
    'accounts_owner_id', tow.accounts_owner_id,
    'accounts_owner_name', coalesce(acc.full_name, '')
  ) into v_result
  from trips t
  join customers c on c.id = t.customer_id
  left join trip_owners tow on tow.trip_id = t.id
  left join profiles req on req.id = t.requested_by_id
  left join profiles sc on sc.id = tow.sales_consigner_owner_id
  left join profiles oc on oc.id = tow.operations_consigner_owner_id
  left join profiles ov on ov.id = tow.operations_vehicles_owner_id
  left join profiles acc on acc.id = tow.accounts_owner_id
  left join vehicles veh on veh.id = t.vehicle_id
  left join vendor_drivers vd_trip on vd_trip.id = t.driver_id
  left join vendor_drivers vd_current on vd_current.id = veh.current_driver_id
  left join vendors vn on vn.id = t.vendor_id
  where t.id = p_trip_id;

  if v_result is null then
    raise exception 'trip_not_found';
  end if;

  return v_result;
end;
$$;

create or replace function public.trip_list_active_v2(
  p_actor_user_id uuid,
  p_search text default null,
  p_stage text default null,
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

  if v_role not in ('sales_consigner', 'operations_consigner', 'operations_vehicles', 'admin', 'super_admin') then
    raise exception 'permission_denied';
  end if;

  if p_limit > 500 then p_limit := 500; end if;
  if p_limit < 1 then p_limit := 50; end if;
  if p_offset < 0 then p_offset := 0; end if;

  select coalesce(jsonb_agg(row_data), '[]'::jsonb) into v_result
  from (
    select jsonb_build_object(
      'id', t.id,
      'trip_code', t.trip_code,
      'customer_id', t.customer_id,
      'customer_name', c.name,
      'pickup_location', t.pickup_location,
      'drop_location', t.drop_location,
      'pickup_points', coalesce(t.pickup_points, '{}'::text[]),
      'drop_points', coalesce(t.drop_points, '{}'::text[]),
      'route', t.route,
      'current_stage', t.current_stage::text,
      'leased_flag', t.leased_flag,
      'vehicle_type', t.vehicle_type,
      'vehicle_length', t.vehicle_length,
      'weight_estimate', t.weight_estimate,
      'planned_km', t.planned_km,
      'schedule_date', t.schedule_date,
      'trip_amount', t.trip_amount,
      'material_details', t.material_details,
      'material_length', t.material_length,
      'requested_by_id', t.requested_by_id,
      'requested_by_name', coalesce(req.full_name, 'Unknown'),
      'vehicle_id', t.vehicle_id,
      'vehicle_number', t.vehicle_number,
      'driver_name', t.driver_name,
      'driver_phone', coalesce(
        nullif(btrim(coalesce(vd_trip.phone, '')), ''),
        nullif(btrim(coalesce(vd_current.phone, '')), ''),
        nullif(btrim(coalesce(veh.leased_driver_phone, '')), '')
      ),
      'vendor_id', t.vendor_id,
      'vendor_name', vn.name,
      'vendor_phone', vn.contact_phone,
      'started_at', t.started_at,
      'started_by_id', t.started_by_id,
      'completed_at', t.completed_at,
      'completed_by_id', t.completed_by_id,
      'internal_notes', t.internal_notes,
      'created_at', t.created_at,
      'updated_at', t.updated_at,
      'sales_consigner_owner_id', tow.sales_consigner_owner_id,
      'sales_consigner_owner_name', coalesce(sc.full_name, ''),
      'operations_consigner_owner_id', tow.operations_consigner_owner_id,
      'operations_consigner_owner_name', coalesce(oc.full_name, ''),
      'operations_vehicles_owner_id', tow.operations_vehicles_owner_id,
      'operations_vehicles_owner_name', coalesce(ov.full_name, ''),
      'accounts_owner_id', tow.accounts_owner_id,
      'accounts_owner_name', coalesce(acc.full_name, '')
    ) as row_data
    from public.trips t
    join public.customers c on c.id = t.customer_id
    left join public.trip_owners tow on tow.trip_id = t.id
    left join public.profiles req on req.id = t.requested_by_id
    left join public.profiles sc on sc.id = tow.sales_consigner_owner_id
    left join public.profiles oc on oc.id = tow.operations_consigner_owner_id
    left join public.profiles ov on ov.id = tow.operations_vehicles_owner_id
    left join public.profiles acc on acc.id = tow.accounts_owner_id
    left join public.vehicles veh on veh.id = t.vehicle_id
    left join public.vendor_drivers vd_trip on vd_trip.id = t.driver_id
    left join public.vendor_drivers vd_current on vd_current.id = veh.current_driver_id
    left join public.vendors vn on vn.id = t.vendor_id
    where
      (
        v_role in ('admin', 'super_admin', 'operations_consigner', 'operations_vehicles')
        or (v_role = 'sales_consigner' and tow.sales_consigner_owner_id = p_actor_user_id)
      )
      and t.current_stage::text <> 'closed'
      and (
        p_search is null or p_search = ''
        or t.trip_code ilike '%' || p_search || '%'
        or c.name ilike '%' || p_search || '%'
        or t.route ilike '%' || p_search || '%'
      )
      and (
        p_stage is null or p_stage = '' or p_stage = 'all'
        or t.current_stage::text = p_stage
      )
    order by t.updated_at desc
    limit p_limit offset p_offset
  ) sub;

  return v_result;
end;
$$;

create or replace function public.trip_list_history_v2(
  p_actor_user_id uuid,
  p_search text default null,
  p_limit integer default 50,
  p_offset integer default 0,
  p_from_date date default null,
  p_to_date date default null
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

  if v_role not in ('sales_consigner', 'operations_consigner', 'operations_vehicles', 'admin', 'super_admin') then
    raise exception 'permission_denied';
  end if;

  if p_limit > 500 then p_limit := 500; end if;
  if p_limit < 1 then p_limit := 50; end if;
  if p_offset < 0 then p_offset := 0; end if;

  select coalesce(jsonb_agg(row_data), '[]'::jsonb) into v_result
  from (
    select jsonb_build_object(
      'id', t.id,
      'trip_code', t.trip_code,
      'customer_id', t.customer_id,
      'customer_name', c.name,
      'pickup_location', t.pickup_location,
      'drop_location', t.drop_location,
      'pickup_points', coalesce(t.pickup_points, '{}'::text[]),
      'drop_points', coalesce(t.drop_points, '{}'::text[]),
      'route', t.route,
      'current_stage', t.current_stage::text,
      'leased_flag', t.leased_flag,
      'vehicle_type', t.vehicle_type,
      'vehicle_length', t.vehicle_length,
      'weight_estimate', t.weight_estimate,
      'planned_km', t.planned_km,
      'schedule_date', t.schedule_date,
      'trip_amount', t.trip_amount,
      'material_details', t.material_details,
      'material_length', t.material_length,
      'requested_by_id', t.requested_by_id,
      'requested_by_name', coalesce(req.full_name, 'Unknown'),
      'vehicle_id', t.vehicle_id,
      'vehicle_number', t.vehicle_number,
      'driver_name', t.driver_name,
      'driver_phone', coalesce(
        nullif(btrim(coalesce(vd_trip.phone, '')), ''),
        nullif(btrim(coalesce(vd_current.phone, '')), ''),
        nullif(btrim(coalesce(veh.leased_driver_phone, '')), '')
      ),
      'vendor_id', t.vendor_id,
      'vendor_name', vn.name,
      'vendor_phone', vn.contact_phone,
      'started_at', t.started_at,
      'started_by_id', t.started_by_id,
      'completed_at', t.completed_at,
      'completed_by_id', t.completed_by_id,
      'internal_notes', t.internal_notes,
      'created_at', t.created_at,
      'updated_at', t.updated_at,
      'sales_consigner_owner_id', tow.sales_consigner_owner_id,
      'sales_consigner_owner_name', coalesce(sc.full_name, ''),
      'operations_consigner_owner_id', tow.operations_consigner_owner_id,
      'operations_consigner_owner_name', coalesce(oc.full_name, ''),
      'operations_vehicles_owner_id', tow.operations_vehicles_owner_id,
      'operations_vehicles_owner_name', coalesce(ov.full_name, ''),
      'accounts_owner_id', tow.accounts_owner_id,
      'accounts_owner_name', coalesce(acc.full_name, '')
    ) as row_data
    from public.trips t
    join public.customers c on c.id = t.customer_id
    left join public.trip_owners tow on tow.trip_id = t.id
    left join public.profiles req on req.id = t.requested_by_id
    left join public.profiles sc on sc.id = tow.sales_consigner_owner_id
    left join public.profiles oc on oc.id = tow.operations_consigner_owner_id
    left join public.profiles ov on ov.id = tow.operations_vehicles_owner_id
    left join public.profiles acc on acc.id = tow.accounts_owner_id
    left join public.vehicles veh on veh.id = t.vehicle_id
    left join public.vendor_drivers vd_trip on vd_trip.id = t.driver_id
    left join public.vendor_drivers vd_current on vd_current.id = veh.current_driver_id
    left join public.vendors vn on vn.id = t.vendor_id
    where
      (
        v_role in ('admin', 'super_admin', 'operations_consigner', 'operations_vehicles')
        or (v_role = 'sales_consigner' and tow.sales_consigner_owner_id = p_actor_user_id)
      )
      and t.current_stage::text = 'closed'
      and (
        p_search is null or p_search = ''
        or t.trip_code ilike '%' || p_search || '%'
        or c.name ilike '%' || p_search || '%'
        or t.route ilike '%' || p_search || '%'
      )
      and (
        p_from_date is null
        or (t.completed_at is not null and t.completed_at::date >= p_from_date)
      )
      and (
        p_to_date is null
        or (t.completed_at is not null and t.completed_at::date <= p_to_date)
      )
    order by t.completed_at desc nulls last, t.updated_at desc
    limit p_limit offset p_offset
  ) sub;

  return v_result;
end;
$$;

grant execute on function public.trip_request_create_v2(
  uuid, uuid, text, text, text, text, numeric, integer, date, numeric, text, text[], text[], text, text
) to authenticated;

grant execute on function public.trip_request_update_v2(
  uuid, uuid, text, text, text, text, numeric, integer, date, numeric, text, text[], text[], text, text
) to authenticated;

grant execute on function public.trip_get_v2(uuid, uuid) to authenticated;
grant execute on function public.trip_list_active_v2(uuid, text, text, integer, integer) to authenticated;
grant execute on function public.trip_list_history_v2(uuid, text, integer, integer, date, date) to authenticated;

commit;
