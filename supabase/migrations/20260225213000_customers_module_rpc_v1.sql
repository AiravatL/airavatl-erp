begin;

create or replace function public.customer_assert_actor_v1(
  p_actor uuid,
  p_require_admin boolean default false
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

  if p_require_admin and v_role not in ('super_admin', 'admin') then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  return v_role;
end;
$$;

create or replace function public.customer_list_v1(
  p_actor uuid,
  p_search text default null,
  p_status text default null,
  p_owner_id uuid default null,
  p_credit_health text default null,
  p_limit integer default 100,
  p_offset integer default 0
)
returns table (
  id uuid,
  name text,
  address text,
  gstin text,
  credit_days integer,
  credit_limit numeric,
  sales_owner_id uuid,
  sales_owner_name text,
  active boolean,
  active_trips_count bigint,
  outstanding_amount numeric,
  last_activity_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  v_limit integer;
  v_offset integer;
  v_status text;
  v_credit_health text;
begin
  perform public.customer_assert_actor_v1(p_actor, false);
  v_limit := least(greatest(coalesce(p_limit, 100), 1), 500);
  v_offset := greatest(coalesce(p_offset, 0), 0);
  v_status := nullif(lower(btrim(p_status)), '');
  v_credit_health := nullif(lower(btrim(p_credit_health)), '');

  if v_status is not null and v_status not in ('active', 'inactive') then
    raise exception 'invalid_status' using errcode = '22023';
  end if;

  if v_credit_health is not null and v_credit_health not in ('within_limit', 'over_limit') then
    raise exception 'invalid_credit_health' using errcode = '22023';
  end if;

  return query
  with trip_stats as (
    select
      t.customer_id,
      count(*) filter (where t.current_stage <> 'closed')::bigint as active_trips_count,
      max(t.updated_at) as last_trip_activity_at
    from public.trips t
    group by t.customer_id
  ),
  receivable_stats as (
    select
      r.customer_id,
      coalesce(
        sum(
          case when r.collected_status in ('pending', 'partial', 'overdue')
            then r.amount
            else 0
          end
        ),
        0
      )::numeric as outstanding_amount,
      max(r.updated_at) as last_receivable_activity_at
    from public.receivables r
    group by r.customer_id
  )
  select
    c.id,
    c.name,
    c.address,
    c.gstin,
    c.credit_days,
    c.credit_limit,
    c.sales_consigner_owner_id as sales_owner_id,
    so.full_name as sales_owner_name,
    c.active,
    coalesce(ts.active_trips_count, 0)::bigint as active_trips_count,
    coalesce(rs.outstanding_amount, 0)::numeric as outstanding_amount,
    greatest(
      c.updated_at,
      coalesce(ts.last_trip_activity_at, c.updated_at),
      coalesce(rs.last_receivable_activity_at, c.updated_at)
    ) as last_activity_at,
    c.created_at,
    c.updated_at
  from public.customers c
  left join public.profiles so on so.id = c.sales_consigner_owner_id
  left join trip_stats ts on ts.customer_id = c.id
  left join receivable_stats rs on rs.customer_id = c.id
  where
    (
      p_search is null
      or c.name ilike '%' || p_search || '%'
      or coalesce(c.gstin, '') ilike '%' || p_search || '%'
      or coalesce(so.full_name, '') ilike '%' || p_search || '%'
    )
    and (
      v_status is null
      or (v_status = 'active' and c.active = true)
      or (v_status = 'inactive' and c.active = false)
    )
    and (
      p_owner_id is null
      or c.sales_consigner_owner_id = p_owner_id
    )
    and (
      v_credit_health is null
      or (v_credit_health = 'within_limit' and coalesce(rs.outstanding_amount, 0) <= coalesce(c.credit_limit, 0))
      or (v_credit_health = 'over_limit' and coalesce(rs.outstanding_amount, 0) > coalesce(c.credit_limit, 0))
    )
  order by
    greatest(
      c.updated_at,
      coalesce(ts.last_trip_activity_at, c.updated_at),
      coalesce(rs.last_receivable_activity_at, c.updated_at)
    ) desc,
    lower(c.name) asc
  limit v_limit
  offset v_offset;
end;
$$;

create or replace function public.customer_get_v1(
  p_actor uuid,
  p_customer_id uuid
)
returns table (
  id uuid,
  name text,
  address text,
  gstin text,
  credit_days integer,
  credit_limit numeric,
  sales_owner_id uuid,
  sales_owner_name text,
  active boolean,
  active_trips_count bigint,
  outstanding_amount numeric,
  last_activity_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = 'public'
as $$
begin
  perform public.customer_assert_actor_v1(p_actor, false);

  return query
  with trip_stats as (
    select
      t.customer_id,
      count(*) filter (where t.current_stage <> 'closed')::bigint as active_trips_count,
      max(t.updated_at) as last_trip_activity_at
    from public.trips t
    where t.customer_id = p_customer_id
    group by t.customer_id
  ),
  receivable_stats as (
    select
      r.customer_id,
      coalesce(
        sum(
          case when r.collected_status in ('pending', 'partial', 'overdue')
            then r.amount
            else 0
          end
        ),
        0
      )::numeric as outstanding_amount,
      max(r.updated_at) as last_receivable_activity_at
    from public.receivables r
    where r.customer_id = p_customer_id
    group by r.customer_id
  )
  select
    c.id,
    c.name,
    c.address,
    c.gstin,
    c.credit_days,
    c.credit_limit,
    c.sales_consigner_owner_id as sales_owner_id,
    so.full_name as sales_owner_name,
    c.active,
    coalesce(ts.active_trips_count, 0)::bigint as active_trips_count,
    coalesce(rs.outstanding_amount, 0)::numeric as outstanding_amount,
    greatest(
      c.updated_at,
      coalesce(ts.last_trip_activity_at, c.updated_at),
      coalesce(rs.last_receivable_activity_at, c.updated_at)
    ) as last_activity_at,
    c.created_at,
    c.updated_at
  from public.customers c
  left join public.profiles so on so.id = c.sales_consigner_owner_id
  left join trip_stats ts on ts.customer_id = c.id
  left join receivable_stats rs on rs.customer_id = c.id
  where c.id = p_customer_id;
end;
$$;

create or replace function public.customer_trip_history_v1(
  p_actor uuid,
  p_customer_id uuid,
  p_limit integer default 50,
  p_offset integer default 0
)
returns table (
  id uuid,
  trip_code text,
  route text,
  current_stage trip_stage,
  schedule_date date,
  vehicle_number text,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  v_limit integer;
  v_offset integer;
begin
  perform public.customer_assert_actor_v1(p_actor, false);
  v_limit := least(greatest(coalesce(p_limit, 50), 1), 500);
  v_offset := greatest(coalesce(p_offset, 0), 0);

  return query
  select
    t.id,
    t.trip_code,
    t.route,
    t.current_stage,
    t.schedule_date,
    t.vehicle_number,
    t.created_at,
    t.updated_at
  from public.trips t
  where t.customer_id = p_customer_id
  order by t.created_at desc
  limit v_limit
  offset v_offset;
end;
$$;

create or replace function public.customer_receivables_v1(
  p_actor uuid,
  p_customer_id uuid,
  p_limit integer default 50,
  p_offset integer default 0
)
returns table (
  id uuid,
  trip_id uuid,
  trip_code text,
  amount numeric,
  due_date date,
  collected_status receivable_status,
  aging_bucket aging_bucket,
  follow_up_status text,
  follow_up_notes text,
  collected_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  v_limit integer;
  v_offset integer;
begin
  perform public.customer_assert_actor_v1(p_actor, false);
  v_limit := least(greatest(coalesce(p_limit, 50), 1), 500);
  v_offset := greatest(coalesce(p_offset, 0), 0);

  return query
  select
    r.id,
    r.trip_id,
    r.trip_code,
    r.amount,
    r.due_date,
    r.collected_status,
    r.aging_bucket,
    r.follow_up_status,
    r.follow_up_notes,
    r.collected_at,
    r.created_at,
    r.updated_at
  from public.receivables r
  where r.customer_id = p_customer_id
  order by r.due_date desc nulls last, r.created_at desc
  limit v_limit
  offset v_offset;
end;
$$;

create index if not exists idx_customers_name on public.customers (name);
create index if not exists idx_customers_active on public.customers (active);
create index if not exists idx_customers_sales_owner on public.customers (sales_consigner_owner_id);
create index if not exists idx_trips_customer_stage_updated on public.trips (customer_id, current_stage, updated_at desc);
create index if not exists idx_receivables_customer_status_due on public.receivables (customer_id, collected_status, due_date);

grant execute on function public.customer_assert_actor_v1(uuid, boolean) to authenticated;
grant execute on function public.customer_list_v1(uuid, text, text, uuid, text, integer, integer) to authenticated;
grant execute on function public.customer_get_v1(uuid, uuid) to authenticated;
grant execute on function public.customer_trip_history_v1(uuid, uuid, integer, integer) to authenticated;
grant execute on function public.customer_receivables_v1(uuid, uuid, integer, integer) to authenticated;

notify pgrst, 'reload schema';

commit;
