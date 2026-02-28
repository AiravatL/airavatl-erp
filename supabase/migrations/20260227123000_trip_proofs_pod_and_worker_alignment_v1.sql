-- Reconciliation for trip proof uploads:
-- 1) Allow both loading and POD proof types.
-- 2) Add explicit policy set under RLS.
-- 3) Add POD prepare/confirm RPCs used by API routes.

alter table public.trip_proofs enable row level security;

do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conrelid = 'public.trip_proofs'::regclass
      and conname = 'trip_proofs_proof_type_chk'
  ) then
    alter table public.trip_proofs drop constraint trip_proofs_proof_type_chk;
  end if;
end $$;

alter table public.trip_proofs
  add constraint trip_proofs_proof_type_chk
  check (proof_type in ('loading', 'pod'));

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    if not exists (
      select 1
      from pg_policies
      where schemaname = 'public'
        and tablename = 'trip_proofs'
        and policyname = 'trip_proofs_service_role_all_v1'
    ) then
      execute
        'create policy trip_proofs_service_role_all_v1
           on public.trip_proofs
           for all
           to service_role
           using (true)
           with check (true)';
    end if;
  end if;
end $$;

create or replace function public.trip_pod_proof_prepare_v1(
  p_actor_user_id uuid,
  p_trip_id uuid,
  p_file_name text,
  p_mime_type text,
  p_file_size_bytes bigint
)
returns jsonb
language plpgsql
security definer
set search_path = public
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

  if v_trip.current_stage not in ('in_transit', 'delivered', 'closed') then
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
    'erp/trip-proofs/%s/pod/%s_%s.%s',
    p_trip_id::text,
    extract(epoch from clock_timestamp())::bigint::text,
    substr(md5(random()::text || clock_timestamp()::text), 1, 8),
    v_ext
  );

  return jsonb_build_object(
    'trip_id', p_trip_id,
    'proof_type', 'pod',
    'object_key', v_object_key
  );
end;
$$;

create or replace function public.trip_pod_proof_confirm_v1(
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
set search_path = public
as $$
declare
  v_role text;
  v_trip record;
  v_owner_id uuid;
  v_row public.trip_proofs%rowtype;
  v_actor_name text;
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

  if v_trip.current_stage not in ('in_transit', 'delivered', 'closed') then
    raise exception 'trip_not_vehicle_assigned';
  end if;

  if nullif(btrim(coalesce(p_object_key, '')), '') is null then
    raise exception 'invalid_object_key';
  end if;

  if p_object_key not like format('erp/trip-proofs/%s/pod/%%', p_trip_id::text)
     and p_object_key not like format('trips/%s/pod-%%', p_trip_id::text) then
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
    'pod',
    p_object_key,
    p_file_name,
    coalesce(nullif(btrim(coalesce(p_mime_type, '')), ''), 'application/octet-stream'),
    p_file_size_bytes,
    p_actor_user_id
  )
  returning * into v_row;

  select full_name into v_actor_name from public.profiles where id = p_actor_user_id;

  insert into public.audit_logs (
    entity, entity_id, action, actor_id, actor_name, actor_role, details, after_data
  ) values (
    'trip_proof',
    v_row.id,
    'upload_pod',
    p_actor_user_id,
    coalesce(v_actor_name, 'Unknown'),
    v_role::public.user_role,
    format('POD uploaded for trip %s', p_trip_id::text),
    jsonb_build_object(
      'trip_id', v_row.trip_id,
      'proof_type', v_row.proof_type,
      'object_key', v_row.object_key,
      'file_name', v_row.file_name,
      'file_size_bytes', v_row.file_size_bytes
    )
  );

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

grant execute on function public.trip_pod_proof_prepare_v1(uuid, uuid, text, text, bigint) to authenticated;
grant execute on function public.trip_pod_proof_confirm_v1(uuid, uuid, text, text, text, bigint) to authenticated;
