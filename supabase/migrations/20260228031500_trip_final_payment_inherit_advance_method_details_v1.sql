begin;

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

  v_bank_account_holder text;
  v_bank_account_number text;
  v_bank_ifsc text;
  v_bank_name text;
  v_upi_id text;
  v_upi_qr_object_key text;
  v_upi_qr_file_name text;
  v_upi_qr_mime_type text;
  v_upi_qr_size_bytes bigint;
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

  -- Start with explicit input (if any), then inherit from latest advance request of same method.
  v_bank_account_holder := nullif(btrim(coalesce(p_bank_account_holder, '')), '');
  v_bank_account_number := nullif(btrim(coalesce(p_bank_account_number, '')), '');
  v_bank_ifsc := nullif(btrim(coalesce(p_bank_ifsc, '')), '');
  v_bank_name := nullif(btrim(coalesce(p_bank_name, '')), '');
  v_upi_id := nullif(btrim(coalesce(p_upi_id, '')), '');
  v_upi_qr_object_key := nullif(btrim(coalesce(p_upi_qr_object_key, '')), '');
  v_upi_qr_file_name := nullif(btrim(coalesce(p_upi_qr_file_name, '')), '');
  v_upi_qr_mime_type := nullif(btrim(coalesce(p_upi_qr_mime_type, '')), '');
  v_upi_qr_size_bytes := p_upi_qr_size_bytes;

  if p_payment_method = 'bank'::public.payment_method then
    if v_bank_account_holder is null
       or v_bank_account_number is null
       or v_bank_ifsc is null
       or v_bank_name is null then
      select
        pr.bank_account_holder,
        pr.bank_account_number,
        pr.bank_ifsc,
        pr.bank_name
      into
        v_bank_account_holder,
        v_bank_account_number,
        v_bank_ifsc,
        v_bank_name
      from public.payment_requests pr
      where pr.trip_id = p_trip_id
        and pr.type = 'advance'::public.payment_type
        and pr.payment_method = 'bank'::public.payment_method
      order by pr.created_at desc
      limit 1;
    end if;

    if v_bank_account_holder is null
       or v_bank_account_number is null
       or v_bank_ifsc is null
       or v_bank_name is null then
      raise exception 'bank_details_required';
    end if;
  elsif p_payment_method = 'upi'::public.payment_method then
    if v_upi_id is null and v_upi_qr_object_key is null then
      select
        pr.upi_id,
        pr.upi_qr_object_key,
        pr.upi_qr_file_name,
        pr.upi_qr_mime_type,
        pr.upi_qr_size_bytes
      into
        v_upi_id,
        v_upi_qr_object_key,
        v_upi_qr_file_name,
        v_upi_qr_mime_type,
        v_upi_qr_size_bytes
      from public.payment_requests pr
      where pr.trip_id = p_trip_id
        and pr.type = 'advance'::public.payment_type
        and pr.payment_method = 'upi'::public.payment_method
        and (pr.upi_id is not null or pr.upi_qr_object_key is not null)
      order by pr.created_at desc
      limit 1;
    end if;

    if v_upi_id is null and v_upi_qr_object_key is null then
      raise exception 'upi_details_required';
    end if;
  end if;

  v_beneficiary := nullif(btrim(coalesce(p_beneficiary, '')), '');
  if v_beneficiary is null then
    if p_payment_method = 'bank'::public.payment_method then
      v_beneficiary := v_bank_account_holder;
    else
      v_beneficiary := coalesce(
        v_upi_id,
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
    v_bank_account_holder,
    v_bank_account_number,
    v_bank_ifsc,
    v_bank_name,
    v_upi_id,
    v_upi_qr_object_key,
    v_upi_qr_file_name,
    v_upi_qr_mime_type,
    v_upi_qr_size_bytes,
    case
      when v_upi_qr_object_key is not null then now()
      else null
    end
  )
  returning id into v_request_id;

  insert into public.trip_stage_history (trip_id, from_stage, to_stage, actor_id, notes)
  values (
    p_trip_id,
    v_trip.current_stage,
    v_trip.current_stage,
    p_actor_user_id,
    format('Final payment requested (%s)', v_amount::text)
  );

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

commit;
