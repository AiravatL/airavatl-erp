begin;

alter table public.payment_requests
  add column if not exists paid_proof_object_key text,
  add column if not exists paid_proof_file_name text,
  add column if not exists paid_proof_mime_type text,
  add column if not exists paid_proof_size_bytes bigint,
  add column if not exists paid_proof_uploaded_at timestamptz,
  add column if not exists payment_reference text,
  add column if not exists paid_amount numeric;

alter table public.trips
  add column if not exists completed_at timestamptz,
  add column if not exists completed_by_id uuid;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where connamespace = 'public'::regnamespace
      and conname = 'trips_completed_by_id_fkey'
  ) then
    alter table public.trips
      add constraint trips_completed_by_id_fkey
      foreign key (completed_by_id)
      references public.profiles(id);
  end if;
end;
$$;

create index if not exists idx_trips_completed_by
  on public.trips (completed_by_id);

create index if not exists idx_payment_requests_status_type_created
  on public.payment_requests (status, type, created_at desc);

create index if not exists idx_payment_requests_trip_type_paid
  on public.payment_requests (trip_id, type, status);

create or replace function public.trip_payment_queue_list_v1(
  p_actor_user_id uuid,
  p_status text default null,
  p_type text default null,
  p_search text default null,
  p_limit integer default 50,
  p_offset integer default 0
)
returns table (
  id uuid,
  trip_id uuid,
  trip_code text,
  trip_current_stage text,
  type text,
  status text,
  amount numeric,
  paid_amount numeric,
  trip_amount numeric,
  beneficiary text,
  payment_method text,
  bank_account_holder text,
  bank_account_number text,
  bank_ifsc text,
  bank_name text,
  upi_id text,
  upi_qr_object_key text,
  paid_proof_object_key text,
  payment_reference text,
  notes text,
  requested_by_id uuid,
  requested_by_name text,
  reviewed_by_id uuid,
  reviewed_by_name text,
  reviewed_at timestamptz,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  v_role text;
  v_limit integer;
  v_offset integer;
  v_status public.payment_status;
  v_type public.payment_type;
  v_search text;
begin
  v_role := trip_assert_actor_v1(p_actor_user_id);

  if v_role not in ('accounts', 'admin', 'super_admin') then
    raise exception 'permission_denied';
  end if;

  v_limit := greatest(1, least(coalesce(p_limit, 50), 200));
  v_offset := greatest(0, coalesce(p_offset, 0));
  v_search := nullif(btrim(coalesce(p_search, '')), '');

  if nullif(btrim(coalesce(p_status, '')), '') is not null then
    begin
      v_status := lower(btrim(p_status))::public.payment_status;
    exception
      when others then
        raise exception 'invalid_payment_status';
    end;
  else
    v_status := null;
  end if;

  if nullif(btrim(coalesce(p_type, '')), '') is not null then
    begin
      v_type := lower(btrim(p_type))::public.payment_type;
    exception
      when others then
        raise exception 'invalid_payment_type';
    end;
  else
    v_type := null;
  end if;

  return query
  select
    pr.id,
    pr.trip_id,
    t.trip_code,
    t.current_stage::text,
    pr.type::text,
    pr.status::text,
    pr.amount,
    pr.paid_amount,
    t.trip_amount,
    pr.beneficiary,
    pr.payment_method::text,
    pr.bank_account_holder,
    pr.bank_account_number,
    pr.bank_ifsc,
    pr.bank_name,
    pr.upi_id,
    pr.upi_qr_object_key,
    pr.paid_proof_object_key,
    pr.payment_reference,
    pr.notes,
    pr.requested_by_id,
    coalesce(req.full_name, ''),
    pr.reviewed_by_id,
    coalesce(rev.full_name, ''),
    pr.reviewed_at,
    pr.created_at
  from public.payment_requests pr
  join public.trips t on t.id = pr.trip_id
  left join public.profiles req on req.id = pr.requested_by_id
  left join public.profiles rev on rev.id = pr.reviewed_by_id
  where
    (v_status is null or pr.status = v_status)
    and (v_type is null or pr.type = v_type)
    and (
      v_search is null
      or t.trip_code ilike '%' || v_search || '%'
      or coalesce(pr.beneficiary, '') ilike '%' || v_search || '%'
      or coalesce(req.full_name, '') ilike '%' || v_search || '%'
    )
  order by
    case when pr.status in ('pending'::public.payment_status, 'approved'::public.payment_status) then 0 else 1 end,
    pr.created_at asc
  limit v_limit
  offset v_offset;
end;
$$;

create or replace function public.trip_payment_proof_prepare_v1(
  p_actor_user_id uuid,
  p_payment_request_id uuid,
  p_file_name text,
  p_mime_type text,
  p_file_size_bytes bigint
)
returns jsonb
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  v_role text;
  v_req record;
  v_ext text;
  v_object_key text;
begin
  v_role := trip_assert_actor_v1(p_actor_user_id);

  if v_role not in ('accounts', 'admin', 'super_admin') then
    raise exception 'permission_denied';
  end if;

  select pr.id, pr.trip_id, pr.type, pr.status
  into v_req
  from public.payment_requests pr
  where pr.id = p_payment_request_id;

  if v_req.id is null then
    raise exception 'payment_request_not_found';
  end if;

  if v_req.status not in ('pending'::public.payment_status, 'approved'::public.payment_status) then
    raise exception 'payment_request_not_payable';
  end if;

  if nullif(btrim(coalesce(p_file_name, '')), '') is null then
    raise exception 'file_name_required';
  end if;

  if p_file_size_bytes is null or p_file_size_bytes <= 0 or p_file_size_bytes > 15728640 then
    raise exception 'file_too_large';
  end if;

  v_ext := lower(nullif(regexp_replace(p_file_name, '^.*\.([^.]+)$', '\1'), p_file_name));
  if v_ext is null then
    raise exception 'invalid_file_type';
  end if;
  if v_ext not in ('jpg', 'jpeg', 'png', 'webp', 'pdf') then
    raise exception 'invalid_file_type';
  end if;

  v_object_key := format(
    'erp/payment-proofs/%s/%s/%s_%s.%s',
    v_req.trip_id::text,
    v_req.type::text,
    extract(epoch from clock_timestamp())::bigint::text,
    substr(md5(random()::text || clock_timestamp()::text), 1, 8),
    v_ext
  );

  return jsonb_build_object(
    'payment_request_id', v_req.id,
    'trip_id', v_req.trip_id,
    'type', v_req.type::text,
    'object_key', v_object_key
  );
end;
$$;

create or replace function public.trip_payment_mark_paid_v1(
  p_actor_user_id uuid,
  p_payment_request_id uuid,
  p_object_key text,
  p_file_name text,
  p_mime_type text,
  p_file_size_bytes bigint,
  p_payment_reference text default null,
  p_paid_amount numeric default null,
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  v_role text;
  v_req record;
  v_trip_stage public.trip_stage;
  v_paid_amount numeric;
begin
  v_role := trip_assert_actor_v1(p_actor_user_id);

  if v_role not in ('accounts', 'admin', 'super_admin') then
    raise exception 'permission_denied';
  end if;

  select
    pr.id,
    pr.trip_id,
    pr.type,
    pr.amount,
    pr.status,
    t.current_stage as trip_current_stage
  into v_req
  from public.payment_requests pr
  join public.trips t on t.id = pr.trip_id
  where pr.id = p_payment_request_id
  for update of pr;

  if v_req.id is null then
    raise exception 'payment_request_not_found';
  end if;

  if v_req.status = 'paid'::public.payment_status then
    raise exception 'payment_request_already_paid';
  end if;

  if v_req.status not in ('pending'::public.payment_status, 'approved'::public.payment_status) then
    raise exception 'payment_request_not_payable';
  end if;

  if nullif(btrim(coalesce(p_object_key, '')), '') is null then
    raise exception 'invalid_object_key';
  end if;

  if p_object_key not like format('erp/payment-proofs/%s/%%', v_req.trip_id::text)
     and p_object_key not like format('trips/%s/pod-%%', v_req.trip_id::text)
     and p_object_key not like format('trips/%s/eway-%%', v_req.trip_id::text) then
    raise exception 'invalid_object_key';
  end if;

  if nullif(btrim(coalesce(p_file_name, '')), '') is null then
    raise exception 'file_name_required';
  end if;

  if p_file_size_bytes is null or p_file_size_bytes <= 0 or p_file_size_bytes > 15728640 then
    raise exception 'file_too_large';
  end if;

  v_paid_amount := coalesce(p_paid_amount, v_req.amount);
  if v_paid_amount is null or v_paid_amount <= 0 then
    raise exception 'amount_invalid';
  end if;

  update public.payment_requests
  set
    status = 'paid'::public.payment_status,
    reviewed_by_id = p_actor_user_id,
    reviewed_at = now(),
    paid_proof_object_key = p_object_key,
    paid_proof_file_name = p_file_name,
    paid_proof_mime_type = coalesce(nullif(btrim(coalesce(p_mime_type, '')), ''), 'application/octet-stream'),
    paid_proof_size_bytes = p_file_size_bytes,
    paid_proof_uploaded_at = now(),
    payment_reference = nullif(btrim(coalesce(p_payment_reference, '')), ''),
    paid_amount = v_paid_amount,
    notes = coalesce(nullif(btrim(coalesce(p_notes, '')), ''), notes),
    updated_at = now()
  where id = p_payment_request_id;

  if v_req.type = 'advance'::public.payment_type then
    if v_req.trip_current_stage in ('vehicle_assigned'::public.trip_stage, 'at_loading'::public.trip_stage, 'loaded_docs_ok'::public.trip_stage) then
      update public.trips
      set
        current_stage = 'advance_paid'::public.trip_stage,
        updated_at = now()
      where id = v_req.trip_id;

      insert into public.trip_stage_history (trip_id, from_stage, to_stage, actor_id, notes)
      values (v_req.trip_id, v_req.trip_current_stage, 'advance_paid'::public.trip_stage, p_actor_user_id, 'Advance paid');
    end if;
  elsif v_req.type = 'balance'::public.payment_type then
    select current_stage into v_trip_stage
    from public.trips
    where id = v_req.trip_id
    for update;

    if v_trip_stage is distinct from 'closed'::public.trip_stage then
      update public.trips
      set
        current_stage = 'closed'::public.trip_stage,
        completed_at = coalesce(completed_at, now()),
        completed_by_id = p_actor_user_id,
        updated_at = now()
      where id = v_req.trip_id;

      insert into public.trip_stage_history (trip_id, from_stage, to_stage, actor_id, notes)
      values (v_req.trip_id, v_trip_stage, 'closed'::public.trip_stage, p_actor_user_id, 'Final payment paid');
    end if;
  end if;

  return jsonb_build_object(
    'payment_request_id', v_req.id,
    'trip_id', v_req.trip_id,
    'status', 'paid',
    'type', v_req.type::text
  );
end;
$$;

create or replace function public.trip_final_payment_request_create_v1(
  p_actor_user_id uuid,
  p_trip_id uuid,
  p_amount numeric default null,
  p_beneficiary text default null,
  p_notes text default null,
  p_payment_method public.payment_method default null,
  p_bank_account_holder text default null,
  p_bank_account_number text default null,
  p_bank_ifsc text default null,
  p_bank_name text default null,
  p_upi_id text default null,
  p_upi_qr_object_key text default null,
  p_upi_qr_file_name text default null,
  p_upi_qr_mime_type text default null,
  p_upi_qr_size_bytes bigint default null
)
returns jsonb
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  v_role text;
  v_trip record;
  v_paid_advance_total numeric;
  v_has_paid_advance boolean;
  v_suggested_amount numeric;
  v_amount numeric;
  v_request_id uuid;
  v_beneficiary text;
begin
  v_role := trip_assert_actor_v1(p_actor_user_id);

  if v_role not in ('operations_vehicles', 'admin', 'super_admin') then
    raise exception 'permission_denied';
  end if;

  select
    t.id,
    t.trip_code,
    t.current_stage,
    t.trip_amount,
    t.driver_name,
    to1.operations_vehicles_owner_id
  into v_trip
  from public.trips t
  left join public.trip_owners to1 on to1.trip_id = t.id
  where t.id = p_trip_id;

  if v_trip.id is null then
    raise exception 'trip_not_found';
  end if;

  if v_role = 'operations_vehicles'
     and (v_trip.operations_vehicles_owner_id is null or v_trip.operations_vehicles_owner_id <> p_actor_user_id) then
    raise exception 'not_trip_ops_vehicle_owner';
  end if;

  if v_trip.current_stage in ('closed'::public.trip_stage, 'customer_collected'::public.trip_stage) then
    raise exception 'trip_already_completed';
  end if;

  if v_trip.trip_amount is null or v_trip.trip_amount <= 0 then
    raise exception 'trip_amount_missing';
  end if;

  select
    coalesce(sum(pr.amount), 0),
    bool_or(true)
  into v_paid_advance_total, v_has_paid_advance
  from public.payment_requests pr
  where pr.trip_id = p_trip_id
    and pr.type = 'advance'::public.payment_type
    and pr.status = 'paid'::public.payment_status;

  if coalesce(v_has_paid_advance, false) is false then
    raise exception 'advance_not_paid_yet';
  end if;

  v_suggested_amount := greatest(v_trip.trip_amount - v_paid_advance_total, 0);
  v_amount := coalesce(p_amount, v_suggested_amount);

  if v_amount is null or v_amount <= 0 then
    raise exception 'final_amount_invalid';
  end if;

  if exists (
    select 1
    from public.payment_requests pr
    where pr.trip_id = p_trip_id
      and pr.type = 'balance'::public.payment_type
      and pr.status in ('pending'::public.payment_status, 'approved'::public.payment_status)
  ) then
    raise exception 'active_final_payment_exists';
  end if;

  if p_payment_method is null then
    raise exception 'invalid_payment_method';
  end if;

  if p_payment_method = 'bank'::public.payment_method then
    if nullif(btrim(coalesce(p_bank_account_holder, '')), '') is null
       or nullif(btrim(coalesce(p_bank_account_number, '')), '') is null
       or nullif(btrim(coalesce(p_bank_ifsc, '')), '') is null
       or nullif(btrim(coalesce(p_bank_name, '')), '') is null then
      raise exception 'bank_details_required';
    end if;
  elsif p_payment_method = 'upi'::public.payment_method then
    if nullif(btrim(coalesce(p_upi_id, '')), '') is null
       and nullif(btrim(coalesce(p_upi_qr_object_key, '')), '') is null then
      raise exception 'upi_details_required';
    end if;
  end if;

  v_beneficiary := nullif(btrim(coalesce(p_beneficiary, '')), '');
  if v_beneficiary is null then
    if p_payment_method = 'bank'::public.payment_method then
      v_beneficiary := nullif(btrim(coalesce(p_bank_account_holder, '')), '');
    else
      v_beneficiary := coalesce(
        nullif(btrim(coalesce(p_upi_id, '')), ''),
        nullif(btrim(coalesce(v_trip.driver_name, '')), ''),
        'UPI Beneficiary'
      );
    end if;
  end if;

  insert into public.payment_requests (
    trip_id,
    type,
    amount,
    beneficiary,
    requested_by_id,
    status,
    notes,
    payment_method,
    bank_account_holder,
    bank_account_number,
    bank_ifsc,
    bank_name,
    upi_id,
    upi_qr_object_key,
    upi_qr_file_name,
    upi_qr_mime_type,
    upi_qr_size_bytes,
    upi_qr_uploaded_at
  ) values (
    p_trip_id,
    'balance'::public.payment_type,
    v_amount,
    coalesce(v_beneficiary, 'Beneficiary'),
    p_actor_user_id,
    'pending'::public.payment_status,
    nullif(btrim(coalesce(p_notes, '')), ''),
    p_payment_method,
    nullif(btrim(coalesce(p_bank_account_holder, '')), ''),
    nullif(btrim(coalesce(p_bank_account_number, '')), ''),
    nullif(btrim(coalesce(p_bank_ifsc, '')), ''),
    nullif(btrim(coalesce(p_bank_name, '')), ''),
    nullif(btrim(coalesce(p_upi_id, '')), ''),
    nullif(btrim(coalesce(p_upi_qr_object_key, '')), ''),
    nullif(btrim(coalesce(p_upi_qr_file_name, '')), ''),
    nullif(btrim(coalesce(p_upi_qr_mime_type, '')), ''),
    p_upi_qr_size_bytes,
    case
      when nullif(btrim(coalesce(p_upi_qr_object_key, '')), '') is not null then now()
      else null
    end
  )
  returning id into v_request_id;

  return jsonb_build_object(
    'id', v_request_id,
    'trip_id', p_trip_id,
    'trip_code', v_trip.trip_code,
    'amount', v_amount,
    'suggested_amount', v_suggested_amount,
    'paid_advance_total', v_paid_advance_total,
    'trip_amount', v_trip.trip_amount,
    'status', 'pending',
    'payment_method', p_payment_method::text
  );
end;
$$;

create or replace function public.trip_payment_summary_v1(
  p_actor_user_id uuid,
  p_trip_id uuid
)
returns table (
  trip_id uuid,
  trip_code text,
  trip_amount numeric,
  current_stage text,
  paid_advance_total numeric,
  pending_advance_total numeric,
  suggested_final_amount numeric,
  paid_balance_total numeric,
  is_trip_completed boolean
)
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  v_role text;
  v_trip record;
  v_sales_owner_id uuid;
begin
  v_role := trip_assert_actor_v1(p_actor_user_id);

  if v_role not in ('sales_consigner', 'operations_consigner', 'operations_vehicles', 'accounts', 'admin', 'super_admin') then
    raise exception 'permission_denied';
  end if;

  select
    t.id,
    t.trip_code,
    t.trip_amount,
    t.current_stage,
    to1.sales_consigner_owner_id
  into v_trip
  from public.trips t
  left join public.trip_owners to1 on to1.trip_id = t.id
  where t.id = p_trip_id;

  if v_trip.id is null then
    raise exception 'trip_not_found';
  end if;

  v_sales_owner_id := v_trip.sales_consigner_owner_id;
  if v_role = 'sales_consigner' and (v_sales_owner_id is null or v_sales_owner_id <> p_actor_user_id) then
    raise exception 'permission_denied';
  end if;

  return query
  select
    v_trip.id,
    v_trip.trip_code,
    v_trip.trip_amount,
    v_trip.current_stage::text,
    coalesce(sum(case when pr.type = 'advance'::public.payment_type and pr.status = 'paid'::public.payment_status then pr.amount else 0 end), 0) as paid_advance_total,
    coalesce(sum(case when pr.type = 'advance'::public.payment_type and pr.status in ('pending'::public.payment_status, 'approved'::public.payment_status) then pr.amount else 0 end), 0) as pending_advance_total,
    greatest(
      coalesce(v_trip.trip_amount, 0) - coalesce(sum(case when pr.type = 'advance'::public.payment_type and pr.status = 'paid'::public.payment_status then pr.amount else 0 end), 0),
      0
    ) as suggested_final_amount,
    coalesce(sum(case when pr.type = 'balance'::public.payment_type and pr.status = 'paid'::public.payment_status then pr.amount else 0 end), 0) as paid_balance_total,
    (v_trip.current_stage = 'closed'::public.trip_stage) as is_trip_completed
  from public.payment_requests pr
  where pr.trip_id = p_trip_id;
end;
$$;

grant execute on function public.trip_payment_queue_list_v1(uuid, text, text, text, integer, integer) to authenticated;
grant execute on function public.trip_payment_proof_prepare_v1(uuid, uuid, text, text, bigint) to authenticated;
grant execute on function public.trip_payment_mark_paid_v1(uuid, uuid, text, text, text, bigint, text, numeric, text) to authenticated;
grant execute on function public.trip_final_payment_request_create_v1(
  uuid,
  uuid,
  numeric,
  text,
  text,
  public.payment_method,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  bigint
) to authenticated;
grant execute on function public.trip_payment_summary_v1(uuid, uuid) to authenticated;

commit;
