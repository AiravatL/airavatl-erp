begin;

do $$
begin
  if not exists (
    select 1
    from pg_type
    where typnamespace = 'public'::regnamespace
      and typname = 'payment_method'
  ) then
    create type public.payment_method as enum ('bank', 'upi');
  end if;
end;
$$;

alter table public.trips
  add column if not exists started_at timestamptz;

alter table public.trips
  add column if not exists started_by_id uuid;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where connamespace = 'public'::regnamespace
      and conname = 'trips_started_by_id_fkey'
  ) then
    alter table public.trips
      add constraint trips_started_by_id_fkey
      foreign key (started_by_id)
      references public.profiles(id);
  end if;
end;
$$;

create index if not exists idx_trips_started_by
  on public.trips (started_by_id);

alter table public.payment_requests
  add column if not exists payment_method public.payment_method,
  add column if not exists bank_account_holder text,
  add column if not exists bank_account_number text,
  add column if not exists bank_ifsc text,
  add column if not exists bank_name text,
  add column if not exists upi_id text,
  add column if not exists upi_qr_object_key text,
  add column if not exists upi_qr_file_name text,
  add column if not exists upi_qr_mime_type text,
  add column if not exists upi_qr_size_bytes bigint,
  add column if not exists upi_qr_uploaded_at timestamptz;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where connamespace = 'public'::regnamespace
      and conname = 'payment_requests_advance_method_required_chk'
  ) then
    alter table public.payment_requests
      add constraint payment_requests_advance_method_required_chk
      check (
        type <> 'advance'::public.payment_type
        or payment_method is not null
      ) not valid;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where connamespace = 'public'::regnamespace
      and conname = 'payment_requests_bank_fields_chk'
  ) then
    alter table public.payment_requests
      add constraint payment_requests_bank_fields_chk
      check (
        payment_method is distinct from 'bank'::public.payment_method
        or (
          nullif(btrim(coalesce(bank_account_holder, '')), '') is not null
          and nullif(btrim(coalesce(bank_account_number, '')), '') is not null
          and nullif(btrim(coalesce(bank_ifsc, '')), '') is not null
          and nullif(btrim(coalesce(bank_name, '')), '') is not null
        )
      ) not valid;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where connamespace = 'public'::regnamespace
      and conname = 'payment_requests_upi_fields_chk'
  ) then
    alter table public.payment_requests
      add constraint payment_requests_upi_fields_chk
      check (
        payment_method is distinct from 'upi'::public.payment_method
        or (
          nullif(btrim(coalesce(upi_id, '')), '') is not null
          or nullif(btrim(coalesce(upi_qr_object_key, '')), '') is not null
        )
      ) not valid;
  end if;
end;
$$;

create index if not exists idx_payment_requests_trip_type_status_created
  on public.payment_requests (trip_id, type, status, created_at desc);

create index if not exists idx_payment_requests_trip_active_advance
  on public.payment_requests (trip_id)
  where type = 'advance'::public.payment_type
    and status in ('pending'::public.payment_status, 'approved'::public.payment_status);

create table if not exists public.trip_proofs (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  proof_type text not null,
  object_key text not null,
  file_name text not null,
  mime_type text not null,
  file_size_bytes bigint not null check (file_size_bytes > 0),
  uploaded_by_id uuid not null references public.profiles(id),
  created_at timestamptz not null default now()
);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where connamespace = 'public'::regnamespace
      and conname = 'trip_proofs_proof_type_chk'
  ) then
    alter table public.trip_proofs
      add constraint trip_proofs_proof_type_chk
      check (proof_type in ('loading'));
  end if;
end;
$$;

create index if not exists idx_trip_proofs_trip_type_created
  on public.trip_proofs (trip_id, proof_type, created_at desc);

create index if not exists idx_trip_proofs_uploaded_by
  on public.trip_proofs (uploaded_by_id, created_at desc);

create or replace function public.trip_assign_vehicle_v2(
  p_actor_user_id uuid,
  p_trip_id uuid,
  p_vehicle_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  v_role text;
  v_trip record;
  v_vehicle record;
  v_vendor_name text;
  v_driver_name text;
  v_started_at timestamptz;
begin
  v_role := trip_assert_actor_v1(p_actor_user_id);

  if v_role not in ('operations_vehicles', 'admin', 'super_admin') then
    raise exception 'permission_denied';
  end if;

  select id, trip_code, current_stage
  into v_trip
  from public.trips
  where id = p_trip_id;

  if v_trip.id is null then
    raise exception 'trip_not_found';
  end if;

  if v_trip.current_stage != 'confirmed' then
    raise exception 'trip_not_confirmed';
  end if;

  select v.id, v.number, v.status, v.ownership_type, v.vendor_id
  into v_vehicle
  from public.vehicles v
  where v.id = p_vehicle_id;

  if v_vehicle.id is null then
    raise exception 'vehicle_not_found';
  end if;

  if v_vehicle.status != 'available' then
    raise exception 'vehicle_not_available';
  end if;

  if v_vehicle.vendor_id is not null then
    select vd.name into v_vendor_name
    from public.vendors vd
    where vd.id = v_vehicle.vendor_id;

    select vl.driver_name into v_driver_name
    from public.vehicle_leads vl
    where vl.converted_vendor_id = v_vehicle.vendor_id
      and vl.is_owner_cum_driver = true
    order by vl.created_at desc
    limit 1;
  end if;

  update public.trips
  set
    current_stage = 'vehicle_assigned',
    vehicle_id = p_vehicle_id,
    vehicle_number = v_vehicle.number,
    vendor_id = v_vehicle.vendor_id,
    driver_name = coalesce(v_driver_name, v_vendor_name),
    leased_flag = (v_vehicle.ownership_type = 'leased'),
    started_at = coalesce(started_at, now()),
    started_by_id = p_actor_user_id,
    updated_at = now()
  where id = p_trip_id
  returning started_at into v_started_at;

  update public.vehicles
  set
    status = 'on_trip',
    current_trip_id = p_trip_id,
    updated_at = now()
  where id = p_vehicle_id;

  update public.trip_owners
  set
    operations_vehicles_owner_id = p_actor_user_id,
    updated_at = now()
  where trip_id = p_trip_id;

  insert into public.trip_stage_history (trip_id, from_stage, to_stage, actor_id)
  values (p_trip_id, 'confirmed', 'vehicle_assigned', p_actor_user_id);

  return jsonb_build_object(
    'trip_id', v_trip.id,
    'trip_code', v_trip.trip_code,
    'vehicle_number', v_vehicle.number,
    'ops_vehicles_owner_id', p_actor_user_id,
    'started_at', v_started_at
  );
end;
$$;

create or replace function public.trip_loading_proof_prepare_v1(
  p_actor_user_id uuid,
  p_trip_id uuid,
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
  v_trip record;
  v_owner_id uuid;
  v_ext text;
  v_object_key text;
begin
  v_role := trip_assert_actor_v1(p_actor_user_id);

  if v_role not in ('operations_vehicles', 'admin', 'super_admin') then
    raise exception 'permission_denied';
  end if;

  select t.id, t.current_stage, to1.operations_vehicles_owner_id
  into v_trip
  from public.trips t
  left join public.trip_owners to1 on to1.trip_id = t.id
  where t.id = p_trip_id;

  if v_trip.id is null then
    raise exception 'trip_not_found';
  end if;

  v_owner_id := v_trip.operations_vehicles_owner_id;

  if v_role = 'operations_vehicles' and (v_owner_id is null or v_owner_id <> p_actor_user_id) then
    raise exception 'not_trip_ops_vehicle_owner';
  end if;

  if v_trip.current_stage not in ('vehicle_assigned', 'at_loading', 'loaded_docs_ok', 'advance_paid', 'in_transit', 'delivered') then
    raise exception 'trip_not_vehicle_assigned';
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
    'erp/trip-proofs/%s/loading/%s_%s.%s',
    p_trip_id::text,
    extract(epoch from clock_timestamp())::bigint::text,
    substr(md5(random()::text || clock_timestamp()::text), 1, 8),
    v_ext
  );

  return jsonb_build_object(
    'trip_id', p_trip_id,
    'proof_type', 'loading',
    'object_key', v_object_key
  );
end;
$$;

create or replace function public.trip_loading_proof_confirm_v1(
  p_actor_user_id uuid,
  p_trip_id uuid,
  p_object_key text,
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
  v_trip record;
  v_owner_id uuid;
  v_row public.trip_proofs%rowtype;
begin
  v_role := trip_assert_actor_v1(p_actor_user_id);

  if v_role not in ('operations_vehicles', 'admin', 'super_admin') then
    raise exception 'permission_denied';
  end if;

  select t.id, t.current_stage, to1.operations_vehicles_owner_id
  into v_trip
  from public.trips t
  left join public.trip_owners to1 on to1.trip_id = t.id
  where t.id = p_trip_id;

  if v_trip.id is null then
    raise exception 'trip_not_found';
  end if;

  v_owner_id := v_trip.operations_vehicles_owner_id;

  if v_role = 'operations_vehicles' and (v_owner_id is null or v_owner_id <> p_actor_user_id) then
    raise exception 'not_trip_ops_vehicle_owner';
  end if;

  if v_trip.current_stage not in ('vehicle_assigned', 'at_loading', 'loaded_docs_ok', 'advance_paid', 'in_transit', 'delivered') then
    raise exception 'trip_not_vehicle_assigned';
  end if;

  if nullif(btrim(coalesce(p_object_key, '')), '') is null then
    raise exception 'invalid_object_key';
  end if;

  if p_object_key not like format('erp/trip-proofs/%s/loading/%%', p_trip_id::text)
     and p_object_key not like format('trips/%s/loading-%%', p_trip_id::text) then
    raise exception 'invalid_object_key';
  end if;

  if nullif(btrim(coalesce(p_file_name, '')), '') is null then
    raise exception 'file_name_required';
  end if;

  if p_file_size_bytes is null or p_file_size_bytes <= 0 or p_file_size_bytes > 15728640 then
    raise exception 'file_too_large';
  end if;

  insert into public.trip_proofs (
    trip_id,
    proof_type,
    object_key,
    file_name,
    mime_type,
    file_size_bytes,
    uploaded_by_id
  ) values (
    p_trip_id,
    'loading',
    p_object_key,
    p_file_name,
    coalesce(nullif(btrim(coalesce(p_mime_type, '')), ''), 'application/octet-stream'),
    p_file_size_bytes,
    p_actor_user_id
  )
  returning * into v_row;

  return jsonb_build_object(
    'id', v_row.id,
    'trip_id', v_row.trip_id,
    'proof_type', v_row.proof_type,
    'object_key', v_row.object_key,
    'file_name', v_row.file_name,
    'mime_type', v_row.mime_type,
    'file_size_bytes', v_row.file_size_bytes,
    'uploaded_by_id', v_row.uploaded_by_id,
    'created_at', v_row.created_at
  );
end;
$$;

create or replace function public.trip_loading_proofs_list_v1(
  p_actor_user_id uuid,
  p_trip_id uuid
)
returns table (
  id uuid,
  trip_id uuid,
  proof_type text,
  object_key text,
  file_name text,
  mime_type text,
  file_size_bytes bigint,
  uploaded_by_id uuid,
  uploaded_by_name text,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  v_role text;
  v_owner_id uuid;
begin
  v_role := trip_assert_actor_v1(p_actor_user_id);

  if v_role not in ('sales_consigner', 'operations_consigner', 'operations_vehicles', 'admin', 'super_admin') then
    raise exception 'permission_denied';
  end if;

  if v_role = 'sales_consigner' then
    select to1.sales_consigner_owner_id into v_owner_id
    from public.trip_owners to1
    where to1.trip_id = p_trip_id;

    if v_owner_id is null or v_owner_id <> p_actor_user_id then
      raise exception 'permission_denied';
    end if;
  end if;

  if not exists (select 1 from public.trips t where t.id = p_trip_id) then
    raise exception 'trip_not_found';
  end if;

  return query
  select
    tp.id,
    tp.trip_id,
    tp.proof_type,
    tp.object_key,
    tp.file_name,
    tp.mime_type,
    tp.file_size_bytes,
    tp.uploaded_by_id,
    coalesce(p.full_name, ''),
    tp.created_at
  from public.trip_proofs tp
  left join public.profiles p on p.id = tp.uploaded_by_id
  where tp.trip_id = p_trip_id
  order by tp.created_at desc;
end;
$$;

create or replace function public.trip_advance_upi_qr_prepare_v1(
  p_actor_user_id uuid,
  p_trip_id uuid,
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
  v_trip record;
  v_ext text;
  v_object_key text;
begin
  v_role := trip_assert_actor_v1(p_actor_user_id);

  if v_role not in ('operations_vehicles', 'admin', 'super_admin') then
    raise exception 'permission_denied';
  end if;

  select t.id, t.current_stage, to1.operations_vehicles_owner_id
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

  if v_trip.current_stage not in ('vehicle_assigned', 'at_loading', 'loaded_docs_ok', 'advance_paid', 'in_transit') then
    raise exception 'trip_not_vehicle_assigned';
  end if;

  if nullif(btrim(coalesce(p_file_name, '')), '') is null then
    raise exception 'file_name_required';
  end if;

  if p_file_size_bytes is null or p_file_size_bytes <= 0 or p_file_size_bytes > 10485760 then
    raise exception 'file_too_large';
  end if;

  v_ext := lower(nullif(regexp_replace(p_file_name, '^.*\.([^.]+)$', '\1'), p_file_name));
  if v_ext is null then
    raise exception 'invalid_file_type';
  end if;
  if v_ext not in ('jpg', 'jpeg', 'png', 'webp') then
    raise exception 'invalid_file_type';
  end if;

  v_object_key := format(
    'erp/payment-proofs/%s/advance-upi-qr/%s_%s.%s',
    p_trip_id::text,
    extract(epoch from clock_timestamp())::bigint::text,
    substr(md5(random()::text || clock_timestamp()::text), 1, 8),
    v_ext
  );

  return jsonb_build_object(
    'trip_id', p_trip_id,
    'object_key', v_object_key
  );
end;
$$;

create or replace function public.trip_advance_request_create_v1(
  p_actor_user_id uuid,
  p_trip_id uuid,
  p_amount numeric,
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
  v_request_id uuid;
  v_beneficiary text;
begin
  v_role := trip_assert_actor_v1(p_actor_user_id);

  if v_role not in ('operations_vehicles', 'admin', 'super_admin') then
    raise exception 'permission_denied';
  end if;

  select t.id, t.trip_code, t.current_stage, t.driver_name, to1.operations_vehicles_owner_id
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

  if v_trip.current_stage not in ('vehicle_assigned', 'at_loading', 'loaded_docs_ok', 'advance_paid', 'in_transit') then
    raise exception 'trip_not_vehicle_assigned';
  end if;

  if p_amount is null or p_amount <= 0 then
    raise exception 'amount_invalid';
  end if;

  if p_payment_method is null then
    raise exception 'invalid_payment_method';
  end if;

  if exists (
    select 1
    from public.payment_requests pr
    where pr.trip_id = p_trip_id
      and pr.type = 'advance'::public.payment_type
      and pr.status in ('pending'::public.payment_status, 'approved'::public.payment_status)
  ) then
    raise exception 'active_advance_exists';
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
    'advance'::public.payment_type,
    p_amount,
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
    'amount', p_amount,
    'beneficiary', coalesce(v_beneficiary, 'Beneficiary'),
    'status', 'pending',
    'payment_method', p_payment_method::text
  );
end;
$$;

create or replace function public.trip_payment_requests_list_v1(
  p_actor_user_id uuid,
  p_trip_id uuid
)
returns table (
  id uuid,
  trip_id uuid,
  type text,
  amount numeric,
  beneficiary text,
  status text,
  notes text,
  requested_by_id uuid,
  requested_by_name text,
  reviewed_by_id uuid,
  reviewed_by_name text,
  reviewed_at timestamptz,
  created_at timestamptz,
  payment_method text,
  upi_id text,
  upi_qr_object_key text
)
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  v_role text;
  v_owner_id uuid;
begin
  v_role := trip_assert_actor_v1(p_actor_user_id);

  if v_role not in ('sales_consigner', 'operations_consigner', 'operations_vehicles', 'admin', 'super_admin') then
    raise exception 'permission_denied';
  end if;

  if v_role = 'sales_consigner' then
    select to1.sales_consigner_owner_id into v_owner_id
    from public.trip_owners to1
    where to1.trip_id = p_trip_id;

    if v_owner_id is null or v_owner_id <> p_actor_user_id then
      raise exception 'permission_denied';
    end if;
  end if;

  if not exists (select 1 from public.trips t where t.id = p_trip_id) then
    raise exception 'trip_not_found';
  end if;

  return query
  select
    pr.id,
    pr.trip_id,
    pr.type::text,
    pr.amount,
    pr.beneficiary,
    pr.status::text,
    pr.notes,
    pr.requested_by_id,
    coalesce(req.full_name, ''),
    pr.reviewed_by_id,
    coalesce(rev.full_name, ''),
    pr.reviewed_at,
    pr.created_at,
    pr.payment_method::text,
    pr.upi_id,
    pr.upi_qr_object_key
  from public.payment_requests pr
  left join public.profiles req on req.id = pr.requested_by_id
  left join public.profiles rev on rev.id = pr.reviewed_by_id
  where pr.trip_id = p_trip_id
  order by pr.created_at desc;
end;
$$;

grant execute on function public.trip_assign_vehicle_v2(uuid, uuid, uuid) to authenticated;
grant execute on function public.trip_loading_proof_prepare_v1(uuid, uuid, text, text, bigint) to authenticated;
grant execute on function public.trip_loading_proof_confirm_v1(uuid, uuid, text, text, text, bigint) to authenticated;
grant execute on function public.trip_loading_proofs_list_v1(uuid, uuid) to authenticated;
grant execute on function public.trip_advance_upi_qr_prepare_v1(uuid, uuid, text, text, bigint) to authenticated;
grant execute on function public.trip_advance_request_create_v1(
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
grant execute on function public.trip_payment_requests_list_v1(uuid, uuid) to authenticated;

commit;
