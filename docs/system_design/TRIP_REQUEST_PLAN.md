# AiravatL ERP — Trip Request Module Plan

Version: 1.0
Date: February 26, 2026

---

## 1. Scope

Replace the existing mock "New Trip" form with a **Trip Request** workflow. Consigner sales reps create trip requests; consigner ops accept them and auto-become the ops owner. Until a request is accepted, the sales rep can edit it.

Work items:
1. Add new columns to `trips` table (`trip_amount`, `requested_by_id`).
2. Create RPCs for trip CRUD, acceptance, and listing.
3. Create API routes for trip requests.
4. Wire existing frontend pages to live data with role-based behaviour.
5. Add RLS policies on `trips`, `trip_owners`, `trip_stage_history`.

---

## 2. Current State

### 2.1 Database (already exists)

**`trips`** — 19 columns

| Column | Type | Notes |
|---|---|---|
| id | uuid PK | `gen_random_uuid()` |
| trip_code | text NOT NULL UNIQUE | e.g., `AL-2602-001` |
| customer_id | uuid FK → customers | NOT NULL |
| current_stage | trip_stage | default `request_received` |
| leased_flag | boolean | default `false` |
| pickup_location | text | nullable |
| drop_location | text | nullable |
| route | text | nullable (computed: pickup - drop) |
| vehicle_type | text | nullable |
| weight_estimate | numeric | nullable |
| planned_km | integer | nullable |
| schedule_date | date | nullable |
| vehicle_id | uuid FK → vehicles | nullable |
| vehicle_number | text | nullable |
| driver_name | text | nullable |
| vendor_id | uuid FK → vendors | nullable |
| internal_notes | text | nullable |
| created_at | timestamptz | `now()` |
| updated_at | timestamptz | `now()` |

**`trip_owners`** — 9 columns (separate 1:1 table for owner assignments)

| Column | Type | Notes |
|---|---|---|
| id | uuid PK | `gen_random_uuid()` |
| trip_id | uuid FK → trips | NOT NULL |
| sales_consigner_owner_id | uuid FK → profiles | nullable |
| sales_vehicles_owner_id | uuid FK → profiles | nullable |
| operations_consigner_owner_id | uuid FK → profiles | nullable |
| operations_vehicles_owner_id | uuid FK → profiles | nullable |
| accounts_owner_id | uuid FK → profiles | nullable |
| created_at | timestamptz | `now()` |
| updated_at | timestamptz | `now()` |

**`trip_stage_history`** — 7 columns

| Column | Type | Notes |
|---|---|---|
| id | uuid PK | `gen_random_uuid()` |
| trip_id | uuid FK → trips | NOT NULL |
| from_stage | trip_stage | nullable (null for initial) |
| to_stage | trip_stage | NOT NULL |
| actor_id | uuid FK → profiles | NOT NULL |
| notes | text | nullable |
| created_at | timestamptz | `now()` |

**`trip_stage` enum** — 13 values:
`request_received` → `quoted` → `confirmed` → `vehicle_assigned` → `at_loading` → `loaded_docs_ok` → `advance_paid` → `in_transit` → `delivered` → `pod_soft_received` → `vendor_settled` → `customer_collected` → `closed`

**Indexes:**
- `trips_pkey` (id)
- `trips_trip_code_key` UNIQUE (trip_code)
- `idx_trips_customer_stage_updated` (customer_id, current_stage, updated_at DESC)

**RLS:** Not enabled on trips, trip_owners, or trip_stage_history.

**Existing RPCs:** Only `customer_trip_history_v1` (read trips from customer context). No trip CRUD RPCs exist.

### 2.2 Frontend (already exists, mock data)

```
src/app/(app)/trips/
├── page.tsx            ← Trips list (mock data, table + mobile cards)
├── new/page.tsx        ← Create trip form (mock data, no submit logic)
└── [tripId]/
    ├── page.tsx        ← Trip detail with tabs
    ├── overview-tab.tsx
    ├── quote-tab.tsx
    ├── docs-tab.tsx
    ├── payments-tab.tsx
    ├── expenses-tab.tsx
    ├── checkpoints-tab.tsx
    ├── tickets-tab.tsx
    └── timeline-tab.tsx
```

### 2.3 Trip Interface (frontend type)

```typescript
export interface Trip {
  id: string;
  tripCode: string;
  customerId: string;
  customerName: string;
  pickupLocation: string;
  dropLocation: string;
  route: string;
  currentStage: TripStage;
  leasedFlag: boolean;
  vehicleType: string;
  weightEstimate: number;
  plannedKm: number;
  scheduleDate: string;
  salesOwnerId: string;
  salesOwnerName: string;
  opsOwnerId: string;
  opsOwnerName: string;
  accountsOwnerId: string;
  accountsOwnerName: string;
  vehicleNumber: string | null;
  driverName: string | null;
  createdAt: string;
  updatedAt: string;
  internalNotes: string;
}
```

---

## 3. Requirements

### 3.1 Role Behaviour Matrix

| Action | sales_consigner | operations_consigner | admin / super_admin |
|---|---|---|---|
| Create trip request | Own customers only | Any customer | Any customer |
| View trips list | Own trips only (where `sales_consigner_owner_id = self`) | All trips | All trips |
| View trip detail | Own trips only (read-only) | All trips (full access) | All trips (full access) |
| Edit trip request | Own trips, only while `current_stage = request_received` | No (accept instead) | Yes, any stage |
| Accept trip request | No | Yes — auto-becomes ops owner | Yes |
| Advance trip stage | No | Yes (all stage transitions) | Yes |
| Manage trip (assign vehicle, docs, payments) | No | Yes | Yes |

### 3.2 New & Changed Fields

**New DB columns on `trips`:**

| Column | Type | Notes |
|---|---|---|
| trip_amount | numeric | nullable, the quoted trip amount entered by sales |
| requested_by_id | uuid FK → profiles | NOT NULL, the user who created the request |

**New field on Trip interface:**
- `tripAmount: number | null` — Trip amount entered by sales
- `requestedById: string` — User who created the request
- `requestedByName: string` — Display name of requester

### 3.3 Trip Request Flow

```
┌──────────────┐       ┌──────────────────┐       ┌───────────────────┐
│ Sales creates │──────►│ request_received  │──────►│ Ops accepts       │
│ trip request  │       │ (editable by      │       │ (auto-becomes     │
│               │       │  sales creator)   │       │  ops owner, stage │
│               │       │                   │       │  → quoted)        │
└──────────────┘       └──────────────────┘       └───────────────────┘
```

1. **Create**: `sales_consigner` fills out the trip request form (customer, pickup, drop, vehicle type, weight, planned km, schedule date, trip amount, internal notes). No ops owner field — it's assigned on accept.
2. **Edit**: While `current_stage = request_received`, the requesting sales user can edit all request fields.
3. **Accept**: `operations_consigner` views the request and clicks "Accept". This:
   - Sets `trip_owners.operations_consigner_owner_id = accepting_user.id`
   - Moves stage from `request_received` → `quoted`
   - Logs stage change in `trip_stage_history`
4. **Post-accept**: Normal trip lifecycle continues. Sales can only view, not edit.

### 3.4 Trip Code Generation

Auto-generated on creation: `AL-{DDMM}-{NNN}` where:
- `DDMM` = day and month of creation
- `NNN` = zero-padded daily sequence number

Example: `AL-2602-003` (3rd trip on Feb 26)

Implementation: Use a Postgres sequence or counter within the RPC.

---

## 4. Implementation Phases

### Phase 1: Database Migrations (3 migrations via Supabase MCP)

#### Migration 1: `trip_request_schema`

```sql
-- Add new columns to trips
ALTER TABLE trips ADD COLUMN trip_amount numeric;
ALTER TABLE trips ADD COLUMN requested_by_id uuid REFERENCES profiles(id);

-- Index for sales_consigner filtering (own trips via trip_owners)
CREATE INDEX idx_trip_owners_sales_consigner ON trip_owners(sales_consigner_owner_id)
  WHERE sales_consigner_owner_id IS NOT NULL;

-- Index for ops consigner filtering
CREATE INDEX idx_trip_owners_ops_consigner ON trip_owners(operations_consigner_owner_id)
  WHERE operations_consigner_owner_id IS NOT NULL;

-- Index for requested_by lookup
CREATE INDEX idx_trips_requested_by ON trips(requested_by_id);
```

#### Migration 2: `trip_request_rpcs`

**1. `trip_assert_actor_v1(p_actor_user_id uuid)`**
- SECURITY DEFINER, SET search_path = public
- Validates user exists in profiles, is active
- Returns role
- Raises `actor_not_found` or `actor_inactive`

**2. `trip_generate_code_v1()`**
- SECURITY DEFINER
- Generates trip code `AL-DDMM-NNN`
- Uses `SELECT count(*) + 1 FROM trips WHERE created_at::date = CURRENT_DATE` for sequence
- Returns text

**3. `trip_request_create_v1(p_actor_user_id, p_customer_id, p_pickup_location, p_drop_location, p_vehicle_type, p_weight_estimate, p_planned_km, p_schedule_date, p_trip_amount, p_internal_notes)`**
- SECURITY DEFINER, SET search_path = public
- Role check: `sales_consigner`, `admin`, `super_admin`, `operations_consigner`
- For `sales_consigner`: verify the customer's `sales_consigner_owner_id = p_actor_user_id` (can only request for own customers)
- Auto-generates trip_code via `trip_generate_code_v1()`
- Computes route as `pickup_location || ' - ' || drop_location`
- INSERT into `trips` (current_stage = 'request_received', requested_by_id = p_actor_user_id)
- INSERT into `trip_owners` (sales_consigner_owner_id = p_actor_user_id for sales role, or NULL for ops/admin)
- INSERT into `trip_stage_history` (from_stage = NULL, to_stage = 'request_received')
- Returns jsonb `{trip_id, trip_code}`

**4. `trip_request_update_v1(p_actor_user_id, p_trip_id, p_pickup_location, p_drop_location, p_vehicle_type, p_weight_estimate, p_planned_km, p_schedule_date, p_trip_amount, p_internal_notes)`**
- SECURITY DEFINER, SET search_path = public
- Role check: `sales_consigner`, `admin`, `super_admin`
- Validates: trip exists, `current_stage = 'request_received'`
- For `sales_consigner`: verify `requested_by_id = p_actor_user_id` (can only edit own requests)
- UPDATE trips SET (only provided non-null fields), update route if pickup/drop changed
- Returns jsonb `{trip_id, trip_code}`

**5. `trip_request_accept_v1(p_actor_user_id, p_trip_id)`**
- SECURITY DEFINER, SET search_path = public
- Role check: `operations_consigner`, `admin`, `super_admin`
- Validates: trip exists, `current_stage = 'request_received'`
- UPDATE `trip_owners` SET `operations_consigner_owner_id = p_actor_user_id`
- UPDATE trips SET `current_stage = 'quoted'`, `updated_at = now()`
- INSERT into `trip_stage_history` (from_stage = 'request_received', to_stage = 'quoted', actor_id = p_actor_user_id)
- Returns jsonb `{trip_id, trip_code, ops_owner_id}`

**6. `trip_list_v1(p_actor_user_id, p_search, p_stage, p_limit, p_offset)`**
- SECURITY DEFINER, SET search_path = public
- Role check via `trip_assert_actor_v1`
- For `sales_consigner`: filter WHERE `trip_owners.sales_consigner_owner_id = p_actor_user_id`
- For `operations_consigner`: return ALL trips (no owner filter)
- For `admin`, `super_admin`: return ALL trips
- Joins: `trips` ← `trip_owners` ← `profiles` (for owner names), `customers` (for customer name), `profiles` (for requester name)
- Search across: trip_code, customer name, route
- Stage filter (optional)
- ORDER BY updated_at DESC
- Returns array of trip rows with owner names and customer name

**7. `trip_get_v1(p_actor_user_id, p_trip_id)`**
- SECURITY DEFINER, SET search_path = public
- Role check + ownership check for `sales_consigner`
- Returns single trip row with all fields + owner names + customer name + requester name

#### Migration 3: `trip_rls_policies`

```sql
ALTER TABLE trips ENABLE ROW LEVEL SECURITY;
ALTER TABLE trip_owners ENABLE ROW LEVEL SECURITY;
ALTER TABLE trip_stage_history ENABLE ROW LEVEL SECURITY;

-- Trips: authenticated users can read via RPC (RPC is SECURITY DEFINER)
CREATE POLICY "Authenticated users can read trips"
  ON trips FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can insert trips"
  ON trips FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Authenticated users can update trips"
  ON trips FOR UPDATE TO authenticated USING (true);

-- Trip owners: same pattern
CREATE POLICY "Authenticated users can read trip_owners"
  ON trip_owners FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can insert trip_owners"
  ON trip_owners FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Authenticated users can update trip_owners"
  ON trip_owners FOR UPDATE TO authenticated USING (true);

-- Trip stage history: read + insert
CREATE POLICY "Authenticated users can read trip_stage_history"
  ON trip_stage_history FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can insert trip_stage_history"
  ON trip_stage_history FOR INSERT TO authenticated WITH CHECK (true);
```

> Note: Row-level filtering is enforced in RPCs (SECURITY DEFINER), not in RLS policies. RLS here just ensures only authenticated users can access tables at all.

---

### Phase 2: API Routes (4 files)

#### `src/app/api/trips/_shared.ts`

- `requireTripActor(mode: "read" | "write")` — validates auth, returns `{ supabase, actor }` or `{ error }`
  - Read roles: `super_admin`, `admin`, `operations_consigner`, `sales_consigner`
  - Write roles: `super_admin`, `admin`, `operations_consigner`, `sales_consigner`
- `TripRow` interface mapping DB columns to camelCase
- `normalizeTripRow(row)` → `Trip` frontend type
- `mapRpcError(code, message)` → NextResponse with appropriate HTTP status

#### `src/app/api/trips/route.ts` — GET + POST

**GET** `/api/trips?search=&stage=&limit=50&offset=0`
- Calls `trip_list_v1`
- Returns `Trip[]`

**POST** `/api/trips`
- Body: `{ customerId, pickupLocation, dropLocation, vehicleType, weightEstimate, plannedKm, scheduleDate, tripAmount, internalNotes }`
- Calls `trip_request_create_v1`
- Returns `{ tripId, tripCode }`

#### `src/app/api/trips/[tripId]/route.ts` — GET + PATCH

**GET** `/api/trips/{tripId}`
- Calls `trip_get_v1`
- Returns full `Trip` object

**PATCH** `/api/trips/{tripId}`
- Body: partial update fields
- Calls `trip_request_update_v1`
- Returns `{ tripId, tripCode }`

#### `src/app/api/trips/[tripId]/accept/route.ts` — POST

**POST** `/api/trips/{tripId}/accept`
- No body needed
- Calls `trip_request_accept_v1`
- Returns `{ tripId, tripCode, opsOwnerId }`

---

### Phase 3: Client Helpers + Types (3 files)

#### `src/lib/api/trips.ts` — new file

```typescript
// listTrips(filters) → GET /api/trips
// getTripById(tripId) → GET /api/trips/{tripId}
// createTripRequest(input) → POST /api/trips
// updateTripRequest(tripId, input) → PATCH /api/trips/{tripId}
// acceptTripRequest(tripId) → POST /api/trips/{tripId}/accept
```

**Interfaces:**
- `ListTripsFilters { search?, stage?, limit?, offset? }`
- `CreateTripRequestInput { customerId, pickupLocation, dropLocation, vehicleType, weightEstimate?, plannedKm?, scheduleDate, tripAmount?, internalNotes? }`
- `UpdateTripRequestInput` — Partial of create (minus customerId)

#### `src/lib/types/index.ts` — edit

Add to `Trip` interface:
- `tripAmount: number | null`
- `requestedById: string`
- `requestedByName: string`

#### `src/lib/query/keys.ts` — edit

Add:
```typescript
trips: (filters: { search?: string; stage?: string }) =>
  ["trips", "list", filters] as const,
trip: (id: string) => ["trips", "detail", id] as const,
```

---

### Phase 4: Frontend (3 file edits + 1 new file)

#### 4a. `src/app/(app)/trips/new/page.tsx` — Rewrite as Trip Request form

**Changes:**
- Title: "Create Trip" → "New Trip Request"
- **Remove**: Ops Owner field entirely
- **Add**: Trip Amount field (numeric input, optional, placeholder: "e.g., 50000")
- Customer dropdown: fetch from `/api/customers` (for `sales_consigner`, filter to own customers; for others, show all)
- Vehicle type: fetch from vehicle master options API (already exists)
- Form submission: `useMutation` → `createTripRequest()`
- On success: navigate to `/trips/{newTripId}` with success toast/redirect
- On error: show inline error message

**Form fields (final):**
1. Customer (Select) — required
2. Pickup Location (text) — required
3. Drop Location (text) — required
4. Vehicle Type (Select from master) — required
5. Weight Estimate MT (number) — optional
6. Planned KM (number) — optional
7. Schedule Date (date) — required
8. Trip Amount (number) — optional, new field
9. Internal Notes (textarea) — optional

#### 4b. `src/app/(app)/trips/page.tsx` — Rewrite trips list

**Changes:**
- Replace mock data with `useQuery` → `listTrips(filters)`
- Button text: "New Trip" → "New Trip Request"
- Show button for: `sales_consigner`, `operations_consigner`, `admin`, `super_admin`
- For `sales_consigner`: only their trips are returned (enforced by RPC)
- For `operations_consigner`: all trips shown
- Add "Trip Amount" column to table
- Add "Requested By" column
- Keep existing search, stage filter, and export button

**Table columns (updated):**
1. Trip Code (link, with "L" badge for leased)
2. Customer
3. Route
4. Status (StatusBadge)
5. Trip Amount (formatted currency, or "—")
6. Vehicle (or "—")
7. Schedule (date)
8. Ops Owner (or "Pending" badge if `request_received`)

#### 4c. `src/app/(app)/trips/[tripId]/page.tsx` — Add role-based controls

**Changes:**
- Replace mock data with `useQuery` → `getTripById(tripId)`
- **Accept button**: Show "Accept Request" button when:
  - `current_stage === "request_received"` AND
  - user role is `operations_consigner` / `admin` / `super_admin`
  - On click: `useMutation` → `acceptTripRequest(tripId)` → invalidate queries
- **Edit button**: Show "Edit Request" button when:
  - `current_stage === "request_received"` AND
  - user is the requester (`requestedById === user.id`) OR admin/super_admin
  - Navigates to `/trips/{tripId}/edit`
- **Stage advance**: Keep "Advance Stage" button but hide for `sales_consigner`
- **Read-only for sales**: When `user.role === "sales_consigner"`, hide all action buttons except "Edit Request" (when applicable)

#### 4d. `src/app/(app)/trips/[tripId]/edit/page.tsx` — New edit form

**New file** — similar layout to `new/page.tsx` but:
- Pre-fills all fields from existing trip data (`useQuery` → `getTripById`)
- Title: "Edit Trip Request"
- Submit: `useMutation` → `updateTripRequest(tripId, input)`
- Guard: if `current_stage !== "request_received"`, redirect to detail page
- Guard: if user is `sales_consigner` and not the requester, redirect to detail page
- On success: navigate back to `/trips/{tripId}`

---

## 5. File Manifest

| Phase | Action | File |
|---|---|---|
| 1 | migrate | `trip_request_schema` (Supabase MCP) |
| 1 | migrate | `trip_request_rpcs` (Supabase MCP) |
| 1 | migrate | `trip_rls_policies` (Supabase MCP) |
| 2 | create | `src/app/api/trips/_shared.ts` |
| 2 | create | `src/app/api/trips/route.ts` |
| 2 | create | `src/app/api/trips/[tripId]/route.ts` |
| 2 | create | `src/app/api/trips/[tripId]/accept/route.ts` |
| 3 | create | `src/lib/api/trips.ts` |
| 3 | edit | `src/lib/types/index.ts` |
| 3 | edit | `src/lib/query/keys.ts` |
| 4 | rewrite | `src/app/(app)/trips/new/page.tsx` |
| 4 | rewrite | `src/app/(app)/trips/page.tsx` |
| 4 | edit | `src/app/(app)/trips/[tripId]/page.tsx` |
| 4 | create | `src/app/(app)/trips/[tripId]/edit/page.tsx` |

**New files:** 6 | **Edited files:** 5 | **Migrations:** 3

---

## 6. Verification

1. RPCs tested via `execute_sql` after each migration
2. `pnpm build` — zero errors
3. **Sales creates request**: `sales_consigner` logs in → "New Trip Request" → fills form (no ops owner field) → submits → trip appears in list at `request_received` stage
4. **Sales edits request**: Click "Edit Request" on detail page → update fields → save → changes reflected
5. **Sales can't edit accepted**: Once ops accepts, "Edit Request" button disappears for sales
6. **Ops sees all trips**: `operations_consigner` sees all trips in list, not just their own
7. **Ops accepts**: Click "Accept Request" → stage moves to `quoted`, ops user becomes `operations_consigner_owner_id`
8. **Sales read-only**: `sales_consigner` on trip detail → no "Advance Stage", no action buttons (except Edit when applicable)
9. **Trip amount**: New field visible in form, list, and detail overview
10. **Trip code**: Auto-generated `AL-DDMM-NNN` format, unique per day

---

## 7. Future Considerations (Out of Scope)

- Trip cancellation / rejection flow (ops rejects a request)
- Stage advancement beyond `quoted` (Phase 2 of trip lifecycle)
- Document gates and payment approval workflows
- Vehicle assignment flow
- Notifications on accept/reject
- Bulk trip request creation
