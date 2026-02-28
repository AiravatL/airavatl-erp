begin;

-- Request workflow enums
do $$
begin
  if not exists (
    select 1
    from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'public' and t.typname = 'rate_request_status'
  ) then
    create type public.rate_request_status as enum ('open', 'fulfilled', 'cancelled');
  end if;

  if not exists (
    select 1
    from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'public' and t.typname = 'rate_request_quote_status'
  ) then
    create type public.rate_request_quote_status as enum ('pending_review', 'approved', 'rejected');
  end if;
end;
$$;

create table if not exists public.rate_requests (
  id uuid primary key default gen_random_uuid(),
  from_location text not null,
  to_location text not null,
  vehicle_type text not null,
  vehicle_type_id uuid not null references public.vehicle_master_types(id),
  rate_category public.rate_category not null,
  notes text,
  status public.rate_request_status not null default 'open',
  requested_by_id uuid not null references public.profiles(id),
  requested_by_role public.role_type not null,
  published_rate_id uuid references public.market_rates(id),
  fulfilled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.rate_request_quotes (
  id uuid primary key default gen_random_uuid(),
  rate_request_id uuid not null references public.rate_requests(id) on delete cascade,
  freight_rate numeric not null,
  rate_per_ton numeric,
  rate_per_kg numeric,
  confidence_level text,
  source text,
  remarks text,
  status public.rate_request_quote_status not null,
  quoted_by_id uuid not null references public.profiles(id),
  reviewed_by_id uuid references public.profiles(id),
  review_remarks text,
  published_rate_id uuid references public.market_rates(id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint rate_request_quotes_freight_rate_positive check (freight_rate > 0),
  constraint rate_request_quotes_rate_per_ton_non_negative check (rate_per_ton is null or rate_per_ton >= 0),
  constraint rate_request_quotes_rate_per_kg_non_negative check (rate_per_kg is null or rate_per_kg >= 0)
);

create index if not exists idx_rate_requests_status_created_at
  on public.rate_requests (status, created_at desc);

create index if not exists idx_rate_requests_requested_by_created_at
  on public.rate_requests (requested_by_id, created_at desc);

create index if not exists idx_rate_requests_vehicle_route
  on public.rate_requests (vehicle_type_id, from_location, to_location);

create index if not exists idx_rate_request_quotes_request_created_at
  on public.rate_request_quotes (rate_request_id, created_at desc);

create index if not exists idx_rate_request_quotes_status_created_at
  on public.rate_request_quotes (status, created_at desc);

create index if not exists idx_rate_request_quotes_quoted_by_created_at
  on public.rate_request_quotes (quoted_by_id, created_at desc);

create unique index if not exists ux_rate_request_quotes_pending_review
  on public.rate_request_quotes (rate_request_id)
  where status = 'pending_review'::public.rate_request_quote_status;

-- Create request by consigner/admin roles.
create or replace function public.rate_request_create_v1(
  p_from_location text,
  p_to_location text,
  p_vehicle_type text,
  p_rate_category public.rate_category,
  p_notes text default null,
  p_actor_user_id uuid default null
)
returns table (
  id uuid,
  from_location text,
  to_location text,
  vehicle_type text,
  vehicle_type_id uuid,
  rate_category public.rate_category,
  notes text,
  status public.rate_request_status,
  requested_by_id uuid,
  requested_by_name text,
  requested_by_role public.role_type,
  published_rate_id uuid,
  fulfilled_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz,
  latest_quote_id uuid,
  latest_quote_status public.rate_request_quote_status,
  latest_freight_rate numeric,
  latest_quoted_by_id uuid,
  latest_quoted_by_name text,
  latest_quoted_at timestamptz
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
  v_request_id uuid;
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
    raise exception 'actor_not_found' using errcode = '42501';
  end if;

  if v_actor_role not in ('sales_consigner', 'operations_consigner', 'admin', 'super_admin') then
    raise exception 'permission_denied' using errcode = '42501';
  end if;

  if nullif(trim(p_from_location), '') is null then
    raise exception 'from_location_required' using errcode = '22023';
  end if;

  if nullif(trim(p_to_location), '') is null then
    raise exception 'to_location_required' using errcode = '22023';
  end if;

  if nullif(trim(p_vehicle_type), '') is null then
    raise exception 'vehicle_type_required' using errcode = '22023';
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

  insert into public.rate_requests (
    from_location,
    to_location,
    vehicle_type,
    vehicle_type_id,
    rate_category,
    notes,
    status,
    requested_by_id,
    requested_by_role,
    created_at,
    updated_at
  )
  values (
    trim(p_from_location),
    trim(p_to_location),
    v_vehicle_type,
    v_vehicle_type_id,
    p_rate_category,
    nullif(trim(coalesce(p_notes, '')), ''),
    'open'::public.rate_request_status,
    v_actor_id,
    v_actor_role,
    now(),
    now()
  )
  returning rate_requests.id into v_request_id;

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
    'rate_request',
    v_request_id,
    'create',
    v_actor_id,
    v_actor_name,
    v_actor_role,
    'Rate request created',
    null,
    jsonb_build_object(
      'from_location', trim(p_from_location),
      'to_location', trim(p_to_location),
      'vehicle_type', v_vehicle_type,
      'rate_category', p_rate_category::text
    ),
    now()
  );

  return query
  select
    rr.id,
    rr.from_location,
    rr.to_location,
    rr.vehicle_type,
    rr.vehicle_type_id,
    rr.rate_category,
    rr.notes,
    rr.status,
    rr.requested_by_id,
    requester.full_name as requested_by_name,
    rr.requested_by_role,
    rr.published_rate_id,
    rr.fulfilled_at,
    rr.created_at,
    rr.updated_at,
    latest.id as latest_quote_id,
    latest.status as latest_quote_status,
    latest.freight_rate as latest_freight_rate,
    latest.quoted_by_id as latest_quoted_by_id,
    latest_quoter.full_name as latest_quoted_by_name,
    latest.created_at as latest_quoted_at
  from public.rate_requests rr
  left join public.profiles requester on requester.id = rr.requested_by_id
  left join lateral (
    select q.id, q.status, q.freight_rate, q.quoted_by_id, q.created_at
    from public.rate_request_quotes q
    where q.rate_request_id = rr.id
    order by q.created_at desc
    limit 1
  ) latest on true
  left join public.profiles latest_quoter on latest_quoter.id = latest.quoted_by_id
  where rr.id = v_request_id;
end;
$$;

-- Role-aware list for request tracker and pricing queue.
create or replace function public.rate_request_list_v1(
  p_status public.rate_request_status default null,
  p_search text default null,
  p_limit integer default 100,
  p_offset integer default 0,
  p_actor_user_id uuid default null
)
returns table (
  id uuid,
  from_location text,
  to_location text,
  vehicle_type text,
  vehicle_type_id uuid,
  rate_category public.rate_category,
  notes text,
  status public.rate_request_status,
  requested_by_id uuid,
  requested_by_name text,
  requested_by_role public.role_type,
  published_rate_id uuid,
  fulfilled_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz,
  latest_quote_id uuid,
  latest_quote_status public.rate_request_quote_status,
  latest_freight_rate numeric,
  latest_quoted_by_id uuid,
  latest_quoted_by_name text,
  latest_quoted_at timestamptz
)
language plpgsql
security definer
set search_path = 'public', 'auth'
as $$
declare
  v_actor_id uuid;
  v_actor_role public.role_type;
  v_actor_active boolean;
  v_limit integer;
  v_offset integer;
  v_search text;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  v_actor_id := coalesce(p_actor_user_id, auth.uid());
  if v_actor_id is distinct from auth.uid() then
    raise exception 'Actor mismatch' using errcode = '42501';
  end if;

  select p.role, p.active
  into v_actor_role, v_actor_active
  from public.profiles p
  where p.id = v_actor_id;

  if v_actor_role is null or coalesce(v_actor_active, false) is false then
    raise exception 'actor_not_found' using errcode = '42501';
  end if;

  if v_actor_role not in ('sales_consigner', 'operations_consigner', 'sales_vehicles', 'operations_vehicles', 'admin', 'super_admin') then
    raise exception 'permission_denied' using errcode = '42501';
  end if;

  v_limit := greatest(1, least(coalesce(p_limit, 100), 300));
  v_offset := greatest(0, coalesce(p_offset, 0));
  v_search := nullif(trim(coalesce(p_search, '')), '');

  return query
  select
    rr.id,
    rr.from_location,
    rr.to_location,
    rr.vehicle_type,
    rr.vehicle_type_id,
    rr.rate_category,
    rr.notes,
    rr.status,
    rr.requested_by_id,
    requester.full_name as requested_by_name,
    rr.requested_by_role,
    rr.published_rate_id,
    rr.fulfilled_at,
    rr.created_at,
    rr.updated_at,
    latest.id as latest_quote_id,
    latest.status as latest_quote_status,
    latest.freight_rate as latest_freight_rate,
    latest.quoted_by_id as latest_quoted_by_id,
    latest_quoter.full_name as latest_quoted_by_name,
    latest.created_at as latest_quoted_at
  from public.rate_requests rr
  join public.profiles requester on requester.id = rr.requested_by_id
  left join lateral (
    select q.id, q.status, q.freight_rate, q.quoted_by_id, q.created_at
    from public.rate_request_quotes q
    where q.rate_request_id = rr.id
    order by q.created_at desc
    limit 1
  ) latest on true
  left join public.profiles latest_quoter on latest_quoter.id = latest.quoted_by_id
  where
    (p_status is null or rr.status = p_status)
    and (
      v_search is null
      or rr.from_location ilike ('%' || v_search || '%')
      or rr.to_location ilike ('%' || v_search || '%')
      or rr.vehicle_type ilike ('%' || v_search || '%')
      or coalesce(rr.notes, '') ilike ('%' || v_search || '%')
    )
    and (
      v_actor_role in ('admin', 'super_admin', 'sales_vehicles', 'operations_vehicles')
      or rr.requested_by_id = v_actor_id
    )
  order by
    case rr.status
      when 'open'::public.rate_request_status then 1
      when 'fulfilled'::public.rate_request_status then 2
      else 3
    end,
    rr.created_at desc
  limit v_limit
  offset v_offset;
end;
$$;

create or replace function public.rate_request_get_v1(
  p_request_id uuid,
  p_actor_user_id uuid default null
)
returns table (
  id uuid,
  from_location text,
  to_location text,
  vehicle_type text,
  vehicle_type_id uuid,
  rate_category public.rate_category,
  notes text,
  status public.rate_request_status,
  requested_by_id uuid,
  requested_by_name text,
  requested_by_role public.role_type,
  published_rate_id uuid,
  fulfilled_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz,
  latest_quote_id uuid,
  latest_quote_status public.rate_request_quote_status,
  latest_freight_rate numeric,
  latest_quoted_by_id uuid,
  latest_quoted_by_name text,
  latest_quoted_at timestamptz
)
language plpgsql
security definer
set search_path = 'public', 'auth'
as $$
declare
  v_actor_id uuid;
  v_actor_role public.role_type;
  v_actor_active boolean;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  if p_request_id is null then
    raise exception 'request_id_required' using errcode = '22023';
  end if;

  v_actor_id := coalesce(p_actor_user_id, auth.uid());
  if v_actor_id is distinct from auth.uid() then
    raise exception 'Actor mismatch' using errcode = '42501';
  end if;

  select p.role, p.active
  into v_actor_role, v_actor_active
  from public.profiles p
  where p.id = v_actor_id;

  if v_actor_role is null or coalesce(v_actor_active, false) is false then
    raise exception 'actor_not_found' using errcode = '42501';
  end if;

  if v_actor_role not in ('sales_consigner', 'operations_consigner', 'sales_vehicles', 'operations_vehicles', 'admin', 'super_admin') then
    raise exception 'permission_denied' using errcode = '42501';
  end if;

  return query
  select
    rr.id,
    rr.from_location,
    rr.to_location,
    rr.vehicle_type,
    rr.vehicle_type_id,
    rr.rate_category,
    rr.notes,
    rr.status,
    rr.requested_by_id,
    requester.full_name as requested_by_name,
    rr.requested_by_role,
    rr.published_rate_id,
    rr.fulfilled_at,
    rr.created_at,
    rr.updated_at,
    latest.id as latest_quote_id,
    latest.status as latest_quote_status,
    latest.freight_rate as latest_freight_rate,
    latest.quoted_by_id as latest_quoted_by_id,
    latest_quoter.full_name as latest_quoted_by_name,
    latest.created_at as latest_quoted_at
  from public.rate_requests rr
  join public.profiles requester on requester.id = rr.requested_by_id
  left join lateral (
    select q.id, q.status, q.freight_rate, q.quoted_by_id, q.created_at
    from public.rate_request_quotes q
    where q.rate_request_id = rr.id
    order by q.created_at desc
    limit 1
  ) latest on true
  left join public.profiles latest_quoter on latest_quoter.id = latest.quoted_by_id
  where rr.id = p_request_id
    and (
      v_actor_role in ('admin', 'super_admin', 'sales_vehicles', 'operations_vehicles')
      or rr.requested_by_id = v_actor_id
    );

  if not found then
    raise exception 'request_not_found' using errcode = 'P0002';
  end if;
end;
$$;

create or replace function public.rate_request_quote_submit_v1(
  p_request_id uuid,
  p_freight_rate numeric,
  p_rate_per_ton numeric default null,
  p_rate_per_kg numeric default null,
  p_confidence_level text default null,
  p_source text default null,
  p_remarks text default null,
  p_actor_user_id uuid default null
)
returns table (
  id uuid,
  rate_request_id uuid,
  freight_rate numeric,
  rate_per_ton numeric,
  rate_per_kg numeric,
  confidence_level text,
  source text,
  remarks text,
  status public.rate_request_quote_status,
  quoted_by_id uuid,
  quoted_by_name text,
  reviewed_by_id uuid,
  reviewed_by_name text,
  review_remarks text,
  published_rate_id uuid,
  reviewed_at timestamptz,
  created_at timestamptz,
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
  v_request public.rate_requests%rowtype;
  v_quote_id uuid;
  v_quote_status public.rate_request_quote_status;
  v_published_rate_id uuid;
  v_reviewer_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  if p_request_id is null then
    raise exception 'request_id_required' using errcode = '22023';
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
    raise exception 'actor_not_found' using errcode = '42501';
  end if;

  if v_actor_role not in ('sales_vehicles', 'operations_vehicles', 'admin', 'super_admin') then
    raise exception 'permission_denied' using errcode = '42501';
  end if;

  if p_freight_rate is null or p_freight_rate <= 0 then
    raise exception 'freight_rate_invalid' using errcode = '22023';
  end if;

  if p_rate_per_ton is not null and p_rate_per_ton < 0 then
    raise exception 'rate_per_ton_invalid' using errcode = '22023';
  end if;

  if p_rate_per_kg is not null and p_rate_per_kg < 0 then
    raise exception 'rate_per_kg_invalid' using errcode = '22023';
  end if;

  select *
  into v_request
  from public.rate_requests rr
  where rr.id = p_request_id
  for update;

  if v_request.id is null then
    raise exception 'request_not_found' using errcode = 'P0002';
  end if;

  if v_request.status = 'cancelled'::public.rate_request_status then
    raise exception 'request_cancelled' using errcode = '22023';
  end if;

  if v_request.status = 'fulfilled'::public.rate_request_status then
    raise exception 'request_already_fulfilled' using errcode = '22023';
  end if;

  if exists (
    select 1
    from public.rate_request_quotes q
    where q.rate_request_id = p_request_id
      and q.status = 'pending_review'::public.rate_request_quote_status
  ) then
    raise exception 'pending_quote_exists' using errcode = '23505';
  end if;

  if v_actor_role in ('operations_vehicles', 'admin', 'super_admin') then
    v_quote_status := 'approved'::public.rate_request_quote_status;
    v_reviewer_id := v_actor_id;
  else
    v_quote_status := 'pending_review'::public.rate_request_quote_status;
    v_reviewer_id := null;
  end if;

  insert into public.rate_request_quotes (
    rate_request_id,
    freight_rate,
    rate_per_ton,
    rate_per_kg,
    confidence_level,
    source,
    remarks,
    status,
    quoted_by_id,
    reviewed_by_id,
    review_remarks,
    reviewed_at,
    created_at,
    updated_at
  )
  values (
    p_request_id,
    p_freight_rate,
    p_rate_per_ton,
    p_rate_per_kg,
    nullif(trim(coalesce(p_confidence_level, '')), ''),
    nullif(trim(coalesce(p_source, '')), ''),
    nullif(trim(coalesce(p_remarks, '')), ''),
    v_quote_status,
    v_actor_id,
    v_reviewer_id,
    null,
    case when v_quote_status = 'approved'::public.rate_request_quote_status then now() else null end,
    now(),
    now()
  )
  returning rate_request_quotes.id into v_quote_id;

  if v_quote_status = 'approved'::public.rate_request_quote_status then
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
      v_request.from_location,
      v_request.to_location,
      v_request.vehicle_type,
      v_request.vehicle_type_id,
      v_request.rate_category,
      p_freight_rate,
      p_rate_per_ton,
      p_rate_per_kg,
      nullif(trim(coalesce(p_confidence_level, '')), ''),
      nullif(trim(coalesce(p_source, '')), ''),
      nullif(trim(coalesce(p_remarks, '')), ''),
      v_actor_id,
      'approved'::public.rate_status,
      v_actor_id,
      now(),
      now(),
      now()
    )
    returning market_rates.id into v_published_rate_id;

    update public.rate_request_quotes
    set
      published_rate_id = v_published_rate_id,
      updated_at = now()
    where rate_request_quotes.id = v_quote_id;

    update public.rate_requests
    set
      status = 'fulfilled'::public.rate_request_status,
      published_rate_id = v_published_rate_id,
      fulfilled_at = now(),
      updated_at = now()
    where rate_requests.id = p_request_id;
  end if;

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
    'rate_request_quote',
    v_quote_id,
    case when v_quote_status = 'approved'::public.rate_request_quote_status then 'quote_submit_auto_approved' else 'quote_submit_pending_review' end,
    v_actor_id,
    v_actor_name,
    v_actor_role,
    format('Quote submitted for request %s', p_request_id::text),
    null,
    jsonb_build_object(
      'rate_request_id', p_request_id,
      'freight_rate', p_freight_rate,
      'status', v_quote_status::text,
      'published_rate_id', v_published_rate_id
    ),
    now()
  );

  return query
  select
    q.id,
    q.rate_request_id,
    q.freight_rate,
    q.rate_per_ton,
    q.rate_per_kg,
    q.confidence_level,
    q.source,
    q.remarks,
    q.status,
    q.quoted_by_id,
    quoted_by.full_name as quoted_by_name,
    q.reviewed_by_id,
    reviewed_by.full_name as reviewed_by_name,
    q.review_remarks,
    q.published_rate_id,
    q.reviewed_at,
    q.created_at,
    q.updated_at
  from public.rate_request_quotes q
  left join public.profiles quoted_by on quoted_by.id = q.quoted_by_id
  left join public.profiles reviewed_by on reviewed_by.id = q.reviewed_by_id
  where q.id = v_quote_id;
end;
$$;

create or replace function public.rate_request_quote_list_v1(
  p_request_id uuid,
  p_limit integer default 50,
  p_offset integer default 0,
  p_actor_user_id uuid default null
)
returns table (
  id uuid,
  rate_request_id uuid,
  freight_rate numeric,
  rate_per_ton numeric,
  rate_per_kg numeric,
  confidence_level text,
  source text,
  remarks text,
  status public.rate_request_quote_status,
  quoted_by_id uuid,
  quoted_by_name text,
  reviewed_by_id uuid,
  reviewed_by_name text,
  review_remarks text,
  published_rate_id uuid,
  reviewed_at timestamptz,
  created_at timestamptz,
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
  v_limit integer;
  v_offset integer;
  v_owner_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  if p_request_id is null then
    raise exception 'request_id_required' using errcode = '22023';
  end if;

  v_actor_id := coalesce(p_actor_user_id, auth.uid());
  if v_actor_id is distinct from auth.uid() then
    raise exception 'Actor mismatch' using errcode = '42501';
  end if;

  select p.role, p.active
  into v_actor_role, v_actor_active
  from public.profiles p
  where p.id = v_actor_id;

  if v_actor_role is null or coalesce(v_actor_active, false) is false then
    raise exception 'actor_not_found' using errcode = '42501';
  end if;

  if v_actor_role not in ('sales_consigner', 'operations_consigner', 'sales_vehicles', 'operations_vehicles', 'admin', 'super_admin') then
    raise exception 'permission_denied' using errcode = '42501';
  end if;

  select rr.requested_by_id
  into v_owner_id
  from public.rate_requests rr
  where rr.id = p_request_id;

  if v_owner_id is null then
    raise exception 'request_not_found' using errcode = 'P0002';
  end if;

  if v_actor_role in ('sales_consigner', 'operations_consigner') and v_owner_id <> v_actor_id then
    raise exception 'permission_denied' using errcode = '42501';
  end if;

  v_limit := greatest(1, least(coalesce(p_limit, 50), 200));
  v_offset := greatest(0, coalesce(p_offset, 0));

  return query
  select
    q.id,
    q.rate_request_id,
    q.freight_rate,
    q.rate_per_ton,
    q.rate_per_kg,
    q.confidence_level,
    q.source,
    q.remarks,
    q.status,
    q.quoted_by_id,
    quoted_by.full_name as quoted_by_name,
    q.reviewed_by_id,
    reviewed_by.full_name as reviewed_by_name,
    q.review_remarks,
    q.published_rate_id,
    q.reviewed_at,
    q.created_at,
    q.updated_at
  from public.rate_request_quotes q
  left join public.profiles quoted_by on quoted_by.id = q.quoted_by_id
  left join public.profiles reviewed_by on reviewed_by.id = q.reviewed_by_id
  where q.rate_request_id = p_request_id
  order by q.created_at desc
  limit v_limit
  offset v_offset;
end;
$$;

create or replace function public.rate_request_quote_decide_v1(
  p_quote_id uuid,
  p_action text,
  p_review_remarks text default null,
  p_actor_user_id uuid default null
)
returns table (
  id uuid,
  rate_request_id uuid,
  freight_rate numeric,
  rate_per_ton numeric,
  rate_per_kg numeric,
  confidence_level text,
  source text,
  remarks text,
  status public.rate_request_quote_status,
  quoted_by_id uuid,
  quoted_by_name text,
  reviewed_by_id uuid,
  reviewed_by_name text,
  review_remarks text,
  published_rate_id uuid,
  reviewed_at timestamptz,
  created_at timestamptz,
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
  v_action text;
  v_quote public.rate_request_quotes%rowtype;
  v_request public.rate_requests%rowtype;
  v_published_rate_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  if p_quote_id is null then
    raise exception 'quote_id_required' using errcode = '22023';
  end if;

  v_action := lower(trim(coalesce(p_action, '')));
  if v_action not in ('approve', 'reject') then
    raise exception 'invalid_action' using errcode = '22023';
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
    raise exception 'actor_not_found' using errcode = '42501';
  end if;

  if v_actor_role not in ('operations_vehicles', 'admin', 'super_admin') then
    raise exception 'permission_denied' using errcode = '42501';
  end if;

  select *
  into v_quote
  from public.rate_request_quotes q
  where q.id = p_quote_id
  for update;

  if v_quote.id is null then
    raise exception 'quote_not_found' using errcode = 'P0002';
  end if;

  if v_quote.status <> 'pending_review'::public.rate_request_quote_status then
    raise exception 'quote_not_pending_review' using errcode = '22023';
  end if;

  select *
  into v_request
  from public.rate_requests rr
  where rr.id = v_quote.rate_request_id
  for update;

  if v_request.id is null then
    raise exception 'request_not_found' using errcode = 'P0002';
  end if;

  if v_request.status = 'fulfilled'::public.rate_request_status and v_action = 'approve' then
    raise exception 'request_already_fulfilled' using errcode = '22023';
  end if;

  if v_action = 'reject' and nullif(trim(coalesce(p_review_remarks, '')), '') is null then
    raise exception 'review_remarks_required' using errcode = '22023';
  end if;

  if v_action = 'reject' then
    update public.rate_request_quotes q
    set
      status = 'rejected'::public.rate_request_quote_status,
      reviewed_by_id = v_actor_id,
      review_remarks = nullif(trim(coalesce(p_review_remarks, '')), ''),
      reviewed_at = now(),
      updated_at = now()
    where q.id = p_quote_id;
  else
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
      v_request.from_location,
      v_request.to_location,
      v_request.vehicle_type,
      v_request.vehicle_type_id,
      v_request.rate_category,
      v_quote.freight_rate,
      v_quote.rate_per_ton,
      v_quote.rate_per_kg,
      v_quote.confidence_level,
      v_quote.source,
      v_quote.remarks,
      v_quote.quoted_by_id,
      'approved'::public.rate_status,
      v_actor_id,
      now(),
      now(),
      now()
    )
    returning market_rates.id into v_published_rate_id;

    update public.rate_request_quotes q
    set
      status = 'approved'::public.rate_request_quote_status,
      reviewed_by_id = v_actor_id,
      review_remarks = nullif(trim(coalesce(p_review_remarks, '')), ''),
      reviewed_at = now(),
      published_rate_id = v_published_rate_id,
      updated_at = now()
    where q.id = p_quote_id;

    update public.rate_requests rr
    set
      status = 'fulfilled'::public.rate_request_status,
      published_rate_id = v_published_rate_id,
      fulfilled_at = now(),
      updated_at = now()
    where rr.id = v_request.id;
  end if;

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
    'rate_request_quote',
    p_quote_id,
    case when v_action = 'approve' then 'quote_approved' else 'quote_rejected' end,
    v_actor_id,
    v_actor_name,
    v_actor_role,
    case when v_action = 'approve' then 'Quote approved and published to market rates' else 'Quote rejected' end,
    null,
    jsonb_build_object(
      'quote_id', p_quote_id,
      'action', v_action,
      'review_remarks', nullif(trim(coalesce(p_review_remarks, '')), ''),
      'published_rate_id', v_published_rate_id
    ),
    now()
  );

  return query
  select
    q.id,
    q.rate_request_id,
    q.freight_rate,
    q.rate_per_ton,
    q.rate_per_kg,
    q.confidence_level,
    q.source,
    q.remarks,
    q.status,
    q.quoted_by_id,
    quoted_by.full_name as quoted_by_name,
    q.reviewed_by_id,
    reviewed_by.full_name as reviewed_by_name,
    q.review_remarks,
    q.published_rate_id,
    q.reviewed_at,
    q.created_at,
    q.updated_at
  from public.rate_request_quotes q
  left join public.profiles quoted_by on quoted_by.id = q.quoted_by_id
  left join public.profiles reviewed_by on reviewed_by.id = q.reviewed_by_id
  where q.id = p_quote_id;
end;
$$;

grant execute on function public.rate_request_create_v1(text, text, text, public.rate_category, text, uuid) to authenticated;
grant execute on function public.rate_request_list_v1(public.rate_request_status, text, integer, integer, uuid) to authenticated;
grant execute on function public.rate_request_get_v1(uuid, uuid) to authenticated;
grant execute on function public.rate_request_quote_submit_v1(uuid, numeric, numeric, numeric, text, text, text, uuid) to authenticated;
grant execute on function public.rate_request_quote_list_v1(uuid, integer, integer, uuid) to authenticated;
grant execute on function public.rate_request_quote_decide_v1(uuid, text, text, uuid) to authenticated;

commit;
