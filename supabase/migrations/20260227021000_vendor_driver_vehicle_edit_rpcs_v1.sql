begin;

create or replace function public.vendor_driver_update_v1(
  p_actor uuid,
  p_driver_id uuid,
  p_full_name text default null,
  p_phone text default null,
  p_alternate_phone text default null,
  p_is_owner_driver boolean default null
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

  if not exists (
    select 1 from public.vendor_drivers vd where vd.id = p_driver_id
  ) then
    raise exception 'driver_not_found';
  end if;

  if p_full_name is not null and nullif(btrim(p_full_name), '') is null then
    raise exception 'full_name_required' using errcode = '22023';
  end if;

  if p_phone is not null and nullif(btrim(p_phone), '') is null then
    raise exception 'phone_required' using errcode = '22023';
  end if;

  update public.vendor_drivers vd
  set
    full_name = coalesce(nullif(btrim(coalesce(p_full_name, '')), ''), vd.full_name),
    phone = coalesce(nullif(btrim(coalesce(p_phone, '')), ''), vd.phone),
    alternate_phone = case
      when p_alternate_phone is null then vd.alternate_phone
      else nullif(btrim(coalesce(p_alternate_phone, '')), '')
    end,
    is_owner_driver = coalesce(p_is_owner_driver, vd.is_owner_driver),
    updated_by_id = p_actor,
    updated_at = now()
  where vd.id = p_driver_id
  returning vd.* into v_row;

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

create or replace function public.vendor_driver_set_active_v1(
  p_actor uuid,
  p_driver_id uuid,
  p_active boolean
)
returns jsonb
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  v_row public.vendor_drivers;
  v_on_trip_count integer;
begin
  perform public.fleet_assert_actor_v1(p_actor, true);

  select vd.* into v_row
  from public.vendor_drivers vd
  where vd.id = p_driver_id;

  if v_row.id is null then
    raise exception 'driver_not_found';
  end if;

  if p_active is false then
    select count(*)::integer into v_on_trip_count
    from public.vehicles v
    where v.current_driver_id = p_driver_id
      and v.status = 'on_trip';

    if coalesce(v_on_trip_count, 0) > 0 then
      raise exception 'driver_on_trip';
    end if;
  end if;

  update public.vendor_drivers vd
  set
    active = p_active,
    updated_by_id = p_actor,
    updated_at = now()
  where vd.id = p_driver_id
  returning vd.* into v_row;

  if p_active is false then
    update public.vehicle_driver_assignments
    set unassigned_at = now()
    where driver_id = p_driver_id
      and unassigned_at is null;

    update public.vehicles
    set current_driver_id = null,
        updated_at = now()
    where current_driver_id = p_driver_id;
  end if;

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

create or replace function public.vendor_vehicle_update_v1(
  p_actor uuid,
  p_vehicle_id uuid,
  p_number text default null,
  p_type text default null,
  p_vehicle_length text default null,
  p_clear_vehicle_length boolean default false
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

  select v.* into v_row
  from public.vehicles v
  where v.id = p_vehicle_id;

  if v_row.id is null then
    raise exception 'vehicle_not_found';
  end if;

  if v_row.ownership_type <> 'vendor' then
    raise exception 'vehicle_not_vendor';
  end if;

  if p_number is not null and nullif(btrim(p_number), '') is null then
    raise exception 'vehicle_number_required' using errcode = '22023';
  end if;

  if p_type is not null and nullif(btrim(p_type), '') is null then
    raise exception 'vehicle_type_required' using errcode = '22023';
  end if;

  update public.vehicles v
  set
    number = coalesce(upper(nullif(btrim(coalesce(p_number, '')), '')), v.number),
    type = coalesce(nullif(btrim(coalesce(p_type, '')), ''), v.type),
    vehicle_length = case
      when p_clear_vehicle_length = true then null
      when p_vehicle_length is null then v.vehicle_length
      else nullif(btrim(coalesce(p_vehicle_length, '')), '')
    end,
    updated_at = now()
  where v.id = p_vehicle_id
  returning v.* into v_row;

  return jsonb_build_object(
    'id', v_row.id,
    'number', v_row.number,
    'type', v_row.type,
    'vehicle_length', v_row.vehicle_length,
    'status', v_row.status::text,
    'vendor_id', v_row.vendor_id,
    'current_driver_id', v_row.current_driver_id,
    'current_trip_id', v_row.current_trip_id
  );
end;
$$;

grant execute on function public.vendor_driver_update_v1(uuid, uuid, text, text, text, boolean) to authenticated;
grant execute on function public.vendor_driver_set_active_v1(uuid, uuid, boolean) to authenticated;
grant execute on function public.vendor_vehicle_update_v1(uuid, uuid, text, text, text, boolean) to authenticated;

commit;
