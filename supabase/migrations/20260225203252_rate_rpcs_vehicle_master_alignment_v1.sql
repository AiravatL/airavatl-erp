begin;

create or replace function public.rate_submit_v1(
  p_from_location text,
  p_to_location text,
  p_vehicle_type text,
  p_rate_category rate_category,
  p_freight_rate numeric,
  p_rate_per_ton numeric default null,
  p_rate_per_kg numeric default null,
  p_confidence_level text default null,
  p_source text default null,
  p_remarks text default null,
  p_actor_user_id uuid default null
)
returns table(
  id uuid,
  from_location text,
  to_location text,
  vehicle_type text,
  rate_category rate_category,
  freight_rate numeric,
  rate_per_ton numeric,
  rate_per_kg numeric,
  confidence_level text,
  source text,
  remarks text,
  review_remarks text,
  submitted_by_id uuid,
  submitted_by_name text,
  reviewed_by_id uuid,
  reviewed_by_name text,
  status rate_status,
  created_at timestamptz,
  reviewed_at timestamptz,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = 'public', 'auth'
as $$
declare
  v_actor_id uuid;
  v_actor_role public.role_type;
  v_actor_active boolean;
  v_actor_name text;
  v_row public.market_rates%rowtype;
  v_auto_approve boolean;
  v_vehicle_valid boolean;
  v_vehicle_type text;
  v_vehicle_type_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  v_actor_id := coalesce(p_actor_user_id, auth.uid());

  if v_actor_id is distinct from auth.uid() then
    raise exception 'Actor mismatch' using errcode = '42501';
  end if;

  select p.role, p.active, p.full_name
  into v_actor_role, v_actor_active, v_actor_name
  from public.profiles p
  where p.id = v_actor_id;

  if v_actor_role is null or coalesce(v_actor_active, false) is false then
    raise exception 'Actor profile is missing or inactive' using errcode = '42501';
  end if;

  if v_actor_role not in ('sales_vehicles', 'operations_vehicles', 'admin', 'super_admin') then
    raise exception 'Insufficient privileges to submit rate' using errcode = '42501';
  end if;

  if nullif(trim(p_from_location), '') is null then
    raise exception 'from_location is required' using errcode = '22023';
  end if;

  if nullif(trim(p_to_location), '') is null then
    raise exception 'to_location is required' using errcode = '22023';
  end if;

  if nullif(trim(p_vehicle_type), '') is null then
    raise exception 'vehicle_type is required' using errcode = '22023';
  end if;

  if p_freight_rate is null or p_freight_rate <= 0 then
    raise exception 'freight_rate must be greater than zero' using errcode = '22023';
  end if;

  if p_rate_per_ton is not null and p_rate_per_ton < 0 then
    raise exception 'rate_per_ton must be non-negative' using errcode = '22023';
  end if;

  if p_rate_per_kg is not null and p_rate_per_kg < 0 then
    raise exception 'rate_per_kg must be non-negative' using errcode = '22023';
  end if;

  select vm.is_valid, vm.normalized_vehicle_type
  into v_vehicle_valid, v_vehicle_type
  from public.vehicle_master_validate_selection_v1(trim(p_vehicle_type), null, false) vm
  limit 1;

  if coalesce(v_vehicle_valid, false) is false then
    raise exception 'unknown_vehicle_type' using errcode = '22023';
  end if;

  select t.id, t.name
  into v_vehicle_type_id, v_vehicle_type
  from public.vehicle_master_types t
  where lower(btrim(t.name)) = lower(btrim(coalesce(v_vehicle_type, p_vehicle_type)))
  limit 1;

  if v_vehicle_type_id is null then
    raise exception 'unknown_vehicle_type' using errcode = '22023';
  end if;

  v_auto_approve := v_actor_role in ('operations_vehicles', 'admin', 'super_admin');

  insert into public.market_rates (
    from_location,
    to_location,
    vehicle_type,
    vehicle_type_id,
    rate_category,
    freight_rate,
    rate_per_ton,
    rate_per_kg,
    confidence_level,
    source,
    remarks,
    submitted_by_id,
    status,
    reviewed_by_id,
    reviewed_at,
    created_at,
    updated_at
  )
  values (
    trim(p_from_location),
    trim(p_to_location),
    v_vehicle_type,
    v_vehicle_type_id,
    p_rate_category,
    p_freight_rate,
    p_rate_per_ton,
    p_rate_per_kg,
    nullif(trim(p_confidence_level), ''),
    nullif(trim(p_source), ''),
    nullif(trim(p_remarks), ''),
    v_actor_id,
    case when v_auto_approve then 'approved'::public.rate_status else 'pending'::public.rate_status end,
    case when v_auto_approve then v_actor_id else null end,
    case when v_auto_approve then now() else null end,
    now(),
    now()
  )
  returning * into v_row;

  insert into public.audit_logs (
    entity,
    entity_id,
    action,
    actor_id,
    actor_name,
    actor_role,
    details,
    before_data,
    after_data,
    created_at
  )
  values (
    'market_rate',
    v_row.id,
    'create',
    v_actor_id,
    v_actor_name,
    v_actor_role,
    case when v_auto_approve then 'Rate created and auto-approved' else 'Rate submitted for review' end,
    null,
    to_jsonb(v_row),
    now()
  );

  return query
  select
    mr.id,
    mr.from_location,
    mr.to_location,
    mr.vehicle_type,
    mr.rate_category,
    mr.freight_rate,
    mr.rate_per_ton,
    mr.rate_per_kg,
    mr.confidence_level,
    mr.source,
    mr.remarks,
    mr.review_remarks,
    mr.submitted_by_id,
    submitter.full_name as submitted_by_name,
    mr.reviewed_by_id,
    reviewer.full_name as reviewed_by_name,
    mr.status,
    mr.created_at,
    mr.reviewed_at,
    mr.updated_at
  from public.market_rates mr
  left join public.profiles submitter on submitter.id = mr.submitted_by_id
  left join public.profiles reviewer on reviewer.id = mr.reviewed_by_id
  where mr.id = v_row.id;
end;
$$;

create or replace function public.rate_update_v1(
  p_rate_id uuid,
  p_from_location text,
  p_to_location text,
  p_vehicle_type text,
  p_rate_category rate_category,
  p_freight_rate numeric,
  p_rate_per_ton numeric default null,
  p_rate_per_kg numeric default null,
  p_confidence_level text default null,
  p_source text default null,
  p_remarks text default null,
  p_actor_user_id uuid default null
)
returns table(
  id uuid,
  from_location text,
  to_location text,
  vehicle_type text,
  rate_category rate_category,
  freight_rate numeric,
  rate_per_ton numeric,
  rate_per_kg numeric,
  confidence_level text,
  source text,
  remarks text,
  review_remarks text,
  submitted_by_id uuid,
  submitted_by_name text,
  reviewed_by_id uuid,
  reviewed_by_name text,
  status rate_status,
  created_at timestamptz,
  reviewed_at timestamptz,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = 'public', 'auth'
as $$
declare
  v_actor_id uuid;
  v_actor_role public.role_type;
  v_actor_active boolean;
  v_actor_name text;
  v_before public.market_rates%rowtype;
  v_after public.market_rates%rowtype;
  v_auto_approve boolean;
  v_vehicle_valid boolean;
  v_vehicle_type text;
  v_vehicle_type_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  if p_rate_id is null then
    raise exception 'rate_id is required' using errcode = '22023';
  end if;

  v_actor_id := coalesce(p_actor_user_id, auth.uid());
  if v_actor_id is distinct from auth.uid() then
    raise exception 'Actor mismatch' using errcode = '42501';
  end if;

  select p.role, p.active, p.full_name
  into v_actor_role, v_actor_active, v_actor_name
  from public.profiles p
  where p.id = v_actor_id;

  if v_actor_role is null or coalesce(v_actor_active, false) is false then
    raise exception 'Actor profile is missing or inactive' using errcode = '42501';
  end if;

  if v_actor_role not in ('sales_vehicles', 'operations_vehicles', 'admin', 'super_admin') then
    raise exception 'Insufficient privileges to edit rate' using errcode = '42501';
  end if;

  if nullif(trim(p_from_location), '') is null then
    raise exception 'from_location is required' using errcode = '22023';
  end if;

  if nullif(trim(p_to_location), '') is null then
    raise exception 'to_location is required' using errcode = '22023';
  end if;

  if nullif(trim(p_vehicle_type), '') is null then
    raise exception 'vehicle_type is required' using errcode = '22023';
  end if;

  if p_freight_rate is null or p_freight_rate <= 0 then
    raise exception 'freight_rate must be greater than zero' using errcode = '22023';
  end if;

  if p_rate_per_ton is not null and p_rate_per_ton < 0 then
    raise exception 'rate_per_ton must be non-negative' using errcode = '22023';
  end if;

  if p_rate_per_kg is not null and p_rate_per_kg < 0 then
    raise exception 'rate_per_kg must be non-negative' using errcode = '22023';
  end if;

  select *
  into v_before
  from public.market_rates mr
  where mr.id = p_rate_id
  for update;

  if v_before.id is null then
    raise exception 'Rate not found' using errcode = '22023';
  end if;

  if v_actor_role = 'sales_vehicles' and v_before.submitted_by_id <> v_actor_id then
    raise exception 'Sales user can edit only own rates' using errcode = '42501';
  end if;

  select vm.is_valid, vm.normalized_vehicle_type
  into v_vehicle_valid, v_vehicle_type
  from public.vehicle_master_validate_selection_v1(trim(p_vehicle_type), null, true) vm
  limit 1;

  if coalesce(v_vehicle_valid, false) is false then
    raise exception 'unknown_vehicle_type' using errcode = '22023';
  end if;

  select t.id, t.name
  into v_vehicle_type_id, v_vehicle_type
  from public.vehicle_master_types t
  where lower(btrim(t.name)) = lower(btrim(coalesce(v_vehicle_type, p_vehicle_type)))
  limit 1;

  if v_vehicle_type_id is null then
    raise exception 'unknown_vehicle_type' using errcode = '22023';
  end if;

  v_auto_approve := v_actor_role in ('operations_vehicles', 'admin', 'super_admin');

  update public.market_rates mr
  set
    from_location = trim(p_from_location),
    to_location = trim(p_to_location),
    vehicle_type = v_vehicle_type,
    vehicle_type_id = v_vehicle_type_id,
    rate_category = p_rate_category,
    freight_rate = p_freight_rate,
    rate_per_ton = p_rate_per_ton,
    rate_per_kg = p_rate_per_kg,
    confidence_level = nullif(trim(p_confidence_level), ''),
    source = nullif(trim(p_source), ''),
    remarks = nullif(trim(p_remarks), ''),
    status = case when v_auto_approve then 'approved'::public.rate_status else 'pending'::public.rate_status end,
    reviewed_by_id = case when v_auto_approve then v_actor_id else null end,
    reviewed_at = case when v_auto_approve then now() else null end,
    review_remarks = case when v_auto_approve then null else null end,
    updated_at = now()
  where mr.id = p_rate_id
  returning * into v_after;

  insert into public.audit_logs (
    entity,
    entity_id,
    action,
    actor_id,
    actor_name,
    actor_role,
    details,
    before_data,
    after_data,
    created_at
  )
  values (
    'market_rate',
    v_after.id,
    'edit',
    v_actor_id,
    v_actor_name,
    v_actor_role,
    case when v_auto_approve then 'Rate edited and auto-approved' else 'Rate edited and sent for review' end,
    to_jsonb(v_before),
    to_jsonb(v_after),
    now()
  );

  return query
  select
    mr.id,
    mr.from_location,
    mr.to_location,
    mr.vehicle_type,
    mr.rate_category,
    mr.freight_rate,
    mr.rate_per_ton,
    mr.rate_per_kg,
    mr.confidence_level,
    mr.source,
    mr.remarks,
    mr.review_remarks,
    mr.submitted_by_id,
    submitter.full_name as submitted_by_name,
    mr.reviewed_by_id,
    reviewer.full_name as reviewed_by_name,
    mr.status,
    mr.created_at,
    mr.reviewed_at,
    mr.updated_at
  from public.market_rates mr
  left join public.profiles submitter on submitter.id = mr.submitted_by_id
  left join public.profiles reviewer on reviewer.id = mr.reviewed_by_id
  where mr.id = v_after.id;
end;
$$;

commit;
