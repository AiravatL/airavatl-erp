-- Fix stale enum cast in trip/payment audit RPCs.
-- Some functions still referenced public.user_role, but the active enum is public.role_type.

do $$
declare
  r record;
  v_sql text;
begin
  for r in
    select p.oid
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prokind = 'f'
      and pg_get_functiondef(p.oid) like '%::public.user_role%'
  loop
    v_sql := replace(pg_get_functiondef(r.oid), '::public.user_role', '::public.role_type');
    execute v_sql;
  end loop;
end;
$$;
