# Leased Vehicle Management — Implementation Plan

## Context

The `/vendors` page has three tabs (Vendors, Vehicles, Leased Fleet) using mock data. A detail page at `/vendors/[vehicleId]` shows utilization stats and a policy editor — all read-only against `LEASED_VEHICLE_POLICIES` mock array. **No form exists to add a leased vehicle**, and the "Save Policy" button is non-functional.

This plan covers: adding a leased vehicle (insert into `vehicles` + `leased_vehicle_policies`), editing its policy, and listing/viewing with live Supabase data. **Admin/super_admin only** for all write operations.

## Existing DB (already migrated, 0 rows)

### `vehicles`
| Column | Type | Notes |
|---|---|---|
| id | uuid PK | gen_random_uuid() |
| number | text UNIQUE | e.g. "MH04AB1234" |
| type | text | e.g. "32ft MXL" |
| ownership_type | enum `vehicle_ownership` | `leased` / `vendor` |
| vendor_id | uuid FK→vendors | nullable (leased vehicles have no vendor) |
| status | enum `vehicle_status` | `available` / `on_trip` / `maintenance` |
| current_trip_id | uuid FK→trips | nullable |
| created_at / updated_at | timestamptz | |

### `leased_vehicle_policies` (1:1 with vehicle)
| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| vehicle_id | uuid UNIQUE FK→vehicles ON DELETE CASCADE | |
| driver_da_per_day | numeric NOT NULL | |
| vehicle_rent_per_day | numeric NOT NULL | |
| mileage_min / mileage_max | numeric NOT NULL | km/l band |
| default_terrain | enum `route_terrain` | `plain`/`mixed`/`hilly`, default `plain` |
| fuel_variance_threshold_percent | numeric NOT NULL | default 10 |
| unofficial_gate_cap | numeric NULL | |
| dala_kharcha_cap | numeric NULL | |
| parking_cap | numeric NULL | |
| created_at / updated_at | timestamptz | |

### `vendors`
| Column | Type |
|---|---|
| id | uuid PK |
| name | text NOT NULL |
| contact_phone | text |
| kyc_status | enum `kyc_status` |
| notes | text |
| active | boolean default true |

### Enums already created
`vehicle_ownership(leased, vendor)`, `vehicle_status(available, on_trip, maintenance)`, `route_terrain(plain, mixed, hilly)`, `kyc_status(verified, pending, rejected)`

---

## Phase 1: Database — RPCs + RLS + Indexes

### Migration 1: `leased_vehicle_indexes`
```sql
CREATE INDEX idx_vehicles_ownership ON vehicles(ownership_type, status);
CREATE INDEX idx_leased_policies_vehicle ON leased_vehicle_policies(vehicle_id);

-- Reuse existing set_updated_at trigger
CREATE TRIGGER trg_vehicles_updated_at BEFORE UPDATE ON vehicles
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_leased_policies_updated_at BEFORE UPDATE ON leased_vehicle_policies
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
```

### Migration 2: `leased_vehicle_rpcs` (all SECURITY DEFINER, SET search_path = public)

**1. `leased_vehicle_list_v1`**(p_actor, p_status, p_search, p_limit, p_offset)
- Actor must be active profile with role in `(admin, super_admin, operations_vehicles, operations_consigner)`
- Returns `vehicles` WHERE `ownership_type = 'leased'`, LEFT JOIN `leased_vehicle_policies`, LEFT JOIN `vendors`
- Search on `number`, `type`
- Optional status filter
- ORDER BY `created_at DESC`

**2. `leased_vehicle_get_v1`**(p_actor, p_vehicle_id)
- Same role check
- Single vehicle + policy + vendor_name
- Raises `not_found` if missing or not leased

**3. `leased_vehicle_create_v1`**(p_actor, p_number, p_type, p_vendor_id, p_driver_da_per_day, p_vehicle_rent_per_day, p_mileage_min, p_mileage_max, p_default_terrain, p_fuel_variance_threshold_percent, p_unofficial_gate_cap, p_dala_kharcha_cap, p_parking_cap)
- **Admin/super_admin only** (operations roles cannot create)
- Inserts into `vehicles` with `ownership_type = 'leased'`, `status = 'available'`
- Inserts into `leased_vehicle_policies` with the policy params
- Returns the joined row
- Validates: `p_number` not empty, `p_type` not empty, `p_mileage_min <= p_mileage_max`

**4. `leased_vehicle_update_policy_v1`**(p_actor, p_vehicle_id, p_driver_da_per_day, p_vehicle_rent_per_day, p_mileage_min, p_mileage_max, p_default_terrain, p_fuel_variance_threshold_percent, p_unofficial_gate_cap, p_dala_kharcha_cap, p_parking_cap)
- **Admin/super_admin only**
- COALESCE pattern for nullable fields
- Validates mileage_min <= mileage_max if both provided
- Returns updated joined row

**5. `leased_vehicle_update_v1`**(p_actor, p_vehicle_id, p_number, p_type, p_vendor_id, p_status)
- **Admin/super_admin only**
- Updates `vehicles` row (basic info + status)
- COALESCE pattern
- Returns updated joined row

**6. `vendor_list_v1`**(p_actor, p_search, p_limit, p_offset)
- Needed for the "Add Leased Vehicle" form's vendor dropdown
- All allowed roles can read vendors
- Returns id, name, contact_phone, kyc_status
- Search on name

### Migration 3: `leased_vehicle_rls`
```sql
ALTER TABLE vehicles ENABLE ROW LEVEL SECURITY;
-- Broad read (any authenticated user with active profile can see vehicles)
-- Write restricted to admin/super_admin
ALTER TABLE leased_vehicle_policies ENABLE ROW LEVEL SECURITY;
-- Same pattern: broad read, admin-only write
ALTER TABLE vendors ENABLE ROW LEVEL SECURITY;
-- Broad read for all active profiles
```

---

## Phase 2: API Routes (under `src/app/api/leased-vehicles/`)

### `_shared.ts`
- `LEASED_VEHICLE_READ_ROLES` = `["admin", "super_admin", "operations_vehicles", "operations_consigner"]`
- `LEASED_VEHICLE_WRITE_ROLES` = `["admin", "super_admin"]`
- `LeasedVehicleRow` interface (snake_case DB row + policy fields + vendor_name)
- `normalizeLeasedVehicleRow()` → frontend `LeasedVehicle` type
- `requireLeasedVehicleActor(mode: "read" | "write")` — auth helper
- `mapRpcError()` — same pattern as consigner-crm

### `route.ts` — GET (list) + POST (create)
- **GET**: query params → `supabase.rpc("leased_vehicle_list_v1", {...})` → normalize → return
- **POST**: body → `supabase.rpc("leased_vehicle_create_v1", {...})` → normalize → return 201

### `[vehicleId]/route.ts` — GET (detail) + PATCH (update vehicle info)
- **GET**: `supabase.rpc("leased_vehicle_get_v1", {...})` → normalize
- **PATCH**: `supabase.rpc("leased_vehicle_update_v1", {...})` → normalize

### `[vehicleId]/policy/route.ts` — PATCH (update policy)
- **PATCH**: `supabase.rpc("leased_vehicle_update_policy_v1", {...})` → normalize

### `src/app/api/vendors/route.ts` — GET (vendor dropdown)
- **GET**: `supabase.rpc("vendor_list_v1", {...})` → return list

---

## Phase 3: Client Helpers + Query Keys

### `src/lib/api/leased-vehicles.ts`
- `listLeasedVehicles(filters)` → GET `/api/leased-vehicles`
- `getLeasedVehicleById(id)` → GET `/api/leased-vehicles/{id}`
- `createLeasedVehicle(input)` → POST `/api/leased-vehicles`
- `updateLeasedVehicle(id, input)` → PATCH `/api/leased-vehicles/{id}`
- `updateLeasedVehiclePolicy(id, input)` → PATCH `/api/leased-vehicles/{id}/policy`
- `listVendors(search?)` → GET `/api/vendors`

### `src/lib/query/keys.ts` — add:
```ts
leasedVehicles: (filters) => ["leased-vehicles", "list", filters],
leasedVehicle: (id) => ["leased-vehicles", "detail", id],
vendors: (filters) => ["vendors", "list", filters],
```

---

## Phase 4: Types Update

### `src/lib/types/index.ts`
Add a combined `LeasedVehicle` type for the API response (vehicle + policy joined):
```ts
export interface LeasedVehicle {
  id: string;              // vehicle id
  number: string;
  type: string;
  status: "available" | "on_trip" | "maintenance";
  vendorId: string | null;
  vendorName: string | null;
  // Policy fields (null if no policy row yet — shouldn't happen for new creates)
  policyId: string | null;
  driverDaPerDay: number;
  vehicleRentPerDay: number;
  mileageMin: number;
  mileageMax: number;
  defaultTerrain: RouteTerrain;
  fuelVarianceThresholdPercent: number;
  unofficialGateCap: number | null;
  dalaKharchaCap: number | null;
  parkingCap: number | null;
  createdAt: string;
  updatedAt: string;
}
```

Keep the existing `LeasedVehiclePolicy` and `Vehicle` types for backward compat with mock data pages that haven't migrated yet. The new pages will use `LeasedVehicle`.

---

## Phase 5: Frontend — Rewire Existing + Add New Page

### 5a. Add "Add Leased Vehicle" page — `src/app/(app)/vendors/leased/new/page.tsx`

**NEW FILE** — Full create form with `useMutation`.

**Form fields (2-section layout):**

**Section 1 — Vehicle Info:**
| Field | Input | Required |
|---|---|---|
| Vehicle Number | text, auto-uppercase | Yes |
| Vehicle Type | select: "32ft MXL", "20ft SXL", "40ft Trailer", "14ft SCV" | Yes |
| Vendor | async select dropdown from `listVendors()` | No (leased may not have a vendor) |

**Section 2 — Policy (pre-filled with defaults from PRD):**
| Field | Input | Default |
|---|---|---|
| Driver DA per Day (₹) | number | 1000 |
| Vehicle Rent per Day (₹) | number | 3333 |
| Mileage Min (km/l) | number | 3.0 |
| Mileage Max (km/l) | number | 5.0 |
| Default Terrain | select: plain/mixed/hilly | plain |
| Fuel Variance Threshold (%) | number | 10 |
| Unofficial Gate Cap (₹) | number | 1500 |
| Dala Kharcha Cap (₹) | number | 500 |
| Parking Cap (₹) | number | 300 |

**Behavior:**
- Validation: number required + unique (server-side), type required, mileage_min <= mileage_max
- On success: redirect to `/vendors` (Leased Fleet tab) with toast/invalidation
- Cancel: back to `/vendors`
- Only visible to admin/super_admin

### 5b. Rewire `/vendors/page.tsx` — Leased Fleet tab

- Replace mock `VEHICLES` + `LEASED_VEHICLE_POLICIES` with `useQuery` → `listLeasedVehicles()`
- Keep Vendors/Vehicles tabs on mock data for now (separate migration later)
- Add "Add Leased Vehicle" button (admin only) in the Leased Fleet tab header
- Loading/error states for the Leased Fleet tab
- Links stay at `/vendors/{vehicleId}`

### 5c. Rewire `/vendors/[vehicleId]/page.tsx` — Detail + Policy Editor

- Replace mock lookups with `useQuery` → `getLeasedVehicleById(vehicleId)`
- Wire "Save Policy" button → `useMutation` → `updateLeasedVehiclePolicy()`
- Make all policy fields controlled inputs (currently using `defaultValue`)
- Add success/error feedback on save
- Trip history section: keep mock data for now (trip APIs not built yet)
- Admin-only: show edit controls. Non-admin: read-only policy display

### 5d. Sidebar — no changes needed
The "Vendors / Fleet" link at `/vendors` already exists and is visible to all roles. Role-gating for write operations happens at the page/API level.

---

## Phase 6: Verification

1. **RPCs tested** via `execute_sql` after each migration
2. **`pnpm build`** — zero errors
3. **Leased Fleet tab** shows live data from Supabase (initially empty, then after adding)
4. **Add Leased Vehicle form**: creates vehicle + policy in one transaction, appears in list
5. **Detail page**: shows live policy, "Save Policy" persists changes
6. **Role gating**: admin sees Add/Edit buttons, operations sees read-only, others see the tab but no write controls
7. **Validation**: duplicate vehicle number returns error, mileage_min > mileage_max returns error

---

## File Manifest

| Phase | Action | File |
|---|---|---|
| 1 | migrate | `leased_vehicle_indexes` (Supabase MCP) |
| 1 | migrate | `leased_vehicle_rpcs` (Supabase MCP) |
| 1 | migrate | `leased_vehicle_rls` (Supabase MCP) |
| 2 | create | `src/app/api/leased-vehicles/_shared.ts` |
| 2 | create | `src/app/api/leased-vehicles/route.ts` |
| 2 | create | `src/app/api/leased-vehicles/[vehicleId]/route.ts` |
| 2 | create | `src/app/api/leased-vehicles/[vehicleId]/policy/route.ts` |
| 2 | create | `src/app/api/vendors/route.ts` |
| 3 | create | `src/lib/api/leased-vehicles.ts` |
| 3 | edit | `src/lib/query/keys.ts` |
| 4 | edit | `src/lib/types/index.ts` |
| 5a | create | `src/app/(app)/vendors/leased/new/page.tsx` |
| 5b | edit | `src/app/(app)/vendors/page.tsx` |
| 5c | edit | `src/app/(app)/vendors/[vehicleId]/page.tsx` |

**Estimated new files:** 7
**Estimated edited files:** 3
**Estimated migrations:** 3
