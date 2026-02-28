begin;

-- Ticket source mapping for automated workflows.
do $$
begin
  if not exists (
    select 1
    from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'public'
      and t.typname = 'ticket_source_type'
  ) then
    create type public.ticket_source_type as enum ('manual', 'trip_vehicle_assignment', 'payment_request');
  end if;
end;
$$;

alter table public.tickets
  add column if not exists assigned_role public.role_type,
  add column if not exists source_type public.ticket_source_type,
  add column if not exists source_id uuid,
  add column if not exists resolved_by_id uuid,
  add column if not exists resolution_note text,
  add column if not exists metadata jsonb not null default '{}'::jsonb;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where connamespace = 'public'::regnamespace
      and conname = 'tickets_resolved_by_id_fkey'
  ) then
    alter table public.tickets
      add constraint tickets_resolved_by_id_fkey
      foreign key (resolved_by_id)
      references public.profiles(id);
  end if;
end;
$$;

create index if not exists idx_tickets_status_created_at
  on public.tickets (status, created_at desc);

create index if not exists idx_tickets_assigned_to_status_created_at
  on public.tickets (assigned_to_id, status, created_at desc)
  where assigned_to_id is not null;

create index if not exists idx_tickets_assigned_role_status_created_at
  on public.tickets (assigned_role, status, created_at desc)
  where assigned_role is not null;

create index if not exists idx_tickets_created_by_created_at
  on public.tickets (created_by_id, created_at desc);

create index if not exists idx_tickets_source
  on public.tickets (source_type, source_id);

create unique index if not exists ux_tickets_open_by_source
  on public.tickets (source_type, source_id)
  where source_type is not null
    and source_id is not null
    and status <> 'resolved'::public.ticket_status;

create index if not exists idx_ticket_comments_ticket_created_at
  on public.ticket_comments (ticket_id, created_at);

create or replace function public.trip_ticket_upsert_vehicle_assignment_v1(
  p_trip_id uuid,
  p_actor_user_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  v_trip record;
  v_ticket_id uuid;
  v_creator_id uuid;
begin
  select
    t.id,
    t.trip_code,
    t.current_stage,
    to1.operations_vehicles_owner_id
  into v_trip
  from public.trips t
  left join public.trip_owners to1 on to1.trip_id = t.id
  where t.id = p_trip_id;

  if v_trip.id is null then
    return null;
  end if;

  v_creator_id := coalesce(p_actor_user_id, v_trip.operations_vehicles_owner_id);

  -- Resolve assignment task once vehicle is assigned or beyond.
  if v_trip.current_stage in (
    'vehicle_assigned'::public.trip_stage,
    'at_loading'::public.trip_stage,
    'loaded_docs_ok'::public.trip_stage,
    'advance_paid'::public.trip_stage,
    'in_transit'::public.trip_stage,
    'delivered'::public.trip_stage,
    'pod_soft_received'::public.trip_stage,
    'vendor_settled'::public.trip_stage,
    'customer_collected'::public.trip_stage,
    'closed'::public.trip_stage
  ) then
    update public.tickets
    set
      status = 'resolved'::public.ticket_status,
      resolved_at = coalesce(resolved_at, now()),
      resolved_by_id = coalesce(v_creator_id, resolved_by_id),
      resolution_note = coalesce(resolution_note, 'Vehicle assigned'),
      updated_at = now()
    where source_type = 'trip_vehicle_assignment'::public.ticket_source_type
      and source_id = p_trip_id
      and status <> 'resolved'::public.ticket_status;

    return null;
  end if;

  -- Assignment ticket is only actionable while trip is confirmed.
  if v_trip.current_stage <> 'confirmed'::public.trip_stage then
    return null;
  end if;

  if v_trip.operations_vehicles_owner_id is null then
    return null;
  end if;

  select t.id
  into v_ticket_id
  from public.tickets t
  where t.source_type = 'trip_vehicle_assignment'::public.ticket_source_type
    and t.source_id = p_trip_id
    and t.status <> 'resolved'::public.ticket_status
  for update;

  if v_ticket_id is not null then
    update public.tickets
    set
      assigned_to_id = v_trip.operations_vehicles_owner_id,
      assigned_role = null,
      issue_type = 'operational'::public.ticket_issue_type,
      trip_id = v_trip.id,
      trip_code = v_trip.trip_code,
      title = format('Assign vehicle for %s', v_trip.trip_code),
      description = 'Assign vehicle and driver to start the trip.',
      metadata = jsonb_build_object(
        'kind', 'trip_vehicle_assignment',
        'trip_id', v_trip.id,
        'trip_code', v_trip.trip_code
      ),
      updated_at = now()
    where id = v_ticket_id;

    return v_ticket_id;
  end if;

  if v_creator_id is null then
    return null;
  end if;

  insert into public.tickets (
    trip_id,
    trip_code,
    issue_type,
    title,
    description,
    status,
    assigned_to_id,
    assigned_role,
    created_by_id,
    source_type,
    source_id,
    metadata
  ) values (
    v_trip.id,
    v_trip.trip_code,
    'operational'::public.ticket_issue_type,
    format('Assign vehicle for %s', v_trip.trip_code),
    'Assign vehicle and driver to start the trip.',
    'open'::public.ticket_status,
    v_trip.operations_vehicles_owner_id,
    null,
    v_creator_id,
    'trip_vehicle_assignment'::public.ticket_source_type,
    v_trip.id,
    jsonb_build_object(
      'kind', 'trip_vehicle_assignment',
      'trip_id', v_trip.id,
      'trip_code', v_trip.trip_code
    )
  )
  returning id into v_ticket_id;

  return v_ticket_id;
end;
$$;

create or replace function public.trip_ticket_sync_payment_request_v1(
  p_payment_request_id uuid,
  p_actor_user_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  v_req record;
  v_ticket_id uuid;
  v_creator_id uuid;
  v_title text;
begin
  select
    pr.id,
    pr.trip_id,
    pr.type,
    pr.status,
    pr.amount,
    pr.requested_by_id,
    t.trip_code
  into v_req
  from public.payment_requests pr
  join public.trips t on t.id = pr.trip_id
  where pr.id = p_payment_request_id;

  if v_req.id is null then
    return null;
  end if;

  if v_req.type not in ('advance'::public.payment_type, 'balance'::public.payment_type) then
    return null;
  end if;

  v_creator_id := coalesce(v_req.requested_by_id, p_actor_user_id);

  if v_req.status = 'paid'::public.payment_status then
    update public.tickets
    set
      status = 'resolved'::public.ticket_status,
      resolved_at = coalesce(resolved_at, now()),
      resolved_by_id = coalesce(p_actor_user_id, resolved_by_id),
      resolution_note = coalesce(resolution_note, 'Payment proof uploaded and marked paid'),
      updated_at = now()
    where source_type = 'payment_request'::public.ticket_source_type
      and source_id = v_req.id
      and status <> 'resolved'::public.ticket_status;

    return null;
  end if;

  if v_req.status not in ('pending'::public.payment_status, 'approved'::public.payment_status) then
    return null;
  end if;

  v_title := case
    when v_req.type = 'advance'::public.payment_type then format('Advance payment for %s', v_req.trip_code)
    else format('Final payment for %s', v_req.trip_code)
  end;

  select t.id
  into v_ticket_id
  from public.tickets t
  where t.source_type = 'payment_request'::public.ticket_source_type
    and t.source_id = v_req.id
    and t.status <> 'resolved'::public.ticket_status
  for update;

  if v_ticket_id is not null then
    update public.tickets
    set
      issue_type = 'payment'::public.ticket_issue_type,
      trip_id = v_req.trip_id,
      trip_code = v_req.trip_code,
      title = v_title,
      description = format('Payment request amount: %s', v_req.amount::text),
      assigned_to_id = null,
      assigned_role = 'accounts'::public.role_type,
      metadata = jsonb_build_object(
        'kind', 'payment_request',
        'payment_request_id', v_req.id,
        'payment_type', v_req.type::text,
        'amount', v_req.amount,
        'trip_id', v_req.trip_id,
        'trip_code', v_req.trip_code
      ),
      updated_at = now()
    where id = v_ticket_id;

    return v_ticket_id;
  end if;

  if v_creator_id is null then
    return null;
  end if;

  insert into public.tickets (
    trip_id,
    trip_code,
    issue_type,
    title,
    description,
    status,
    assigned_to_id,
    assigned_role,
    created_by_id,
    source_type,
    source_id,
    metadata
  ) values (
    v_req.trip_id,
    v_req.trip_code,
    'payment'::public.ticket_issue_type,
    v_title,
    format('Payment request amount: %s', v_req.amount::text),
    'open'::public.ticket_status,
    null,
    'accounts'::public.role_type,
    v_creator_id,
    'payment_request'::public.ticket_source_type,
    v_req.id,
    jsonb_build_object(
      'kind', 'payment_request',
      'payment_request_id', v_req.id,
      'payment_type', v_req.type::text,
      'amount', v_req.amount,
      'trip_id', v_req.trip_id,
      'trip_code', v_req.trip_code
    )
  )
  returning id into v_ticket_id;

  return v_ticket_id;
end;
$$;

create or replace function public.ticket_list_v1(
  p_actor_user_id uuid,
  p_status text default null,
  p_search text default null,
  p_limit integer default 100,
  p_offset integer default 0
)
returns table (
  id uuid,
  trip_id uuid,
  trip_code text,
  issue_type text,
  title text,
  description text,
  status text,
  assigned_to_id uuid,
  assigned_to_name text,
  assigned_role text,
  created_by_id uuid,
  created_by_name text,
  resolved_by_id uuid,
  resolved_by_name text,
  resolved_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz,
  source_type text,
  source_id uuid,
  metadata jsonb
)
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  v_role text;
  v_status public.ticket_status;
  v_search text;
  v_limit integer;
  v_offset integer;
begin
  v_role := trip_assert_actor_v1(p_actor_user_id);

  if nullif(btrim(coalesce(p_status, '')), '') is not null then
    begin
      v_status := lower(btrim(p_status))::public.ticket_status;
    exception
      when others then
        raise exception 'invalid_ticket_status';
    end;
  else
    v_status := null;
  end if;

  v_search := nullif(btrim(coalesce(p_search, '')), '');
  v_limit := greatest(1, least(coalesce(p_limit, 100), 200));
  v_offset := greatest(0, coalesce(p_offset, 0));

  return query
  select
    t.id,
    t.trip_id,
    t.trip_code,
    t.issue_type::text,
    t.title,
    t.description,
    t.status::text,
    t.assigned_to_id,
    ap.full_name as assigned_to_name,
    t.assigned_role::text,
    t.created_by_id,
    cp.full_name as created_by_name,
    t.resolved_by_id,
    rp.full_name as resolved_by_name,
    t.resolved_at,
    t.created_at,
    t.updated_at,
    t.source_type::text,
    t.source_id,
    t.metadata
  from public.tickets t
  left join public.profiles ap on ap.id = t.assigned_to_id
  left join public.profiles cp on cp.id = t.created_by_id
  left join public.profiles rp on rp.id = t.resolved_by_id
  where
    (v_status is null or t.status = v_status)
    and (
      v_search is null
      or t.title ilike ('%' || v_search || '%')
      or coalesce(t.description, '') ilike ('%' || v_search || '%')
      or coalesce(t.trip_code, '') ilike ('%' || v_search || '%')
    )
    and (
      v_role in ('super_admin', 'admin', 'support')
      or t.assigned_to_id = p_actor_user_id
      or t.created_by_id = p_actor_user_id
      or t.assigned_role = v_role::public.role_type
    )
  order by
    case t.status
      when 'open'::public.ticket_status then 1
      when 'in_progress'::public.ticket_status then 2
      when 'waiting'::public.ticket_status then 3
      else 4
    end,
    t.created_at desc
  limit v_limit
  offset v_offset;
end;
$$;

create or replace function public.ticket_counts_v1(
  p_actor_user_id uuid,
  p_search text default null
)
returns table (
  open_count bigint,
  in_progress_count bigint,
  waiting_count bigint,
  resolved_count bigint,
  total_count bigint
)
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  v_role text;
  v_search text;
begin
  v_role := trip_assert_actor_v1(p_actor_user_id);
  v_search := nullif(btrim(coalesce(p_search, '')), '');

  return query
  with filtered as (
    select t.status
    from public.tickets t
    where
      (
        v_search is null
        or t.title ilike ('%' || v_search || '%')
        or coalesce(t.description, '') ilike ('%' || v_search || '%')
        or coalesce(t.trip_code, '') ilike ('%' || v_search || '%')
      )
      and (
        v_role in ('super_admin', 'admin', 'support')
        or t.assigned_to_id = p_actor_user_id
        or t.created_by_id = p_actor_user_id
        or t.assigned_role = v_role::public.role_type
      )
  )
  select
    count(*) filter (where status = 'open'::public.ticket_status) as open_count,
    count(*) filter (where status = 'in_progress'::public.ticket_status) as in_progress_count,
    count(*) filter (where status = 'waiting'::public.ticket_status) as waiting_count,
    count(*) filter (where status = 'resolved'::public.ticket_status) as resolved_count,
    count(*) as total_count
  from filtered;
end;
$$;

create or replace function public.ticket_update_status_v1(
  p_actor_user_id uuid,
  p_ticket_id uuid,
  p_to_status public.ticket_status,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  v_role text;
  v_ticket record;
  v_can_manage boolean;
  v_note text;
begin
  v_role := trip_assert_actor_v1(p_actor_user_id);

  select
    t.id,
    t.status,
    t.assigned_to_id,
    t.assigned_role,
    t.created_by_id
  into v_ticket
  from public.tickets t
  where t.id = p_ticket_id
  for update;

  if v_ticket.id is null then
    raise exception 'ticket_not_found';
  end if;

  v_can_manage := (
    v_role in ('super_admin', 'admin', 'support')
    or v_ticket.assigned_to_id = p_actor_user_id
    or v_ticket.created_by_id = p_actor_user_id
    or v_ticket.assigned_role = v_role::public.role_type
  );

  if not v_can_manage then
    raise exception 'permission_denied';
  end if;

  v_note := nullif(btrim(coalesce(p_note, '')), '');

  update public.tickets
  set
    status = p_to_status,
    resolved_at = case
      when p_to_status = 'resolved'::public.ticket_status then coalesce(resolved_at, now())
      else null
    end,
    resolved_by_id = case
      when p_to_status = 'resolved'::public.ticket_status then p_actor_user_id
      else null
    end,
    resolution_note = case
      when p_to_status = 'resolved'::public.ticket_status then v_note
      else null
    end,
    updated_at = now()
  where id = p_ticket_id;

  if v_note is not null then
    insert into public.ticket_comments (ticket_id, comment_text, author_id)
    values (p_ticket_id, v_note, p_actor_user_id);
  end if;

  return jsonb_build_object(
    'id', p_ticket_id,
    'status', p_to_status::text
  );
end;
$$;

create or replace function public.trg_trip_owners_ticket_sync_v1()
returns trigger
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  v_actor uuid;
begin
  begin
    v_actor := auth.uid();
  exception
    when others then
      v_actor := null;
  end;

  if tg_op = 'INSERT'
     or new.operations_vehicles_owner_id is distinct from old.operations_vehicles_owner_id then
    perform public.trip_ticket_upsert_vehicle_assignment_v1(new.trip_id, v_actor);
  end if;

  return new;
end;
$$;

drop trigger if exists trg_trip_owners_ticket_sync_v1 on public.trip_owners;
create trigger trg_trip_owners_ticket_sync_v1
after insert or update of operations_vehicles_owner_id
on public.trip_owners
for each row
execute function public.trg_trip_owners_ticket_sync_v1();

create or replace function public.trg_trips_ticket_stage_sync_v1()
returns trigger
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  v_actor uuid;
begin
  if new.current_stage is not distinct from old.current_stage then
    return new;
  end if;

  begin
    v_actor := auth.uid();
  exception
    when others then
      v_actor := null;
  end;

  perform public.trip_ticket_upsert_vehicle_assignment_v1(new.id, v_actor);

  return new;
end;
$$;

drop trigger if exists trg_trips_ticket_stage_sync_v1 on public.trips;
create trigger trg_trips_ticket_stage_sync_v1
after update of current_stage
on public.trips
for each row
execute function public.trg_trips_ticket_stage_sync_v1();

create or replace function public.trg_payment_requests_ticket_sync_v1()
returns trigger
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  v_actor uuid;
begin
  begin
    v_actor := auth.uid();
  exception
    when others then
      v_actor := null;
  end;

  if tg_op = 'INSERT' then
    perform public.trip_ticket_sync_payment_request_v1(new.id, v_actor);
    return new;
  end if;

  if new.status is distinct from old.status then
    perform public.trip_ticket_sync_payment_request_v1(new.id, v_actor);
  end if;

  return new;
end;
$$;

drop trigger if exists trg_payment_requests_ticket_sync_v1 on public.payment_requests;
create trigger trg_payment_requests_ticket_sync_v1
after insert or update of status
on public.payment_requests
for each row
execute function public.trg_payment_requests_ticket_sync_v1();

grant execute on function public.ticket_list_v1(uuid, text, text, integer, integer) to authenticated;
grant execute on function public.ticket_counts_v1(uuid, text) to authenticated;
grant execute on function public.ticket_update_status_v1(uuid, uuid, public.ticket_status, text) to authenticated;

commit;
