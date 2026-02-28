create or replace function public.trip_list_active_v1(
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

create or replace function public.trip_list_history_v1(
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

grant execute on function public.trip_list_active_v1(uuid, text, text, integer, integer) to authenticated;
grant execute on function public.trip_list_history_v1(uuid, text, integer, integer, date, date) to authenticated;
