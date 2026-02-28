begin;

create or replace function public.vendor_list_v3(
  p_actor uuid,
  p_search text default null,
  p_vehicle_type text default null,
  p_vendor_kind text default null,
  p_limit integer default 200,
  p_offset integer default 0
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
declare
  v_limit integer;
  v_offset integer;
  v_vendor_kind text;
begin
  perform public.fleet_assert_actor_v1(p_actor, false);

  v_limit := least(greatest(coalesce(p_limit, 200), 1), 500);
  v_offset := greatest(coalesce(p_offset, 0), 0);
  v_vendor_kind := nullif(btrim(p_vendor_kind), '');

  if v_vendor_kind is not null and v_vendor_kind not in ('vendor', 'owner_driver') then
    raise exception 'invalid_vendor_kind' using errcode = '22023';
  end if;

  return query
  with vendor_base as (
    select
      vn.id,
      vn.name,
      vn.contact_phone,
      vn.kyc_status,
      vn.active,
      vn.notes,
      (
        select count(*)::bigint
        from public.vehicles v
        where v.vendor_id = vn.id
          and v.ownership_type = 'vendor'
      ) as vehicles_count,
      (
        select count(*)::bigint
        from public.vendor_drivers vd
        where vd.vendor_id = vn.id
          and vd.active = true
      ) as drivers_count,
      exists (
        select 1
        from public.vendor_drivers vd
        where vd.vendor_id = vn.id
          and vd.active = true
          and vd.is_owner_driver = true
      ) as owner_driver_flag
    from public.vendors vn
    where vn.active = true
      and (
        p_search is null
        or vn.name ilike '%' || p_search || '%'
        or coalesce(vn.contact_phone, '') ilike '%' || p_search || '%'
      )
      and (
        p_vehicle_type is null
        or exists (
          select 1
          from public.vehicles v2
          where v2.vendor_id = vn.id
            and v2.ownership_type = 'vendor'
            and lower(btrim(v2.type)) = lower(btrim(p_vehicle_type))
        )
      )
  )
  select
    vb.id,
    vb.name,
    vb.contact_phone,
    vb.kyc_status,
    vb.active,
    vb.notes,
    vb.vehicles_count,
    vb.drivers_count,
    vb.owner_driver_flag
  from vendor_base vb
  where (
    v_vendor_kind is null
    or (v_vendor_kind = 'owner_driver' and vb.owner_driver_flag = true)
    or (v_vendor_kind = 'vendor' and vb.owner_driver_flag = false)
  )
  order by lower(vb.name)
  limit v_limit
  offset v_offset;
end;
$$;

grant execute on function public.vendor_list_v3(uuid, text, text, text, integer, integer) to authenticated;

commit;
