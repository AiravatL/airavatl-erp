create or replace function public.report_assert_actor_v1(
  p_actor_user_id uuid
)
returns public.role_type
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  v_role public.role_type;
  v_active boolean;
begin
  select p.role, p.active
  into v_role, v_active
  from public.profiles p
  where p.id = p_actor_user_id;

  if v_role is null then
    raise exception 'actor_not_found';
  end if;

  if coalesce(v_active, false) is not true then
    raise exception 'actor_inactive';
  end if;

  if v_role not in ('super_admin', 'admin', 'accounts') then
    raise exception 'permission_denied';
  end if;

  return v_role;
end;
$$;

create or replace function public.report_overview_v1(
  p_actor_user_id uuid,
  p_from_date date default null,
  p_to_date date default null,
  p_owner_id uuid default null,
  p_vehicle_type text default null
)
returns jsonb
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  v_role public.role_type;
  v_revenue numeric := 0;
  v_total_expenses numeric := 0;
  v_total_trips bigint := 0;
  v_closed_trips bigint := 0;
  v_outstanding_receivables numeric := 0;
  v_gross_margin_pct numeric := 0;
  v_trend jsonb := '[]'::jsonb;
  v_stage_mix jsonb := '[]'::jsonb;
  v_payment_mix jsonb := '[]'::jsonb;
begin
  v_role := public.report_assert_actor_v1(p_actor_user_id);

  if p_from_date is not null and p_to_date is not null and p_from_date > p_to_date then
    raise exception 'invalid_date_range';
  end if;

  with accessible_trips as (
    select t.*
    from public.trips t
    left join public.trip_owners tow on tow.trip_id = t.id
    where
      (p_owner_id is null or tow.sales_consigner_owner_id = p_owner_id)
      and (p_vehicle_type is null or btrim(p_vehicle_type) = '' or t.vehicle_type = p_vehicle_type)
      and (p_from_date is null or coalesce(t.completed_at::date, t.created_at::date) >= p_from_date)
      and (p_to_date is null or coalesce(t.completed_at::date, t.created_at::date) <= p_to_date)
  )
  select
    count(*)::bigint,
    count(*) filter (where t.current_stage::text = 'closed')::bigint,
    coalesce(sum(coalesce(t.trip_amount, 0)), 0)::numeric
  into v_total_trips, v_closed_trips, v_revenue
  from accessible_trips t;

  with accessible_trips as (
    select t.id
    from public.trips t
    left join public.trip_owners tow on tow.trip_id = t.id
    where
      (p_owner_id is null or tow.sales_consigner_owner_id = p_owner_id)
      and (p_vehicle_type is null or btrim(p_vehicle_type) = '' or t.vehicle_type = p_vehicle_type)
      and (p_from_date is null or coalesce(t.completed_at::date, t.created_at::date) >= p_from_date)
      and (p_to_date is null or coalesce(t.completed_at::date, t.created_at::date) <= p_to_date)
  )
  select coalesce(sum(coalesce(e.amount, 0)), 0)::numeric
  into v_total_expenses
  from public.expense_entries e
  join accessible_trips t on t.id = e.trip_id;

  with accessible_trips as (
    select t.id
    from public.trips t
    left join public.trip_owners tow on tow.trip_id = t.id
    where
      (p_owner_id is null or tow.sales_consigner_owner_id = p_owner_id)
      and (p_vehicle_type is null or btrim(p_vehicle_type) = '' or t.vehicle_type = p_vehicle_type)
      and (p_from_date is null or coalesce(t.completed_at::date, t.created_at::date) >= p_from_date)
      and (p_to_date is null or coalesce(t.completed_at::date, t.created_at::date) <= p_to_date)
  )
  select coalesce(
    sum(
      case
        when r.collected_status::text in ('pending', 'partial', 'overdue') then coalesce(r.amount, 0)
        else 0
      end
    ),
    0
  )::numeric
  into v_outstanding_receivables
  from public.receivables r
  join accessible_trips t on t.id = r.trip_id;

  if coalesce(v_revenue, 0) > 0 then
    v_gross_margin_pct := round(((v_revenue - v_total_expenses) / v_revenue) * 100, 2);
  else
    v_gross_margin_pct := 0;
  end if;

  with accessible_trips as (
    select t.*
    from public.trips t
    left join public.trip_owners tow on tow.trip_id = t.id
    where
      (p_owner_id is null or tow.sales_consigner_owner_id = p_owner_id)
      and (p_vehicle_type is null or btrim(p_vehicle_type) = '' or t.vehicle_type = p_vehicle_type)
      and (p_from_date is null or coalesce(t.completed_at::date, t.created_at::date) >= p_from_date)
      and (p_to_date is null or coalesce(t.completed_at::date, t.created_at::date) <= p_to_date)
  ),
  trip_monthly as (
    select
      date_trunc('month', coalesce(t.completed_at, t.created_at))::date as month_start,
      count(*)::bigint as trips,
      coalesce(sum(coalesce(t.trip_amount, 0)), 0)::numeric as revenue
    from accessible_trips t
    group by 1
  ),
  expense_monthly as (
    select
      date_trunc('month', e.created_at)::date as month_start,
      coalesce(sum(coalesce(e.amount, 0)), 0)::numeric as expenses
    from public.expense_entries e
    join accessible_trips t on t.id = e.trip_id
    group by 1
  ),
  merged as (
    select
      coalesce(tm.month_start, em.month_start) as month_start,
      coalesce(tm.trips, 0) as trips,
      coalesce(tm.revenue, 0) as revenue,
      coalesce(em.expenses, 0) as expenses
    from trip_monthly tm
    full outer join expense_monthly em on em.month_start = tm.month_start
  )
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'month', to_char(m.month_start, 'Mon YYYY'),
        'trips', m.trips,
        'revenue', m.revenue,
        'expenses', m.expenses
      )
      order by m.month_start
    ),
    '[]'::jsonb
  )
  into v_trend
  from merged m;

  with accessible_trips as (
    select t.*
    from public.trips t
    left join public.trip_owners tow on tow.trip_id = t.id
    where
      (p_owner_id is null or tow.sales_consigner_owner_id = p_owner_id)
      and (p_vehicle_type is null or btrim(p_vehicle_type) = '' or t.vehicle_type = p_vehicle_type)
      and (p_from_date is null or coalesce(t.completed_at::date, t.created_at::date) >= p_from_date)
      and (p_to_date is null or coalesce(t.completed_at::date, t.created_at::date) <= p_to_date)
  )
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'stage', s.current_stage::text,
        'count', s.cnt
      )
      order by s.current_stage::text
    ),
    '[]'::jsonb
  )
  into v_stage_mix
  from (
    select t.current_stage, count(*)::bigint as cnt
    from accessible_trips t
    group by t.current_stage
  ) s;

  with accessible_trips as (
    select t.id
    from public.trips t
    left join public.trip_owners tow on tow.trip_id = t.id
    where
      (p_owner_id is null or tow.sales_consigner_owner_id = p_owner_id)
      and (p_vehicle_type is null or btrim(p_vehicle_type) = '' or t.vehicle_type = p_vehicle_type)
      and (p_from_date is null or coalesce(t.completed_at::date, t.created_at::date) >= p_from_date)
      and (p_to_date is null or coalesce(t.completed_at::date, t.created_at::date) <= p_to_date)
  )
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'status', p.status::text,
        'count', p.cnt,
        'amount', p.amount
      )
      order by p.status::text
    ),
    '[]'::jsonb
  )
  into v_payment_mix
  from (
    select
      pr.status,
      count(*)::bigint as cnt,
      coalesce(sum(coalesce(pr.amount, 0)), 0)::numeric as amount
    from public.payment_requests pr
    join accessible_trips t on t.id = pr.trip_id
    group by pr.status
  ) p;

  return jsonb_build_object(
    'kpis', jsonb_build_object(
      'totalTrips', v_total_trips,
      'closedTrips', v_closed_trips,
      'revenue', v_revenue,
      'totalExpenses', v_total_expenses,
      'grossMarginPct', v_gross_margin_pct,
      'outstandingReceivables', v_outstanding_receivables
    ),
    'trend', v_trend,
    'stageMix', v_stage_mix,
    'paymentStatusMix', v_payment_mix,
    'reportStatus', jsonb_build_object(
      'tripPnl', 'partial',
      'fuelVariance', 'todo',
      'expenseSummary', 'partial',
      'utilization', 'partial',
      'salesPerformance', 'partial',
      'receivablesAging', 'todo'
    ),
    'dataQuality', jsonb_build_object(
      'status', 'partial',
      'notes', jsonb_build_array(
        'Fuel variance and receivables aging are marked TODO until data capture is complete.'
      )
    )
  );
end;
$$;

create or replace function public.report_trip_pnl_v1(
  p_actor_user_id uuid,
  p_from_date date default null,
  p_to_date date default null,
  p_owner_id uuid default null,
  p_vehicle_type text default null
)
returns jsonb
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  v_role public.role_type;
  v_rows jsonb := '[]'::jsonb;
  v_trip_count bigint := 0;
  v_revenue numeric := 0;
  v_expected_cost numeric := 0;
  v_actual_cost numeric := 0;
begin
  v_role := public.report_assert_actor_v1(p_actor_user_id);

  if p_from_date is not null and p_to_date is not null and p_from_date > p_to_date then
    raise exception 'invalid_date_range';
  end if;

  with accessible_trips as (
    select t.*
    from public.trips t
    left join public.trip_owners tow on tow.trip_id = t.id
    where
      t.leased_flag = true
      and (p_owner_id is null or tow.sales_consigner_owner_id = p_owner_id)
      and (p_vehicle_type is null or btrim(p_vehicle_type) = '' or t.vehicle_type = p_vehicle_type)
      and (p_from_date is null or coalesce(t.completed_at::date, t.created_at::date) >= p_from_date)
      and (p_to_date is null or coalesce(t.completed_at::date, t.created_at::date) <= p_to_date)
  ),
  expense_by_trip as (
    select e.trip_id, coalesce(sum(coalesce(e.amount, 0)), 0)::numeric as actual_cost
    from public.expense_entries e
    join accessible_trips t on t.id = e.trip_id
    group by e.trip_id
  ),
  policy_baseline as (
    select
      t.id as trip_id,
      coalesce(lvp.driver_da_per_day, 0) + coalesce(lvp.vehicle_rent_per_day, 0) as expected_cost
    from accessible_trips t
    left join public.leased_vehicle_policies lvp on lvp.vehicle_id = t.vehicle_id
  ),
  rows_data as (
    select
      t.id,
      t.trip_code,
      c.name as customer_name,
      coalesce(t.route, '') as route,
      coalesce(t.vehicle_number, '') as vehicle_number,
      coalesce(t.trip_amount, 0)::numeric as trip_amount,
      coalesce(pb.expected_cost, 0)::numeric as expected_cost,
      coalesce(ebt.actual_cost, 0)::numeric as actual_cost
    from accessible_trips t
    join public.customers c on c.id = t.customer_id
    left join expense_by_trip ebt on ebt.trip_id = t.id
    left join policy_baseline pb on pb.trip_id = t.id
  )
  select
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'tripId', r.id,
          'tripCode', r.trip_code,
          'customerName', r.customer_name,
          'route', r.route,
          'vehicleNumber', r.vehicle_number,
          'tripAmount', r.trip_amount,
          'expectedCost', r.expected_cost,
          'actualCost', r.actual_cost,
          'margin', (r.trip_amount - r.actual_cost),
          'variance', (r.actual_cost - r.expected_cost)
        )
        order by r.trip_code
      ),
      '[]'::jsonb
    ),
    count(*)::bigint,
    coalesce(sum(r.trip_amount), 0)::numeric,
    coalesce(sum(r.expected_cost), 0)::numeric,
    coalesce(sum(r.actual_cost), 0)::numeric
  into v_rows, v_trip_count, v_revenue, v_expected_cost, v_actual_cost
  from rows_data r;

  return jsonb_build_object(
    'summary', jsonb_build_object(
      'tripCount', v_trip_count,
      'revenue', v_revenue,
      'expectedCost', v_expected_cost,
      'actualCost', v_actual_cost,
      'margin', (v_revenue - v_actual_cost),
      'marginPct', case when v_revenue > 0 then round(((v_revenue - v_actual_cost) / v_revenue) * 100, 2) else 0 end
    ),
    'rows', v_rows,
    'dataQuality', jsonb_build_object(
      'status', 'partial',
      'notes', jsonb_build_array(
        'Expected cost currently uses policy baseline (driver DA + vehicle rent per day).'
      )
    )
  );
end;
$$;

create or replace function public.report_expense_summary_v1(
  p_actor_user_id uuid,
  p_from_date date default null,
  p_to_date date default null,
  p_owner_id uuid default null,
  p_vehicle_type text default null
)
returns jsonb
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  v_role public.role_type;
  v_total_expenses numeric := 0;
  v_over_cap_expenses numeric := 0;
  v_over_cap_count bigint := 0;
  v_category_breakdown jsonb := '[]'::jsonb;
  v_monthly_trend jsonb := '[]'::jsonb;
begin
  v_role := public.report_assert_actor_v1(p_actor_user_id);

  if p_from_date is not null and p_to_date is not null and p_from_date > p_to_date then
    raise exception 'invalid_date_range';
  end if;

  with accessible_trips as (
    select t.id
    from public.trips t
    left join public.trip_owners tow on tow.trip_id = t.id
    where
      (p_owner_id is null or tow.sales_consigner_owner_id = p_owner_id)
      and (p_vehicle_type is null or btrim(p_vehicle_type) = '' or t.vehicle_type = p_vehicle_type)
      and (p_from_date is null or coalesce(t.completed_at::date, t.created_at::date) >= p_from_date)
      and (p_to_date is null or coalesce(t.completed_at::date, t.created_at::date) <= p_to_date)
  )
  select
    coalesce(sum(coalesce(e.amount, 0)), 0)::numeric,
    coalesce(sum(case when e.cap_status::text = 'over_cap' then coalesce(e.amount, 0) else 0 end), 0)::numeric,
    count(*) filter (where e.cap_status::text = 'over_cap')::bigint
  into v_total_expenses, v_over_cap_expenses, v_over_cap_count
  from public.expense_entries e
  join accessible_trips t on t.id = e.trip_id
  where
    (p_from_date is null or e.created_at::date >= p_from_date)
    and (p_to_date is null or e.created_at::date <= p_to_date);

  with accessible_trips as (
    select t.id
    from public.trips t
    left join public.trip_owners tow on tow.trip_id = t.id
    where
      (p_owner_id is null or tow.sales_consigner_owner_id = p_owner_id)
      and (p_vehicle_type is null or btrim(p_vehicle_type) = '' or t.vehicle_type = p_vehicle_type)
      and (p_from_date is null or coalesce(t.completed_at::date, t.created_at::date) >= p_from_date)
      and (p_to_date is null or coalesce(t.completed_at::date, t.created_at::date) <= p_to_date)
  )
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'category', c.category::text,
        'amount', c.amount,
        'count', c.cnt,
        'overCapAmount', c.over_cap_amount
      )
      order by c.amount desc
    ),
    '[]'::jsonb
  )
  into v_category_breakdown
  from (
    select
      e.category,
      coalesce(sum(coalesce(e.amount, 0)), 0)::numeric as amount,
      count(*)::bigint as cnt,
      coalesce(sum(case when e.cap_status::text = 'over_cap' then coalesce(e.amount, 0) else 0 end), 0)::numeric as over_cap_amount
    from public.expense_entries e
    join accessible_trips t on t.id = e.trip_id
    where
      (p_from_date is null or e.created_at::date >= p_from_date)
      and (p_to_date is null or e.created_at::date <= p_to_date)
    group by e.category
  ) c;

  with accessible_trips as (
    select t.id
    from public.trips t
    left join public.trip_owners tow on tow.trip_id = t.id
    where
      (p_owner_id is null or tow.sales_consigner_owner_id = p_owner_id)
      and (p_vehicle_type is null or btrim(p_vehicle_type) = '' or t.vehicle_type = p_vehicle_type)
      and (p_from_date is null or coalesce(t.completed_at::date, t.created_at::date) >= p_from_date)
      and (p_to_date is null or coalesce(t.completed_at::date, t.created_at::date) <= p_to_date)
  )
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'month', to_char(m.month_start, 'Mon YYYY'),
        'total', m.total,
        'overCapTotal', m.over_cap_total
      )
      order by m.month_start
    ),
    '[]'::jsonb
  )
  into v_monthly_trend
  from (
    select
      date_trunc('month', e.created_at)::date as month_start,
      coalesce(sum(coalesce(e.amount, 0)), 0)::numeric as total,
      coalesce(sum(case when e.cap_status::text = 'over_cap' then coalesce(e.amount, 0) else 0 end), 0)::numeric as over_cap_total
    from public.expense_entries e
    join accessible_trips t on t.id = e.trip_id
    where
      (p_from_date is null or e.created_at::date >= p_from_date)
      and (p_to_date is null or e.created_at::date <= p_to_date)
    group by 1
  ) m;

  return jsonb_build_object(
    'summary', jsonb_build_object(
      'totalExpenses', v_total_expenses,
      'overCapExpenses', v_over_cap_expenses,
      'overCapCount', v_over_cap_count
    ),
    'categoryBreakdown', v_category_breakdown,
    'monthlyTrend', v_monthly_trend,
    'dataQuality', jsonb_build_object(
      'status', 'partial',
      'notes', jsonb_build_array(
        'Cap analysis is based on recorded cap_status in expense entries.'
      )
    )
  );
end;
$$;

create or replace function public.report_utilization_v1(
  p_actor_user_id uuid,
  p_from_date date default null,
  p_to_date date default null,
  p_owner_id uuid default null,
  p_vehicle_type text default null
)
returns jsonb
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  v_role public.role_type;
  v_from date := coalesce(p_from_date, current_date - 29);
  v_to date := coalesce(p_to_date, current_date);
  v_total_days integer;
  v_rows jsonb := '[]'::jsonb;
  v_total_leased bigint := 0;
  v_active_leased bigint := 0;
begin
  v_role := public.report_assert_actor_v1(p_actor_user_id);

  if v_from > v_to then
    raise exception 'invalid_date_range';
  end if;

  v_total_days := greatest(1, (v_to - v_from + 1));

  with leased_vehicles as (
    select v.id, v.number, v.type
    from public.vehicles v
    where
      v.ownership_type::text = 'leased'
      and (p_vehicle_type is null or btrim(p_vehicle_type) = '' or v.type = p_vehicle_type)
  ),
  filtered_trips as (
    select t.*
    from public.trips t
    left join public.trip_owners tow on tow.trip_id = t.id
    where
      t.vehicle_id is not null
      and t.leased_flag = true
      and (p_owner_id is null or tow.sales_consigner_owner_id = p_owner_id)
      and (p_vehicle_type is null or btrim(p_vehicle_type) = '' or t.vehicle_type = p_vehicle_type)
      and (coalesce(t.completed_at::date, t.created_at::date) between v_from and v_to)
  ),
  vehicle_stats as (
    select
      lv.id as vehicle_id,
      lv.number as vehicle_number,
      lv.type as vehicle_type,
      count(ft.id)::bigint as trips_count,
      coalesce(sum(coalesce(ft.trip_amount, 0)), 0)::numeric as total_revenue,
      count(distinct coalesce(ft.completed_at::date, ft.created_at::date))::integer as active_days
    from leased_vehicles lv
    left join filtered_trips ft on ft.vehicle_id = lv.id
    group by lv.id, lv.number, lv.type
  )
  select
    coalesce(jsonb_agg(
      jsonb_build_object(
        'vehicleId', s.vehicle_id,
        'vehicleNumber', s.vehicle_number,
        'vehicleType', s.vehicle_type,
        'tripsCount', s.trips_count,
        'activeDays', s.active_days,
        'idleDays', greatest(0, v_total_days - s.active_days),
        'utilizationPct', round((s.active_days::numeric / v_total_days::numeric) * 100, 2),
        'totalRevenue', s.total_revenue
      )
      order by s.trips_count desc, s.vehicle_number
    ), '[]'::jsonb),
    count(*)::bigint,
    count(*) filter (where s.trips_count > 0)::bigint
  into v_rows, v_total_leased, v_active_leased
  from vehicle_stats s;

  return jsonb_build_object(
    'summary', jsonb_build_object(
      'windowDays', v_total_days,
      'totalLeasedVehicles', v_total_leased,
      'activeLeasedVehicles', v_active_leased,
      'utilizationPct', case when v_total_leased > 0 then round((v_active_leased::numeric / v_total_leased::numeric) * 100, 2) else 0 end
    ),
    'rows', v_rows,
    'dataQuality', jsonb_build_object(
      'status', 'partial',
      'notes', jsonb_build_array(
        'Idle days are computed from trip activity days in selected date window.'
      )
    )
  );
end;
$$;

create or replace function public.report_sales_performance_v1(
  p_actor_user_id uuid,
  p_from_date date default null,
  p_to_date date default null,
  p_owner_id uuid default null,
  p_vehicle_type text default null
)
returns jsonb
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  v_role public.role_type;
  v_rows jsonb := '[]'::jsonb;
  v_total_revenue numeric := 0;
  v_total_collected numeric := 0;
  v_total_outstanding numeric := 0;
begin
  v_role := public.report_assert_actor_v1(p_actor_user_id);

  if p_from_date is not null and p_to_date is not null and p_from_date > p_to_date then
    raise exception 'invalid_date_range';
  end if;

  with accessible_trips as (
    select t.*, tow.sales_consigner_owner_id
    from public.trips t
    left join public.trip_owners tow on tow.trip_id = t.id
    where
      (p_owner_id is null or tow.sales_consigner_owner_id = p_owner_id)
      and (p_vehicle_type is null or btrim(p_vehicle_type) = '' or t.vehicle_type = p_vehicle_type)
      and (p_from_date is null or coalesce(t.completed_at::date, t.created_at::date) >= p_from_date)
      and (p_to_date is null or coalesce(t.completed_at::date, t.created_at::date) <= p_to_date)
  ),
  receivable_by_trip as (
    select
      r.trip_id,
      coalesce(sum(case when r.collected_status::text = 'collected' then coalesce(r.amount, 0) else 0 end), 0)::numeric as collected_amount,
      coalesce(sum(case when r.collected_status::text in ('pending', 'partial', 'overdue') then coalesce(r.amount, 0) else 0 end), 0)::numeric as outstanding_amount
    from public.receivables r
    join accessible_trips t on t.id = r.trip_id
    group by r.trip_id
  ),
  owner_agg as (
    select
      at.sales_consigner_owner_id as owner_id,
      coalesce(p.full_name, 'Unassigned') as owner_name,
      count(*)::bigint as trips_count,
      count(*) filter (where at.current_stage::text = 'closed')::bigint as closed_trips,
      coalesce(sum(coalesce(at.trip_amount, 0)), 0)::numeric as revenue,
      coalesce(sum(coalesce(rbt.collected_amount, 0)), 0)::numeric as collected_amount,
      coalesce(sum(coalesce(rbt.outstanding_amount, 0)), 0)::numeric as outstanding_amount
    from accessible_trips at
    left join public.profiles p on p.id = at.sales_consigner_owner_id
    left join receivable_by_trip rbt on rbt.trip_id = at.id
    group by at.sales_consigner_owner_id, p.full_name
  )
  select
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'ownerId', o.owner_id,
          'ownerName', o.owner_name,
          'tripsCount', o.trips_count,
          'closedTrips', o.closed_trips,
          'revenue', o.revenue,
          'collectedAmount', o.collected_amount,
          'outstandingAmount', o.outstanding_amount,
          'collectionRatioPct',
            case
              when (o.collected_amount + o.outstanding_amount) > 0 then
                round((o.collected_amount / (o.collected_amount + o.outstanding_amount)) * 100, 2)
              else 0
            end
        )
        order by o.revenue desc, o.owner_name
      ),
      '[]'::jsonb
    ),
    coalesce(sum(o.revenue), 0)::numeric,
    coalesce(sum(o.collected_amount), 0)::numeric,
    coalesce(sum(o.outstanding_amount), 0)::numeric
  into v_rows, v_total_revenue, v_total_collected, v_total_outstanding
  from owner_agg o;

  return jsonb_build_object(
    'summary', jsonb_build_object(
      'totalRevenue', v_total_revenue,
      'totalCollected', v_total_collected,
      'totalOutstanding', v_total_outstanding,
      'collectionRatioPct',
        case
          when (v_total_collected + v_total_outstanding) > 0 then
            round((v_total_collected / (v_total_collected + v_total_outstanding)) * 100, 2)
          else 0
        end
    ),
    'rows', v_rows,
    'dataQuality', jsonb_build_object(
      'status', 'partial',
      'notes', jsonb_build_array(
        'Collection metrics depend on receivables data completeness.'
      )
    )
  );
end;
$$;

create or replace function public.report_fuel_variance_v1(
  p_actor_user_id uuid,
  p_from_date date default null,
  p_to_date date default null,
  p_owner_id uuid default null,
  p_vehicle_type text default null
)
returns jsonb
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  v_role public.role_type;
  v_rows jsonb := '[]'::jsonb;
begin
  v_role := public.report_assert_actor_v1(p_actor_user_id);

  if p_from_date is not null and p_to_date is not null and p_from_date > p_to_date then
    raise exception 'invalid_date_range';
  end if;

  with accessible_trips as (
    select t.*
    from public.trips t
    left join public.trip_owners tow on tow.trip_id = t.id
    where
      (p_owner_id is null or tow.sales_consigner_owner_id = p_owner_id)
      and (p_vehicle_type is null or btrim(p_vehicle_type) = '' or t.vehicle_type = p_vehicle_type)
      and (p_from_date is null or coalesce(t.completed_at::date, t.created_at::date) >= p_from_date)
      and (p_to_date is null or coalesce(t.completed_at::date, t.created_at::date) <= p_to_date)
  ),
  cp as (
    select
      o.trip_id,
      min(o.reading) filter (where o.reading is not null) as min_reading,
      max(o.reading) filter (where o.reading is not null) as max_reading,
      coalesce(sum(coalesce(o.fuel_liters, 0)), 0)::numeric as fuel_liters,
      coalesce(sum(coalesce(o.fuel_amount, 0)), 0)::numeric as fuel_amount
    from public.odometer_checkpoints o
    join accessible_trips t on t.id = o.trip_id
    group by o.trip_id
  )
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'tripId', t.id,
        'tripCode', t.trip_code,
        'route', coalesce(t.route, ''),
        'vehicleNumber', coalesce(t.vehicle_number, ''),
        'actualKm', case when c.min_reading is not null and c.max_reading is not null then (c.max_reading - c.min_reading) else null end,
        'fuelLiters', c.fuel_liters,
        'fuelAmount', c.fuel_amount,
        'fuelAmountPerKm',
          case
            when c.min_reading is not null and c.max_reading is not null and (c.max_reading - c.min_reading) > 0 then
              round(c.fuel_amount / (c.max_reading - c.min_reading), 2)
            else null
          end,
        'expectedFuelAmountPerKm', null,
        'variancePct', null
      )
      order by t.trip_code
    ),
    '[]'::jsonb
  )
  into v_rows
  from accessible_trips t
  left join cp c on c.trip_id = t.id;

  return jsonb_build_object(
    'summary', jsonb_build_object(
      'status', 'todo'
    ),
    'rows', v_rows,
    'dataQuality', jsonb_build_object(
      'status', 'todo',
      'notes', jsonb_build_array(
        'Expected fuel model is not finalized yet. Report currently shows actuals only.'
      )
    )
  );
end;
$$;

create or replace function public.report_receivables_aging_v1(
  p_actor_user_id uuid,
  p_from_date date default null,
  p_to_date date default null,
  p_owner_id uuid default null,
  p_vehicle_type text default null
)
returns jsonb
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  v_role public.role_type;
  v_bucket_rows jsonb := '[]'::jsonb;
  v_customer_rows jsonb := '[]'::jsonb;
  v_total_outstanding numeric := 0;
begin
  v_role := public.report_assert_actor_v1(p_actor_user_id);

  if p_from_date is not null and p_to_date is not null and p_from_date > p_to_date then
    raise exception 'invalid_date_range';
  end if;

  with accessible_trips as (
    select t.id
    from public.trips t
    left join public.trip_owners tow on tow.trip_id = t.id
    where
      (p_owner_id is null or tow.sales_consigner_owner_id = p_owner_id)
      and (p_vehicle_type is null or btrim(p_vehicle_type) = '' or t.vehicle_type = p_vehicle_type)
      and (p_from_date is null or coalesce(t.completed_at::date, t.created_at::date) >= p_from_date)
      and (p_to_date is null or coalesce(t.completed_at::date, t.created_at::date) <= p_to_date)
  )
  select coalesce(sum(coalesce(r.amount, 0)), 0)::numeric
  into v_total_outstanding
  from public.receivables r
  join accessible_trips t on t.id = r.trip_id
  where r.collected_status::text in ('pending', 'partial', 'overdue');

  with accessible_trips as (
    select t.id
    from public.trips t
    left join public.trip_owners tow on tow.trip_id = t.id
    where
      (p_owner_id is null or tow.sales_consigner_owner_id = p_owner_id)
      and (p_vehicle_type is null or btrim(p_vehicle_type) = '' or t.vehicle_type = p_vehicle_type)
      and (p_from_date is null or coalesce(t.completed_at::date, t.created_at::date) >= p_from_date)
      and (p_to_date is null or coalesce(t.completed_at::date, t.created_at::date) <= p_to_date)
  )
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'bucket', b.aging_bucket::text,
        'count', b.cnt,
        'amount', b.amount
      )
      order by b.aging_bucket::text
    ),
    '[]'::jsonb
  )
  into v_bucket_rows
  from (
    select
      r.aging_bucket,
      count(*)::bigint as cnt,
      coalesce(sum(coalesce(r.amount, 0)), 0)::numeric as amount
    from public.receivables r
    join accessible_trips t on t.id = r.trip_id
    where r.collected_status::text in ('pending', 'partial', 'overdue')
    group by r.aging_bucket
  ) b;

  with accessible_trips as (
    select t.id
    from public.trips t
    left join public.trip_owners tow on tow.trip_id = t.id
    where
      (p_owner_id is null or tow.sales_consigner_owner_id = p_owner_id)
      and (p_vehicle_type is null or btrim(p_vehicle_type) = '' or t.vehicle_type = p_vehicle_type)
      and (p_from_date is null or coalesce(t.completed_at::date, t.created_at::date) >= p_from_date)
      and (p_to_date is null or coalesce(t.completed_at::date, t.created_at::date) <= p_to_date)
  )
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'customerId', c.id,
        'customerName', c.name,
        'outstandingAmount', c.outstanding_amount,
        'itemsCount', c.items_count
      )
      order by c.outstanding_amount desc, c.name
    ),
    '[]'::jsonb
  )
  into v_customer_rows
  from (
    select
      cu.id,
      cu.name,
      coalesce(sum(coalesce(r.amount, 0)), 0)::numeric as outstanding_amount,
      count(*)::bigint as items_count
    from public.receivables r
    join accessible_trips t on t.id = r.trip_id
    join public.customers cu on cu.id = r.customer_id
    where r.collected_status::text in ('pending', 'partial', 'overdue')
    group by cu.id, cu.name
  ) c;

  return jsonb_build_object(
    'summary', jsonb_build_object(
      'totalOutstanding', v_total_outstanding
    ),
    'buckets', v_bucket_rows,
    'customers', v_customer_rows,
    'dataQuality', jsonb_build_object(
      'status', 'todo',
      'notes', jsonb_build_array(
        'Receivables lifecycle and follow-up workflows are still being finalized.'
      )
    )
  );
end;
$$;

grant execute on function public.report_assert_actor_v1(uuid) to authenticated;
grant execute on function public.report_overview_v1(uuid, date, date, uuid, text) to authenticated;
grant execute on function public.report_trip_pnl_v1(uuid, date, date, uuid, text) to authenticated;
grant execute on function public.report_expense_summary_v1(uuid, date, date, uuid, text) to authenticated;
grant execute on function public.report_utilization_v1(uuid, date, date, uuid, text) to authenticated;
grant execute on function public.report_sales_performance_v1(uuid, date, date, uuid, text) to authenticated;
grant execute on function public.report_fuel_variance_v1(uuid, date, date, uuid, text) to authenticated;
grant execute on function public.report_receivables_aging_v1(uuid, date, date, uuid, text) to authenticated;
