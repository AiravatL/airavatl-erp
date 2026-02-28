create or replace function public.trip_get_v1(
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
    'route', t.route,
    'current_stage', t.current_stage::text,
    'leased_flag', t.leased_flag,
    'vehicle_type', t.vehicle_type,
    'vehicle_length', t.vehicle_length,
    'weight_estimate', t.weight_estimate,
    'planned_km', t.planned_km,
    'schedule_date', t.schedule_date,
    'trip_amount', t.trip_amount,
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

grant execute on function public.trip_get_v1(uuid, uuid) to authenticated;
