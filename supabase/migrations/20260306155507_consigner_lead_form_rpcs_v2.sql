begin;

create or replace function public.consigner_lead_create_v2(
  p_actor uuid,
  p_company_name text,
  p_contact_person text,
  p_phone text,
  p_email text default null,
  p_source lead_source default 'cold_call'::lead_source,
  p_estimated_value numeric default null,
  p_route text default null,
  p_vehicle_type text default null,
  p_priority lead_priority default 'medium'::lead_priority,
  p_notes text default null,
  p_next_follow_up date default null,
  p_company_address text default null,
  p_contact_person_designation text default null,
  p_nature_of_business text default null,
  p_vehicle_requirements text[] default null
)
returns jsonb
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  v_role text;
  v_name text;
  v_new_id uuid;
  v_vehicle_requirements text[];
  v_primary_vehicle_type text;
  v_result jsonb;
begin
  select p.role, p.full_name into v_role, v_name
  from profiles p
  where p.id = p_actor
    and p.active = true;

  if v_role is null or v_role not in ('sales_consigner','admin','super_admin') then
    raise exception 'forbidden';
  end if;

  select coalesce(array_agg(v.item), '{}'::text[])
  into v_vehicle_requirements
  from (
    select nullif(btrim(req), '') as item
    from unnest(coalesce(p_vehicle_requirements, '{}'::text[])) as req
  ) v
  where v.item is not null;

  v_primary_vehicle_type := coalesce(
    v_vehicle_requirements[1],
    nullif(btrim(coalesce(p_vehicle_type, '')), '')
  );

  insert into consigner_leads (
    company_name,
    company_address,
    contact_person,
    contact_person_designation,
    nature_of_business,
    phone,
    email,
    source,
    estimated_value,
    route,
    vehicle_type,
    vehicle_requirements,
    stage,
    priority,
    notes,
    sales_consigner_owner_id,
    next_follow_up
  ) values (
    p_company_name,
    nullif(btrim(coalesce(p_company_address, '')), ''),
    p_contact_person,
    nullif(btrim(coalesce(p_contact_person_designation, '')), ''),
    nullif(btrim(coalesce(p_nature_of_business, '')), ''),
    p_phone,
    p_email,
    p_source,
    p_estimated_value,
    p_route,
    v_primary_vehicle_type,
    v_vehicle_requirements,
    'new_enquiry',
    p_priority,
    p_notes,
    p_actor,
    p_next_follow_up
  ) returning id into v_new_id;

  select jsonb_build_object(
    'id', cl.id,
    'company_name', cl.company_name,
    'company_address', cl.company_address,
    'contact_person', cl.contact_person,
    'contact_person_designation', cl.contact_person_designation,
    'nature_of_business', cl.nature_of_business,
    'phone', cl.phone,
    'email', cl.email,
    'source', cl.source,
    'estimated_value', cl.estimated_value,
    'route', cl.route,
    'vehicle_type', cl.vehicle_type,
    'vehicle_requirements', coalesce(cl.vehicle_requirements, '{}'::text[]),
    'stage', cl.stage,
    'priority', cl.priority,
    'notes', cl.notes,
    'sales_consigner_owner_id', cl.sales_consigner_owner_id,
    'next_follow_up', cl.next_follow_up,
    'converted_customer_id', cl.converted_customer_id,
    'created_at', cl.created_at,
    'updated_at', cl.updated_at,
    'owner_name', coalesce(pr.full_name, 'Unknown')
  ) into v_result
  from consigner_leads cl
  left join profiles pr on pr.id = cl.sales_consigner_owner_id
  where cl.id = v_new_id;

  return v_result;
end;
$$;

create or replace function public.consigner_lead_update_v2(
  p_actor uuid,
  p_lead_id uuid,
  p_company_name text default null,
  p_contact_person text default null,
  p_phone text default null,
  p_email text default null,
  p_estimated_value numeric default null,
  p_route text default null,
  p_vehicle_type text default null,
  p_priority lead_priority default null,
  p_notes text default null,
  p_next_follow_up date default null,
  p_company_address text default null,
  p_contact_person_designation text default null,
  p_nature_of_business text default null,
  p_vehicle_requirements text[] default null
)
returns jsonb
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  v_role text;
  v_owner_id uuid;
  v_vehicle_requirements text[];
  v_vehicle_type text;
  v_result jsonb;
begin
  select p.role into v_role
  from profiles p
  where p.id = p_actor
    and p.active = true;

  if v_role is null or v_role not in ('sales_consigner','admin','super_admin') then
    raise exception 'forbidden';
  end if;

  select cl.sales_consigner_owner_id into v_owner_id
  from consigner_leads cl
  where cl.id = p_lead_id;

  if v_owner_id is null then
    raise exception 'not_found';
  end if;

  if v_role = 'sales_consigner' and v_owner_id != p_actor then
    raise exception 'forbidden';
  end if;

  if p_vehicle_requirements is not null then
    select coalesce(array_agg(v.item), '{}'::text[])
    into v_vehicle_requirements
    from (
      select nullif(btrim(req), '') as item
      from unnest(coalesce(p_vehicle_requirements, '{}'::text[])) as req
    ) v
    where v.item is not null;

    v_vehicle_type := coalesce(
      v_vehicle_requirements[1],
      nullif(btrim(coalesce(p_vehicle_type, '')), '')
    );
  else
    v_vehicle_type := nullif(btrim(coalesce(p_vehicle_type, '')), '');
  end if;

  update consigner_leads cl
  set
    company_name = coalesce(p_company_name, cl.company_name),
    company_address = coalesce(p_company_address, cl.company_address),
    contact_person = coalesce(p_contact_person, cl.contact_person),
    contact_person_designation = coalesce(p_contact_person_designation, cl.contact_person_designation),
    nature_of_business = coalesce(p_nature_of_business, cl.nature_of_business),
    phone = coalesce(p_phone, cl.phone),
    email = coalesce(p_email, cl.email),
    estimated_value = coalesce(p_estimated_value, cl.estimated_value),
    route = coalesce(p_route, cl.route),
    vehicle_type = case
      when p_vehicle_requirements is not null then v_vehicle_type
      else coalesce(v_vehicle_type, cl.vehicle_type)
    end,
    vehicle_requirements = coalesce(v_vehicle_requirements, cl.vehicle_requirements),
    priority = coalesce(p_priority, cl.priority),
    notes = coalesce(p_notes, cl.notes),
    next_follow_up = coalesce(p_next_follow_up, cl.next_follow_up)
  where cl.id = p_lead_id;

  select jsonb_build_object(
    'id', cl.id,
    'company_name', cl.company_name,
    'company_address', cl.company_address,
    'contact_person', cl.contact_person,
    'contact_person_designation', cl.contact_person_designation,
    'nature_of_business', cl.nature_of_business,
    'phone', cl.phone,
    'email', cl.email,
    'source', cl.source,
    'estimated_value', cl.estimated_value,
    'route', cl.route,
    'vehicle_type', cl.vehicle_type,
    'vehicle_requirements', coalesce(cl.vehicle_requirements, '{}'::text[]),
    'stage', cl.stage,
    'priority', cl.priority,
    'notes', cl.notes,
    'sales_consigner_owner_id', cl.sales_consigner_owner_id,
    'next_follow_up', cl.next_follow_up,
    'converted_customer_id', cl.converted_customer_id,
    'created_at', cl.created_at,
    'updated_at', cl.updated_at,
    'owner_name', coalesce(pr.full_name, 'Unknown')
  ) into v_result
  from consigner_leads cl
  left join profiles pr on pr.id = cl.sales_consigner_owner_id
  where cl.id = p_lead_id;

  return v_result;
end;
$$;

create or replace function public.consigner_lead_get_v2(
  p_actor uuid,
  p_lead_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  v_role text;
  v_owner_id uuid;
  v_result jsonb;
begin
  select p.role into v_role
  from profiles p
  where p.id = p_actor
    and p.active = true;

  if v_role is null or v_role not in ('sales_consigner','admin','super_admin') then
    raise exception 'forbidden';
  end if;

  select cl.sales_consigner_owner_id into v_owner_id
  from consigner_leads cl
  where cl.id = p_lead_id;

  if v_owner_id is null then
    raise exception 'not_found';
  end if;

  if v_role = 'sales_consigner' and v_owner_id != p_actor then
    raise exception 'forbidden';
  end if;

  select jsonb_build_object(
    'id', cl.id,
    'company_name', cl.company_name,
    'company_address', cl.company_address,
    'contact_person', cl.contact_person,
    'contact_person_designation', cl.contact_person_designation,
    'nature_of_business', cl.nature_of_business,
    'phone', cl.phone,
    'email', cl.email,
    'source', cl.source,
    'estimated_value', cl.estimated_value,
    'route', cl.route,
    'vehicle_type', cl.vehicle_type,
    'vehicle_requirements', coalesce(cl.vehicle_requirements, '{}'::text[]),
    'stage', cl.stage,
    'priority', cl.priority,
    'notes', cl.notes,
    'sales_consigner_owner_id', cl.sales_consigner_owner_id,
    'next_follow_up', cl.next_follow_up,
    'converted_customer_id', cl.converted_customer_id,
    'created_at', cl.created_at,
    'updated_at', cl.updated_at,
    'owner_name', coalesce(pr.full_name, 'Unknown')
  ) into v_result
  from consigner_leads cl
  left join profiles pr on pr.id = cl.sales_consigner_owner_id
  where cl.id = p_lead_id;

  if v_result is null then
    raise exception 'not_found';
  end if;

  return v_result;
end;
$$;

create or replace function public.consigner_lead_list_v2(
  p_actor uuid,
  p_stage text default null,
  p_priority text default null,
  p_search text default null,
  p_limit integer default 200,
  p_offset integer default 0
)
returns jsonb
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  v_role text;
  v_result jsonb;
begin
  select p.role into v_role
  from profiles p
  where p.id = p_actor
    and p.active = true;

  if v_role is null or v_role not in ('sales_consigner','admin','super_admin') then
    raise exception 'forbidden';
  end if;

  select coalesce(jsonb_agg(row_data), '[]'::jsonb) into v_result
  from (
    select jsonb_build_object(
      'id', cl.id,
      'company_name', cl.company_name,
      'company_address', cl.company_address,
      'contact_person', cl.contact_person,
      'contact_person_designation', cl.contact_person_designation,
      'nature_of_business', cl.nature_of_business,
      'phone', cl.phone,
      'email', cl.email,
      'source', cl.source,
      'estimated_value', cl.estimated_value,
      'route', cl.route,
      'vehicle_type', cl.vehicle_type,
      'vehicle_requirements', coalesce(cl.vehicle_requirements, '{}'::text[]),
      'stage', cl.stage,
      'priority', cl.priority,
      'notes', cl.notes,
      'sales_consigner_owner_id', cl.sales_consigner_owner_id,
      'next_follow_up', cl.next_follow_up,
      'converted_customer_id', cl.converted_customer_id,
      'created_at', cl.created_at,
      'updated_at', cl.updated_at,
      'owner_name', coalesce(pr.full_name, 'Unknown')
    ) as row_data
    from consigner_leads cl
    left join profiles pr on pr.id = cl.sales_consigner_owner_id
    where
      (v_role in ('admin','super_admin') or cl.sales_consigner_owner_id = p_actor)
      and (p_stage is null or cl.stage::text = p_stage)
      and (p_priority is null or cl.priority::text = p_priority)
      and (
        p_search is null
        or cl.company_name ilike '%' || p_search || '%'
        or cl.contact_person ilike '%' || p_search || '%'
      )
    order by cl.created_at desc
    limit least(p_limit, 500)
    offset greatest(p_offset, 0)
  ) sub;

  return v_result;
end;
$$;

grant execute on function public.consigner_lead_create_v2(
  uuid, text, text, text, text, lead_source, numeric, text, text, lead_priority, text, date, text, text, text, text[]
) to authenticated;

grant execute on function public.consigner_lead_update_v2(
  uuid, uuid, text, text, text, text, numeric, text, text, lead_priority, text, date, text, text, text, text[]
) to authenticated;

grant execute on function public.consigner_lead_get_v2(uuid, uuid) to authenticated;
grant execute on function public.consigner_lead_list_v2(uuid, text, text, text, integer, integer) to authenticated;

commit;
