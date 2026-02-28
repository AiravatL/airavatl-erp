create or replace function public.trip_timeline_list_v1(
  p_actor_user_id uuid,
  p_trip_id uuid,
  p_limit integer default 200,
  p_offset integer default 0
)
returns table(
  id uuid,
  entity text,
  entity_id uuid,
  action text,
  actor_name text,
  event_at timestamptz,
  details text
)
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  v_role text;
  v_owner_id uuid;
  v_limit integer;
  v_offset integer;
begin
  v_role := trip_assert_actor_v1(p_actor_user_id);

  if v_role not in ('sales_consigner', 'operations_consigner', 'operations_vehicles', 'admin', 'super_admin') then
    raise exception 'permission_denied';
  end if;

  if v_role = 'sales_consigner' then
    select tow.sales_consigner_owner_id into v_owner_id
    from public.trip_owners tow
    where tow.trip_id = p_trip_id;

    if v_owner_id is null or v_owner_id <> p_actor_user_id then
      raise exception 'permission_denied';
    end if;
  end if;

  perform 1
  from public.trips t
  where t.id = p_trip_id;

  if not found then
    raise exception 'trip_not_found';
  end if;

  v_limit := greatest(1, least(coalesce(p_limit, 200), 500));
  v_offset := greatest(0, coalesce(p_offset, 0));

  return query
  with stage_events as (
    select
      h.id,
      'trip'::text as entity,
      h.trip_id as entity_id,
      'stage_change'::text as action,
      coalesce(p.full_name, 'Unknown') as actor_name,
      h.created_at as event_at,
      (
        case
          when h.from_stage is null then format('Trip created: %s', initcap(replace(h.to_stage::text, '_', ' ')))
          when h.from_stage = h.to_stage then coalesce(
            nullif(btrim(h.notes), ''),
            format('Updated in %s', initcap(replace(h.to_stage::text, '_', ' ')))
          )
          else format(
            'Stage changed: %s -> %s',
            initcap(replace(h.from_stage::text, '_', ' ')),
            initcap(replace(h.to_stage::text, '_', ' '))
          )
        end
      ) || (
        case
          when h.notes is not null
            and btrim(h.notes) <> ''
            and (h.from_stage is null or h.from_stage <> h.to_stage)
            then format(' (%s)', btrim(h.notes))
          else ''
        end
      ) as details
    from public.trip_stage_history h
    left join public.profiles p on p.id = h.actor_id
    where h.trip_id = p_trip_id
  ),
  audit_events as (
    select
      a.id,
      a.entity,
      p_trip_id as entity_id,
      a.action,
      coalesce(nullif(a.actor_name, ''), p.full_name, 'Unknown') as actor_name,
      a.created_at as event_at,
      coalesce(nullif(btrim(a.details), ''), initcap(replace(a.action, '_', ' '))) as details
    from public.audit_logs a
    left join public.profiles p on p.id = a.actor_id
    where (a.entity = 'trip' and a.entity_id = p_trip_id)
       or (
         a.entity = 'payment_request'
         and exists (
           select 1
           from public.payment_requests pr
           where pr.id = a.entity_id
             and pr.trip_id = p_trip_id
         )
       )
       or (
         a.entity = 'trip_proof'
         and coalesce(a.after_data ->> 'trip_id', a.before_data ->> 'trip_id') = p_trip_id::text
       )
  )
  select
    e.id,
    e.entity,
    e.entity_id,
    e.action,
    e.actor_name,
    e.event_at,
    e.details
  from (
    select * from stage_events
    union all
    select * from audit_events
  ) as e
  order by e.event_at desc
  limit v_limit
  offset v_offset;
end;
$$;

grant execute on function public.trip_timeline_list_v1(uuid, uuid, integer, integer) to authenticated;
