# ERP → App Supabase Migration Plan

> **Goal**: Move the AiravatL ERP backend from its own Supabase project (`ueelrgqvgoogpmudculd`) into the App Supabase project (`nztujesupgmiclezsosg`), making the App DB the single source of truth for both the mobile apps and the admin ERP dashboard.

---

## 1. Current State Inventory

### 1.1 ERP Database (airavatErp — `ueelrgqvgoogpmudculd`)

| Metric | Count |
|---|---|
| Tables | 31 |
| Tables with RLS | 13 |
| RPCs (functions) | 140 |
| Enums | 32 |
| Triggers | 12 |
| Extensions (installed) | pgcrypto, uuid-ossp, pg_graphql, pg_stat_statements |
| Auth method | Email/password (`signInWithPassword`) |
| Auth users | 9 |
| Profile table | `profiles` (id, full_name, email, role, active) |
| Role enum | `role_type`: super_admin, admin, operations_consigner, operations_vehicles, sales_vehicles, sales_consigner, accounts, support |
| Storage | Cloudflare R2 via presign worker (no Supabase Storage buckets) |

**ERP Tables** (all in `public` schema):
```
profiles, customers, vendors, vehicles, leased_vehicle_policies,
trips, trip_owners, trip_stage_history, trip_proofs,
quote_versions, payment_requests, expense_entries,
odometer_checkpoints, receivables,
tickets, ticket_comments,
consigner_leads, consigner_lead_activities,
vehicle_leads, vehicle_lead_activities,
market_rates, market_rate_comments,
policy_settings, alerts, audit_logs,
vehicle_master_types, vehicle_master_type_lengths,
rate_requests, rate_request_quotes,
vendor_drivers, vehicle_driver_assignments
```

### 1.2 App Database (airavatlApp — `nztujesupgmiclezsosg`)

| Metric | Count |
|---|---|
| Tables | 35 |
| Tables with RLS | 35 (100%) |
| RPCs (functions) | 102 |
| Enums | 23 |
| Triggers | 21 |
| Extensions (installed) | pgcrypto, uuid-ossp, pg_graphql, pg_stat_statements, pg_net, http, postgis, pg_cron, supabase_vault |
| Auth method | Phone OTP (`signInWithOtp`) |
| Auth users | 10 |
| Profile table | `user_profiles` (id, user_type, full_name, phone, email, city, state, lat/lon, push_token, ...) |
| Role enum | `user_type_enum`: consigner, individual_driver, transporter, employee_driver |
| Storage | Cloudinary (external, no Supabase Storage buckets) |

**App Tables** (all in `public` schema):
```
user_profiles, consigners, individual_drivers, transporters,
employee_drivers, user_blocklist,
vehicles, individual_driver_vehicles, transporter_vehicles,
delivery_requests, delivery_request_stops, auction_bids,
auction_winner_selections, scheduled_bookings,
driver_locations, driver_availability, trip_location_history,
otp_logs, push_notification_queue, app_notifications,
vehicle_categories, vehicle_weight_segments,
vehicle_models, vehicle_segment_models,
trips, trip_payments, trip_documents, trip_proofs,
platform_settings, platform_earnings,
driver_deduction_settings, driver_payout_settings, driver_payouts,
trip_ratings, consigner_ratings
```

---

## 2. Conflict Analysis

### 2.1 Table Name Conflicts

| Table Name | ERP Schema | App Schema | Conflict Severity |
|---|---|---|---|
| `trips` | 13-stage ops lifecycle (request→closed), vendor-based | Auction-born trip (pending→completed), driver-based | **Critical** — completely different schemas |
| `trip_proofs` | POD/loading docs for ERP ops flow | Loading/unloading photos from Cloudinary | **Critical** — different schemas and semantics |
| `vehicles` | Vendor/leased fleet with master types | Driver/transporter fleet with body types | **High** — different ownership models |

### 2.2 Enum Name Conflicts

| Concept | ERP Enum | App Enum | Values Differ? |
|---|---|---|---|
| Payment method | `payment_method` (bank, upi) | `payment_method_enum` (razorpay, upi, card, netbanking, wallet) | **Yes** — different names AND values |
| Payment status | `payment_status` (pending, approved, on_hold, rejected, paid) | `payment_status_enum` (pending, processing, completed, failed, refunded) | **Yes** — different values |
| Payment type | `payment_type` (advance, balance, vendor_settlement, other) | `payment_type_enum` (advance, final, refund, penalty) | **Yes** — different values |
| Vehicle status | `vehicle_status` (available, on_trip, maintenance) | `vehicle_status_enum` (available, in_use, maintenance, inactive) | **Yes** — different values |
| Ownership type | `ownership_type` (leased, vendor) | `ownership_type_enum` (owned, leased, rented) | **Yes** — different values |
| Trip lifecycle | `trip_stage` (13 values) | `trip_status_enum` (10 values) | **Yes** — completely different lifecycles |

**No conflicts** (unique to each side):
- ERP-only enums (20): `role_type`, `lead_stage`, `vehicle_lead_stage`, `lead_activity_type`, `vehicle_lead_activity_type`, `lead_priority`, `lead_source`, `ticket_status`, `ticket_issue_type`, `ticket_source_type`, `rate_status`, `rate_category`, `rate_request_status`, `rate_request_quote_status`, `receivable_status`, `aging_bucket`, `doc_type`, `doc_status`, `checkpoint_type`, `expense_category`, `cap_status`, `approval_status`, `alert_type`, `alert_severity`, `kyc_status`, `route_terrain`
- App-only enums (14): `user_type_enum`, `account_type_enum`, `bid_status_enum`, `bid_rejection_reason_enum`, `body_type_enum`, `cargo_type_enum`, `delivery_request_status_enum`, `driver_type_enum`, `employment_status_enum`, `fuel_type_enum`, `notification_strategy_enum`, `owner_type_enum`, `request_type_enum`, `stop_type_enum`, `vehicle_type_enum`, `wheel_type_enum`, `cancelled_by_type_enum`

### 2.3 Profile / Auth Conflict

| Aspect | ERP | App |
|---|---|---|
| Profile table | `profiles` | `user_profiles` |
| Auth method | Email/password | Phone OTP |
| Role field | `role` (role_type enum) | `user_type` (user_type_enum) |
| Identifies | Admin/ops staff (9 users) | Consigners/drivers/transporters (10+ users) |
| Auth cookie | `@supabase/ssr` cookie-based | `@supabase/supabase-js` AsyncStorage |

**Key insight**: Both user pools will share `auth.users` but they are completely separate user types. An admin will never be a consigner and vice versa.

### 2.4 RPC Name Conflicts

ERP RPCs use a `_v1/_v2/_v3` versioning convention (e.g. `trip_list_v1`, `trip_detail_v2`). App RPCs use shorter names (e.g. `update_auction_request`, `get_nearby_drivers`). **No name collisions** exist today since ERP uses domain-prefixed names, but this must be verified at migration time.

### 2.5 Trigger Conflicts

Both databases have triggers on `trips` and `vehicles`. Since these are on **different** tables (ERP's `erp.trips` vs App's `public.trips` after schema separation), there is no conflict.

---

## 3. Migration Strategy: Selective Schema Separation + App Data Access

### 3.1 Core Principle: ERP = Admin Dashboard for the App

The ERP is not an isolated system — it is the **central admin panel** that:
1. **Monitors** all app data (users, trips, auctions, payments, drivers)
2. **Manages** app data directly (block users, adjust payments, configure platform settings)
3. **Has its own admin-only features** (CRM leads, market rates, internal tickets, reports)
4. **Will converge** with the app over time (ERP trips may replace/extend app trips, etc.)

This means **duplicating overlapping tables (trips, vehicles, payments) into a separate schema is wrong**. The ERP must work with the app's `public.*` tables directly for shared domain data, and only use an `erp` schema for admin-exclusive objects.

### 3.2 Two-Layer Approach

```
┌──────────────────────────────────────────────────────────┐
│                    App Database (airavatlApp)             │
│                                                          │
│  ┌─────────────────────┐    ┌──────────────────────────┐ │
│  │   public schema     │    │     erp schema           │ │
│  │   (App + Shared)    │    │   (Admin-Only Objects)   │ │
│  │                     │    │                          │ │
│  │  user_profiles      │    │  admin_profiles          │ │
│  │  consigners         │    │  consigner_leads         │ │
│  │  transporters       │    │  consigner_lead_acts     │ │
│  │  individual_drivers │    │  vehicle_leads           │ │
│  │  vehicles           │    │  vehicle_lead_acts       │ │
│  │  delivery_requests  │    │  market_rates            │ │
│  │  trips              │    │  market_rate_comments    │ │
│  │  trip_payments      │    │  rate_requests           │ │
│  │  trip_proofs        │    │  rate_request_quotes     │ │
│  │  driver_locations   │    │  tickets                 │ │
│  │  app_notifications  │    │  ticket_comments         │ │
│  │  platform_settings  │    │  audit_logs              │ │
│  │  ...35 app tables   │    │  policy_settings         │ │
│  │                     │    │  alerts                  │ │
│  └─────────────────────┘    │  vehicle_master_types    │ │
│                             │  vehicle_master_lengths  │ │
│          ▲  ▲               └──────────┬───────────────┘ │
│          │  │                          │                  │
│    App RPCs │    ERP RPCs read/write ──┘                  │
│   (public)  │    both schemas                            │
│             │    (erp.* with search_path = erp, public)  │
│     Mobile App                      ERP Dashboard        │
└──────────────────────────────────────────────────────────┘
```

**Layer 1 — `erp` schema (admin-exclusive):**
Tables, enums, RPCs, and triggers that exist ONLY for admin operations. The mobile app never touches these.

**Layer 2 — `public` schema (shared):**
App tables that the ERP reads/writes directly via cross-schema RPCs. ERP RPCs use `SET search_path = erp, public` to access both.

### 3.3 Table Classification

#### Tables that go into `erp` schema (admin-only — no app equivalent)

| ERP Table | Reason |
|---|---|
| `admin_profiles` (renamed from `profiles`) | Admin user roles, separate from `public.user_profiles` |
| `consigner_leads` + `consigner_lead_activities` | Sales CRM — admin only |
| `vehicle_leads` + `vehicle_lead_activities` | Sales CRM — admin only |
| `market_rates` + `market_rate_comments` | Rate library — admin only |
| `rate_requests` + `rate_request_quotes` | Rate requests — admin only |
| `tickets` + `ticket_comments` | Internal support tickets |
| `audit_logs` | Admin audit trail |
| `policy_settings` | Internal policy config |
| `alerts` | Admin alerts |
| `vehicle_master_types` + `vehicle_master_type_lengths` | Master data managed by admin |

**Total: ~16 tables in `erp` schema**

#### Tables that DO NOT migrate (overlapping — ERP uses app tables directly)

| Current ERP Table | App Equivalent | Strategy |
|---|---|---|
| `trips` (13-stage) | `public.trips` (10-stage) | **Evolve** `public.trips` to support ERP's richer lifecycle. Or add `erp.trip_extensions` for ERP-specific columns. |
| `trip_owners` | No equivalent | Add to `public` or `erp` as needed when trips converge |
| `trip_stage_history` | No equivalent | Add to `public` as trips converge |
| `trip_proofs` | `public.trip_proofs` | **Use app table** — extend schema if ERP needs extra fields |
| `vehicles` | `public.vehicles` | **Use app table** — ERP reads/writes app vehicles with admin RPCs |
| `customers` | `public.consigners` | **Use app table** — consigners ARE customers |
| `vendors` | `public.transporters` | **Use app table** — transporters ARE vendors |
| `vendor_drivers` | Maps to transporter employee_drivers | **Use app table** |
| `vehicle_driver_assignments` | `public.transporter_vehicles` | **Use app table** |
| `payment_requests` | `public.trip_payments` | **Use app table** — extend if needed for approval workflow |
| `leased_vehicle_policies` | No equivalent | Add to `erp` or extend `public.vehicles` |
| `quote_versions` | No equivalent (unused, 0 rows) | Skip — build fresh when needed |
| `expense_entries` | No equivalent (unused, 0 rows) | Skip — build fresh when needed |
| `odometer_checkpoints` | No equivalent (unused, 0 rows) | Skip — build fresh when needed |
| `receivables` | No equivalent (unused, 0 rows) | Skip — build fresh when needed |

#### Enums — Only admin-exclusive enums go into `erp` schema

**Migrate to `erp`** (no app equivalent):
`role_type`, `lead_stage`, `vehicle_lead_stage`, `lead_activity_type`, `vehicle_lead_activity_type`, `lead_priority`, `lead_source`, `ticket_status`, `ticket_issue_type`, `ticket_source_type`, `rate_status`, `rate_category`, `rate_request_status`, `rate_request_quote_status`, `alert_type`, `alert_severity`, `route_terrain`

**DO NOT migrate** (overlapping — handled by evolving app enums):
`trip_stage`, `payment_method`, `payment_status`, `payment_type`, `vehicle_status`, `ownership_type`, `doc_type`, `doc_status`, `expense_category`, `checkpoint_type`, `cap_status`, `approval_status`, `kyc_status`, `receivable_status`, `aging_bucket`

### 3.4 How ERP Accesses App Data

ERP RPCs live in `erp` schema but read/write `public.*` tables directly:

```sql
-- Example: Admin lists all app users with filters
CREATE OR REPLACE FUNCTION erp.admin_list_app_users_v1(
  p_actor_user_id uuid,
  p_user_type text DEFAULT NULL,
  p_search text DEFAULT NULL,
  p_limit int DEFAULT 50
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = erp, public  -- Access both schemas
AS $$
DECLARE
  v_role erp.admin_role_type;
BEGIN
  -- Auth check against erp.admin_profiles
  SELECT role INTO v_role FROM erp.admin_profiles
  WHERE id = p_actor_user_id AND active;
  IF NOT FOUND THEN RAISE EXCEPTION 'forbidden'; END IF;

  -- Query app's public.user_profiles directly
  RETURN (
    SELECT jsonb_agg(row_to_json(u))
    FROM (
      SELECT *
      FROM public.user_profiles
      WHERE (p_user_type IS NULL OR user_type::text = p_user_type)
        AND (p_search IS NULL OR full_name ILIKE '%' || p_search || '%')
      ORDER BY created_at DESC
      LIMIT p_limit
    ) u
  );
END;
$$;
```

```sql
-- Example: Admin views live driver locations
CREATE OR REPLACE FUNCTION erp.admin_driver_locations_v1(p_actor_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = erp, public
AS $$
BEGIN
  PERFORM 1 FROM erp.admin_profiles
  WHERE id = p_actor_user_id AND active AND role IN ('admin', 'super_admin', 'operations_vehicles');
  IF NOT FOUND THEN RAISE EXCEPTION 'forbidden'; END IF;

  RETURN (
    SELECT jsonb_agg(jsonb_build_object(
      'driverId', dl.driver_id,
      'driverName', up.full_name,
      'latitude', dl.latitude,
      'longitude', dl.longitude,
      'lastSeen', dl.updated_at
    ))
    FROM public.driver_locations dl
    JOIN public.user_profiles up ON up.id = dl.driver_id
  );
END;
$$;
```

### 3.5 Supabase PostgREST Schema Exposure

Supabase PostgREST must expose both schemas:

```sql
ALTER ROLE authenticator SET pgrst.db_schemas = 'public, erp';
NOTIFY pgrst, 'reload config';
```

The ERP Next.js client uses `db: { schema: 'erp' }` so `.rpc()` calls target `erp.*` functions. The functions themselves access `public.*` tables internally via `search_path`.

```typescript
// ERP's supabase client
const supabase = createClient(url, key, {
  db: { schema: 'erp' }
});

// Calls erp.admin_list_app_users_v1 which internally reads public.user_profiles
const { data } = await supabase.rpc('admin_list_app_users_v1', { ... });
```

### 3.6 Admin Auth Coexistence

Both ERP admins and app users share `auth.users`, but profiles are separate:

| Aspect | App Users | ERP Admins |
|---|---|---|
| Auth method | Phone OTP | Email/password |
| Profile table | `public.user_profiles` | `erp.admin_profiles` |
| Role field | `user_type` (user_type_enum) | `role` (erp.admin_role_type) |
| Session storage | AsyncStorage (Expo) | Cookies (@supabase/ssr) |
| Sign-up | Phone OTP → public.user_profiles | Service role → erp.admin_profiles |

Sessions are completely isolated — different client environments, different auth methods.

### 3.7 Admin Access to `public.*` Tables: SECURITY DEFINER RPCs Only

All ERP RPCs that read/write `public.*` app tables use `SECURITY DEFINER`. This means the
function runs with the owner's permissions (`postgres`), bypassing RLS on both schemas. The
RPC body performs its own admin role check against `erp.admin_profiles` before accessing data.

```sql
-- Every cross-schema admin RPC follows this pattern:
CREATE OR REPLACE FUNCTION erp.admin_some_action_v1(p_actor_user_id uuid, ...)
RETURNS jsonb LANGUAGE plpgsql
SECURITY DEFINER SET search_path = erp, public
AS $$
BEGIN
  -- Step 1: Verify caller is an active admin
  PERFORM 1 FROM erp.admin_profiles
  WHERE id = p_actor_user_id AND active
    AND role IN ('admin', 'super_admin', ...);
  IF NOT FOUND THEN RAISE EXCEPTION 'forbidden'; END IF;

  -- Step 2: Access public.* tables freely (SECURITY DEFINER bypasses RLS)
  RETURN (SELECT ... FROM public.user_profiles WHERE ...);
END;
$$;
```

**No cross-schema RLS policies are added to `public.*` tables.** The ERP never uses `.from()`
direct queries on app tables — all access goes through admin RPCs with internal role checks.
This keeps the app's RLS policies clean and prevents app users from accidentally gaining
admin-level access.

---

## 4. Migration Phases

### Phase 0: Pre-Migration Prep (ERP Codebase)

**Goal**: Prepare the ERP codebase to point at the App Supabase project.

#### 0.1 Update Environment Variables

```env
# .env.local — change to App project values
NEXT_PUBLIC_SUPABASE_URL=https://nztujesupgmiclezsosg.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<app-project-anon-key>
SUPABASE_SERVICE_ROLE_KEY=<app-project-service-role-key>

# R2 worker stays unchanged (external to Supabase)
R2_PRESIGN_WORKER_URL=<unchanged>
```

#### 0.2 Update Supabase Clients to Use `erp` Schema

| File | Change |
|---|---|
| `src/lib/supabase/client.ts` | Add `db: { schema: 'erp' }` |
| `src/lib/supabase/server.ts` | Add `db: { schema: 'erp' }` |
| `src/lib/supabase/admin.ts` | Add `db: { schema: 'erp' }` |
| `src/lib/supabase/middleware.ts` | No change (auth only) |
| `src/lib/supabase/rpc.ts` | No change |

#### 0.3 Eliminate Direct `.from()` Queries

Convert the 3 files using `.from("profiles")` to use RPCs:
- `src/app/api/consigner-crm/_shared.ts` (line ~136)
- `src/app/api/vendors/route.ts` (line ~24)
- `src/app/api/leased-vehicles/_shared.ts` (line ~121)

#### 0.4 Temporary Mock Data Fallback

If the migration needs to be incremental:
- Keep `src/lib/mock-data/` intact
- Add `NEXT_PUBLIC_USE_MOCK=true` feature flag
- Supabase calls short-circuit to mock data when flag is set

---

### Phase 1: Create `erp` Schema in App Database

**Goal**: Set up admin-exclusive objects only.

#### 1.1 Schema + PostgREST Config

```sql
CREATE SCHEMA IF NOT EXISTS erp;

-- Minimal grants: only service_role gets broad access.
-- anon gets nothing (no public API surface for erp).
-- authenticated gets USAGE on schema + EXECUTE on functions only
-- (all data access goes through SECURITY DEFINER RPCs, not direct table reads).
GRANT USAGE ON SCHEMA erp TO authenticated, service_role;
GRANT ALL ON ALL TABLES IN SCHEMA erp TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA erp TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA erp GRANT ALL ON TABLES TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA erp GRANT ALL ON SEQUENCES TO service_role;

-- authenticated can only call RPCs, not read tables directly.
-- Each RPC uses SECURITY DEFINER and does its own role check.
ALTER DEFAULT PRIVILEGES IN SCHEMA erp GRANT EXECUTE ON FUNCTIONS TO authenticated;

ALTER ROLE authenticator SET pgrst.db_schemas = 'public, erp';
NOTIFY pgrst, 'reload config';
```

**Why minimal grants**: The mobile app and ERP share the same Supabase project. An app user
(phone OTP, `authenticated` role) must NOT be able to read `erp.admin_profiles` or any admin
tables directly. By granting only `EXECUTE` on functions, all data access goes through
`SECURITY DEFINER` RPCs that verify the caller is an admin before returning data. The `anon`
role gets zero access to the `erp` schema.

#### 1.2 Admin-Only Enums (~17 enums)

```sql
CREATE TYPE erp.admin_role_type AS ENUM (
  'super_admin', 'admin', 'operations_consigner', 'operations_vehicles',
  'sales_vehicles', 'sales_consigner', 'accounts', 'support'
);
CREATE TYPE erp.lead_stage AS ENUM ('new_enquiry', 'contacted', 'quote_sent', 'negotiation', 'won', 'lost');
CREATE TYPE erp.vehicle_lead_stage AS ENUM ('new_entry', 'contacted', 'docs_pending', 'verified', 'onboarded', 'rejected');
CREATE TYPE erp.ticket_status AS ENUM ('open', 'in_progress', 'waiting', 'resolved');
-- ... other admin-exclusive enums
```

#### 1.3 Admin-Only Tables (~16 tables)

```sql
CREATE TABLE erp.admin_profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name text NOT NULL,
  email text NOT NULL,
  role erp.admin_role_type NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE erp.consigner_leads (...);
CREATE TABLE erp.vehicle_leads (...);
CREATE TABLE erp.market_rates (...);
CREATE TABLE erp.tickets (...);
CREATE TABLE erp.audit_logs (...);
-- ... ~16 admin-exclusive tables
```

#### 1.4 RLS on All `erp` Tables

```sql
ALTER TABLE erp.admin_profiles ENABLE ROW LEVEL SECURITY;
-- ... all erp tables

CREATE POLICY "service_role_all" ON erp.admin_profiles
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "admin_read_own_profile" ON erp.admin_profiles
  FOR SELECT TO authenticated USING (id = auth.uid());
```

#### 1.5 Admin-Only Triggers

```sql
CREATE OR REPLACE FUNCTION erp.set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;
-- ... triggers for erp tables only
```

#### 1.6 ERP RPCs (Two Types)

**Type A — Pure admin RPCs** (work with `erp.*` tables only):
```sql
-- CRM, rates, tickets, admin user management
CREATE OR REPLACE FUNCTION erp.consigner_lead_list_v1(p_actor uuid, ...)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = erp
AS $$ ... $$;
```

**Type B — Cross-schema admin RPCs** (read/write `public.*` app data):
```sql
-- Monitor app users, trips, payments, drivers
CREATE OR REPLACE FUNCTION erp.admin_list_app_trips_v1(p_actor uuid, ...)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = erp, public
AS $$
  -- Auth check against erp.admin_profiles
  -- Query public.trips, public.trip_payments, etc.
$$;
```

These Type B RPCs are the **core of the admin dashboard** — they are built NEW to work with app tables, not migrated from the old ERP.

---

### Phase 2: Seed Admin Users

**Goal**: Create admin users in App project's `auth.users`.

Since this is a fresh start with only 9 admin users:
1. Create each admin user via Supabase Dashboard or service_role API (email/password)
2. Insert corresponding rows in `erp.admin_profiles` with role assignments
3. Verify login works from ERP dashboard

---

### Phase 3: ERP Codebase Reconfiguration

**Goal**: Point ERP at App Supabase project.

#### 3.1 Switch env vars (Phase 0.1)
#### 3.2 Switch schema config (Phase 0.2)
#### 3.3 Update MCP config

```json
{
  "mcpServers": {
    "airavatlApp": {
      "type": "http",
      "url": "https://mcp.supabase.com/mcp?project_ref=nztujesupgmiclezsosg"
    }
  }
}
```

---

### Phase 4: Rebuild ERP Features Incrementally

**This is the key phase.** Since most ERP features will change, we DO NOT migrate all 140 old RPCs. Instead:

#### 4.1 Immediate — Admin-Only Features (migrate as-is)

These have no overlap with the app and can be migrated directly into `erp` schema:

| Feature | RPCs | Tables |
|---|---|---|
| Admin auth & user management | `auth_get_my_profile_v1`, `admin_list_users_v1`, `admin_upsert_profile_v1` | `erp.admin_profiles` |
| Consigner CRM | `consigner_lead_*` (14 RPCs) | `erp.consigner_leads`, `erp.consigner_lead_activities` |
| Vehicle CRM | `vehicle_lead_*` (9 RPCs) | `erp.vehicle_leads`, `erp.vehicle_lead_activities` |
| Market Rates | `rate_*` (11 RPCs) | `erp.market_rates`, `erp.market_rate_comments` |
| Rate Requests | `rate_request_*` (6 RPCs) | `erp.rate_requests`, `erp.rate_request_quotes` |
| Tickets | `ticket_*` (3 RPCs) | `erp.tickets`, `erp.ticket_comments` |
| Vehicle Master | `vehicle_master_*` (7 RPCs) | `erp.vehicle_master_types`, `erp.vehicle_master_type_lengths` |

**~50 RPCs can be migrated directly** (adapted for `erp` schema references).

#### 4.2 Build New — App Data Admin RPCs

These are built fresh to work with `public.*` app tables:

| Dashboard Feature | New RPCs to Build | App Tables Accessed |
|---|---|---|
| **User Management** | `admin_list_app_users_v1`, `admin_block_user_v1`, `admin_verify_user_v1` | `public.user_profiles`, `public.consigners`, `public.transporters`, `public.individual_drivers` |
| **Trip Dashboard** | `admin_list_app_trips_v1`, `admin_trip_detail_v1` | `public.trips`, `public.trip_payments`, `public.trip_proofs` |
| **Auction Monitor** | `admin_list_auctions_v1`, `admin_auction_detail_v1` | `public.delivery_requests`, `public.auction_bids`, `public.auction_winner_selections` |
| **Payment Monitor** | `admin_list_payments_v1`, `admin_adjust_payment_v1` | `public.trip_payments`, `public.platform_earnings` |
| **Driver Monitor** | `admin_driver_locations_v1`, `admin_driver_payouts_v1` | `public.driver_locations`, `public.driver_availability`, `public.driver_payouts` |
| **Platform Config** | `admin_update_platform_settings_v1` | `public.platform_settings`, `public.driver_deduction_settings` |
| **Notifications** | `admin_send_notification_v1` | `public.push_notification_queue`, `public.app_notifications` |
| **Reports** | `admin_report_overview_v1`, `admin_report_revenue_v1` | Aggregates across multiple public tables |

#### 4.3 Defer — Features That Will Change

Do NOT migrate these old ERP RPCs. They'll be redesigned when features converge:

| Old ERP Feature | Why Defer |
|---|---|
| Trip lifecycle (30 RPCs) | ERP's 13-stage trip will merge with app's trip flow — completely new design needed |
| Payment requests (7 RPCs) | Payment workflow will integrate with Razorpay (app's payment system) |
| Fleet management (5 RPCs) | Vehicles/vendors will merge with app's vehicle/transporter system |
| Leased vehicles (18 RPCs) | Will be redesigned around app's vehicle ownership model |
| Reports (7 RPCs) | Will query app tables directly — new RPCs needed |
| Customer module (5 RPCs) | ERP customers = app consigners — no separate table |
| Vendor module (10 RPCs) | ERP vendors = app transporters — no separate table |

---

### Phase 5: Verification & Cutover

#### 5.1 Build Verification

```bash
pnpm build  # Must pass with zero errors
```

#### 5.2 Smoke Tests

| Test | Expected |
|---|---|
| Admin login (email/password) | Profile loaded from `erp.admin_profiles` |
| CRM boards | Loads from `erp.consigner_leads` / `erp.vehicle_leads` |
| Market rates | Loads from `erp.market_rates` |
| Tickets | Loads from `erp.tickets` |
| **App users list** | Reads `public.user_profiles` via admin RPC |
| **App trips list** | Reads `public.trips` via admin RPC |
| **Live driver map** | Reads `public.driver_locations` via admin RPC |

#### 5.3 App Regression Check

- Phone OTP login → `public.user_profiles` unaffected
- Auction flow → `public.delivery_requests` unaffected
- Trip flow → `public.trips` unaffected
- No cross-contamination

#### 5.4 Cutover Checklist

- [ ] `erp` schema created with PostgREST config
- [ ] Admin-only tables, enums, triggers created in `erp`
- [ ] Admin RPCs created (both pure admin and cross-schema)
- [ ] Admin users created in `auth.users` + `erp.admin_profiles`
- [ ] ERP env vars point to App project
- [ ] ERP clients use `db: { schema: 'erp' }`
- [ ] `pnpm build` passes
- [ ] All smoke tests pass
- [ ] Mobile apps verified unaffected
- [ ] Old ERP project deprecated (keep 30 days)

---

## 5. Feature Convergence Roadmap

As the ERP becomes the central admin dashboard, features will converge in waves:

### Wave 1 — Monitor (Read-only admin views)
ERP dashboard shows app data without modifying it:
- View all users, trips, auctions, payments
- Live driver location map
- Revenue/analytics dashboards
- No changes to app tables or RPCs

### Wave 2 — Manage (Admin write operations)
ERP gains ability to modify app data:
- Block/unblock users
- Cancel/adjust trips and payments
- Configure platform settings (commission, GST)
- Send push notifications to app users
- All writes go through new SECURITY DEFINER RPCs in `erp` schema with internal admin role checks (no new RLS policies on `public.*` tables)

### Wave 3 — Integrate (Shared workflows)
ERP and app workflows become interconnected:
- CRM lead conversion creates `public.consigners` directly (not separate `erp.customers`)
- ERP-originated trips flow into the same `public.trips` the app uses
- Payment approvals in ERP trigger Razorpay payouts in the app
- ERP ticketing linked to app trip events
- May require modifying app tables (adding columns, extending enums)

### Wave 4 — Unify (Single source of truth)
All overlapping concepts merged:
- One vehicle table, one trip lifecycle, one payment system
- ERP adds admin-specific views/RPCs on top of shared tables
- Legacy ERP-only tables phased out as app tables absorb their functionality

---

## 6. Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| PostgREST schema config fails | Low | High | Test with simple query before full migration |
| cross-schema RPC search_path issues | Medium | High | Always explicit: `SET search_path = erp, public` |
| App regression from shared auth.users | Low | High | Different auth methods (phone vs email) — no overlap |
| RLS gaps when admin accesses public tables | Medium | Medium | Use SECURITY DEFINER RPCs, not direct `.from()` |
| Feature churn wastes migration effort | High | Medium | Only migrate admin-exclusive features; defer the rest |
| Performance impact on App DB | Low | Low | Minimal admin traffic; 9 users |
| App table schema changes break admin RPCs | Medium | Medium | Version admin RPCs (v1/v2); test after app deploys |

---

## 7. Execution Timeline

### Critical constraint: no broken pages at deploy

The current ERP has live routes that call old RPCs which won't exist in the new database
(e.g., `trip_list_v1` on `erp.trips`, `customer_list_v1` on `erp.customers`). If we deploy
before handling these, pages like Trips, Customers, Vendors, Payments will break.

**Two options** (choose one before starting):

**Option A — Gate unmigrated modules** (recommended for speed):
Before deploy, hide modules whose RPCs aren't migrated yet behind a feature flag or
navigation gate. The sidebar hides those sections; the API routes return early with a
"module not available" response. This lets us deploy quickly with working admin-only
features (CRM, Rates, Tickets) while deferred modules are built incrementally.

**Option B — Build all replacement RPCs before deploy**:
Build cross-schema admin RPCs for every live route before switching env vars. This means
Trips, Customers, Vendors, Fleet, Payments all work on day one but delays the deploy
significantly.

### Timeline

| Step | Description | Dependencies |
|---|---|---|
| **P0** | Prep ERP codebase (env vars, schema config) | None |
| **P1.1** | Create `erp` schema + PostgREST config (minimal grants) | None |
| **P1.2** | Create admin-only enums (~17) | P1.1 |
| **P1.3** | Create admin-only tables (~16) | P1.2 |
| **P1.4** | RLS + policies on erp tables | P1.3 |
| **P1.5** | Triggers on erp tables | P1.3 |
| **P1.6a** | Migrate admin-only RPCs (~50: CRM, rates, tickets, master) | P1.2, P1.3 |
| **P1.6b** | Build cross-schema admin RPCs for live routes OR gate those modules | P1.3 |
| **P2** | Seed admin users in auth.users + erp.admin_profiles | P1.3 |
| **P3** | Verification: `pnpm build` passes, smoke tests on all accessible pages | P1.6a, P1.6b, P2 |
| **P4** | Switch ERP env vars + deploy | P3 |
| **P5** | Incrementally build remaining admin RPCs (Waves 1-4) | P4 |

**Key difference from before**: P3 (verification) happens BEFORE deploy (P4), and P1.6b
explicitly requires either building replacement RPCs or gating those modules. No deploy
happens with broken pages.

**Live routes that need replacement RPCs OR gating** (if using Option A, these are gated):

| Route | Old RPC | Status |
|---|---|---|
| `src/app/api/trips/route.ts` | `trip_list_active_v2`, `trip_list_history_v2` | Needs replacement or gate |
| `src/app/api/trips/[tripId]/route.ts` | `trip_get_v2` | Needs replacement or gate |
| `src/app/api/customers/route.ts` | `customer_list_v1` | Needs replacement or gate |
| `src/app/api/fleet/vendors/route.ts` | `vendor_list_v3` | Needs replacement or gate |
| `src/app/api/payments/queue/route.ts` | `trip_payment_queue_list_v1` | Needs replacement or gate |
| `src/app/api/fleet/vehicles/route.ts` | `fleet_vehicle_list_v1` | Needs replacement or gate |
| `src/app/api/leased-vehicles/route.ts` | `leased_vehicle_list_v3` | Needs replacement or gate |
| `src/app/api/reports/*/route.ts` | `report_*_v1` | Needs replacement or gate |

**Admin-only routes that migrate directly** (work on day one):

| Route | RPCs | Tables |
|---|---|---|
| `src/app/api/consigner-crm/*` | `consigner_lead_*` | `erp.consigner_leads` |
| `src/app/api/vehicle-crm/*` | `vehicle_lead_*` | `erp.vehicle_leads` |
| `src/app/api/rates/*` | `rate_*` | `erp.market_rates` |
| `src/app/api/rate-requests/*` | `rate_request_*` | `erp.rate_requests` |
| `src/app/api/tickets/*` | `ticket_*` | `erp.tickets` |
| `src/app/api/vehicle-master/*` | `vehicle_master_*` | `erp.vehicle_master_types` |
| `src/app/api/admin/*` | `admin_*` | `erp.admin_profiles` |
| `src/app/api/auth/*` | `auth_get_my_profile_v1` | `erp.admin_profiles` |

**Estimated migrations**: ~4-5 SQL migrations (schema+enums, tables+RLS, triggers, admin RPCs)
**Old RPCs to migrate**: ~50 (admin-exclusive, adapted for erp schema)
**Old RPCs to discard/defer**: ~90 (will be redesigned as features converge)
**New RPCs to build post-deploy**: ~15-20 cross-schema admin RPCs (Waves 1-4)

---

## 8. Recommended Approach: Selective Fresh Start + Module Gating

Given that:
1. Most ERP features will change
2. The ERP will be the admin dashboard for the app
3. Mock data fallback is acceptable initially
4. Only 9 admin users, tiny data volumes

**Recommendation** (Option A from Section 7):

1. Create `erp` schema with admin-only objects (Phase 1) — ~16 tables, ~17 enums, minimal grants
2. Migrate only admin-exclusive RPCs (~50) — CRM, rates, tickets, master data
3. **Gate unmigrated modules** — hide Trips, Customers, Vendors, Fleet, Payments, Reports from sidebar navigation; API routes for those modules return `{ ok: false, message: "Module migrating" }` with 503
4. Seed admin users, verify `pnpm build` and smoke tests pass (Phases 2-3)
5. **Deploy** — ERP works with CRM, Rates, Tickets, Vehicle Master, Admin on day one
6. Incrementally ungate modules as cross-schema admin RPCs are built (Waves 1-4)
7. **Do NOT migrate** trip/payment/vehicle/customer RPCs — they'll be redesigned to work with `public.*` app tables

This avoids wasted effort on features that will change, prevents broken pages at deploy, and gets the admin dashboard operational quickly with a clear path to full app integration.
