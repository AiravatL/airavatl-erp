# Supabase Query Performance Audit (2026-02-25)

## Scope
This audit is based on live Supabase telemetry from:
- `postgres` logs (`mcp__supabase__get_logs`)
- `extensions.pg_stat_statements`
- `pg_policies`, `pg_stat_user_tables`, `pg_stat_user_indexes`
- Supabase performance advisors (`mcp__supabase__get_advisors type=performance`)

## Executive Summary
1. App-facing RPC workload is healthy overall, but a small set of RPCs account for most PostgREST query time.
2. Two RPCs are the main optimization candidates now:
   - `vehicle_lead_list_v1`
   - `customer_list_v1`
3. Structural DB issues exist and should be fixed early:
   - `41` foreign keys without covering indexes.
   - `17` RLS policies using row-by-row `auth.*` evaluation pattern.
4. Postgres logs currently do not show useful slow-query duration lines for app traffic; `pg_stat_statements` is the reliable source for timing right now.

---

## A) Query-Time Signals

### A1. Top PostgREST targets by total execution time
(From `pg_stat_statements`, filtered to `WITH pgrst_source%`)

| Target | Calls | Total ms | % of PostgREST total | Avg mean ms |
|---|---:|---:|---:|---:|
| `auth_get_my_profile_v1` | 187 | 553.31 | 21.48% | 2.96 |
| `vehicle_lead_list_v1` | 50 | 345.97 | 13.43% | 6.92 |
| `admin_list_users_v1` | 64 | 251.59 | 9.77% | 3.93 |
| `vehicle_master_list_v1` | 16 | 199.43 | 7.74% | 12.46 |
| `vehicle_lead_move_stage_v1` | 15 | 198.79 | 7.72% | 17.23 |
| `rate_list_approved_v1` | 27 | 181.35 | 7.04% | 6.72 |
| `rate_list_review_v1` | 32 | 169.56 | 6.58% | 5.30 |
| `consigner_lead_list_v1` | 27 | 123.78 | 4.81% | 4.58 |
| `customer_list_v1` | 4 | 98.73 | 3.83% | 24.68 |
| `fleet_vehicle_list_v1` | 11 | 81.14 | 3.15% | 6.49 |

### A2. Plan checks run (`EXPLAIN ANALYZE`)
- `vehicle_lead_list_v1`: ~29.5 ms, `shared hit=909`, only 2 rows returned.
- `customer_list_v1`: ~26.6 ms, `shared hit=1429`, 0 rows returned.
- `rate_list_approved_v1`: ~8.8 ms, `shared hit=878`, 1 row returned.
- `consigner_lead_list_v1`: ~6.6 ms, `shared hit=661`, 1 row returned.

Interpretation: buffer hits are high relative to rows returned for some list RPCs, which indicates avoidable scanning/aggregation work per request.

---

## B) Structural Performance Findings

### B1. Missing foreign-key indexes
- Count: `41` FK constraints without a covering index.
- This impacts joins, deletes/updates on parent rows, and common lookup paths.
- Confirmed by both advisor and direct catalog query.

High-impact tables in active modules:
- `vehicle_leads` (`added_by_id`, `converted_vendor_id`)
- `vehicle_lead_activities` (`vehicle_lead_id`, `created_by_id`)
- `market_rates` (`submitted_by_id`, `reviewed_by_id`)
- `market_rate_comments` (`created_by_id`)
- `trips` (`vehicle_id`, `vendor_id`)
- `trip_owners` (owner foreign keys)
- `consigner_leads` / `consigner_lead_activities`

### B2. RLS initplan anti-pattern
- Count: `17` policies need optimization.
- Pattern seen: `auth.uid()` / `auth.*` used directly in row predicates.
- Recommended pattern: wrap with subquery for initplan caching, e.g. `(select auth.uid())`.

Example fix pattern:
```sql
-- Before
using (profiles.id = auth.uid())

-- After
using (profiles.id = (select auth.uid()))
```

---

## C) RPCs That Need Optimization First

### 1) `vehicle_lead_list_v1` (Highest ROI)
Why:
- High cumulative time and moderate per-call latency.
- Query has role-based OR + multiple `ILIKE` predicates + `ORDER BY created_at DESC`.

Current risk in function:
- Search predicates force wide scans as data grows.

Recommended changes:
- Add composite indexes for frequent filter/order patterns:
  - `(added_by_id, created_at DESC)`
  - `(stage, created_at DESC)`
  - `(vehicle_type, created_at DESC)`
- Add trigram search indexes for `ILIKE` fields (`driver_name`, `owner_name`, `mobile`, `vehicle_registration`) using `pg_trgm`.
- Consider splitting admin vs owner query path in function to reduce OR-branch planner compromise.

### 2) `customer_list_v1`
Why:
- Highest observed mean latency among key read RPCs.
- Computes full-table aggregates (`trips`, `receivables`) in CTEs before pagination.

Current risk in function:
- Work scales with total table size, not page size.

Recommended changes:
- Refactor to paginate customers first, then join LATERAL/aggregates for page rows.
- Add/verify supporting indexes:
  - `trips(customer_id, updated_at DESC)`
  - partial `trips(customer_id, updated_at DESC) WHERE current_stage <> 'closed'`
  - `receivables(customer_id, collected_status, updated_at DESC)`

### 3) `vehicle_master_list_v1`
Why:
- Non-trivial mean latency despite very small resultset.

Recommended changes:
- Keep as medium priority; likely acceptable now with current data volume.
- Re-check after RLS/auth policy fixes and FK indexing to confirm if latency drops naturally.

### 4) `rate_list_approved_v1` + `rate_list_review_v1`
Why:
- Regularly called list endpoints with text search + status filters.

Recommended changes:
- Add index strategy for list ordering/filtering:
  - `(status, created_at DESC)`
  - `(status, vehicle_type, rate_category, created_at DESC)`
- Add trigram indexes for searched text columns (`from_location`, `to_location`, optionally `source`, `vehicle_type` if needed).

---

## D) Suggested SQL Backlog (Phase 1)

```sql
-- Required for trigram search
create extension if not exists pg_trgm;

-- Vehicle leads list paths
create index if not exists idx_vehicle_leads_owner_created
  on public.vehicle_leads (added_by_id, created_at desc);
create index if not exists idx_vehicle_leads_stage_created
  on public.vehicle_leads (stage, created_at desc);
create index if not exists idx_vehicle_leads_type_created
  on public.vehicle_leads (vehicle_type, created_at desc);

create index if not exists idx_vehicle_leads_driver_trgm
  on public.vehicle_leads using gin (driver_name gin_trgm_ops);
create index if not exists idx_vehicle_leads_owner_name_trgm
  on public.vehicle_leads using gin (coalesce(owner_name, '') gin_trgm_ops);
create index if not exists idx_vehicle_leads_mobile_trgm
  on public.vehicle_leads using gin (mobile gin_trgm_ops);
create index if not exists idx_vehicle_leads_reg_trgm
  on public.vehicle_leads using gin (coalesce(vehicle_registration, '') gin_trgm_ops);

-- Customer list aggregate paths
create index if not exists idx_trips_customer_updated
  on public.trips (customer_id, updated_at desc);
create index if not exists idx_trips_customer_open_updated
  on public.trips (customer_id, updated_at desc)
  where current_stage <> 'closed';
create index if not exists idx_receivables_customer_status_updated
  on public.receivables (customer_id, collected_status, updated_at desc);

-- Rate list paths
create index if not exists idx_market_rates_status_created
  on public.market_rates (status, created_at desc);
create index if not exists idx_market_rates_status_type_category_created
  on public.market_rates (status, vehicle_type, rate_category, created_at desc);

create index if not exists idx_market_rates_from_trgm
  on public.market_rates using gin (from_location gin_trgm_ops);
create index if not exists idx_market_rates_to_trgm
  on public.market_rates using gin (to_location gin_trgm_ops);
```

Notes:
- Apply in phased migrations, verify with `EXPLAIN ANALYZE` after each phase.
- Keep or drop unused indexes only after observing sustained production usage windows.

---

## E) Non-RPC / Tooling Noise in Stats
Top global statements by total time are mostly management/metadata queries (timezone catalog, extension introspection, table privilege metadata). These are not user-facing app bottlenecks and should be excluded from product performance decisions.

---

## F) Recommended Next Sequence
1. Fix `41` missing FK indexes (highest structural risk).
2. Fix `17` RLS initplan policies (`auth.*` -> `(select auth.*)` pattern).
3. Optimize `vehicle_lead_list_v1` and `customer_list_v1` as above.
4. Re-run this audit after workload (same queries) and compare deltas.

---

## Reference Links
- Supabase DB linter: https://supabase.com/docs/guides/database/database-linter
- RLS function-call optimization: https://supabase.com/docs/guides/database/postgres/row-level-security#call-functions-with-select
- PostgreSQL `pg_stat_statements`: https://www.postgresql.org/docs/current/pgstatstatements.html
