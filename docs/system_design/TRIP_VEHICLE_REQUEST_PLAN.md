# AiravatL ERP — Trip Vehicle Request & Assignment Plan

Version: 1.0
Date: February 26, 2026

---

## 1. Scope

After consigner ops accepts a trip request (stage moves to `quoted`), the next step is **requesting a vehicle**. This plan covers:

1. **Add pickup_date** to trip request form (missed field).
2. **Vehicle Request flow**: Consigner ops reviews/edits trip details (negotiation may have changed things) and submits a vehicle request. This moves the trip to `confirmed` stage.
3. **Vehicle Assignment flow**: Vehicle ops picks an available vehicle (leased, vendor, or driver-cum-owner) from the fleet and assigns it to the trip. This moves the trip to `vehicle_assigned` stage.

---

## 2. Current State

### 2.1 Trip Stages (13-step lifecycle)

```
1. request_received  ← Sales creates request
2. quoted            ← Consigner ops accepts (auto-becomes ops owner)
3. confirmed         ← Consigner ops confirms trip details + requests vehicle
4. vehicle_assigned  ← Vehicle ops assigns a vehicle
5. at_loading → ... → 13. closed (future phases)
```

**Currently implemented:** Stages 1→2 (trip request create + accept).
**This plan implements:** Stages 2→3 (confirm + request vehicle) and 3→4 (assign vehicle).

### 2.2 Database — trips table (relevant columns)

| Column | Type | Notes |
|---|---|---|
| vehicle_id | uuid FK → vehicles | nullable, set on assignment |
| vehicle_number | text | nullable, denormalized from vehicles.number |
| driver_name | text | nullable |
| vendor_id | uuid FK → vendors | nullable, set on assignment |
| pickup_location / drop_location | text | nullable |
| schedule_date | date | nullable |
| trip_amount | numeric | nullable |
| **pickup_date** | **NOT YET** | **needs to be added** |

### 2.3 Database — vehicles table

| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| number | text NOT NULL UNIQUE | Registration number |
| type | text NOT NULL | e.g., "32ft MXL" |
| ownership_type | enum: `leased` / `vendor` | |
| status | enum: `available` / `on_trip` / `maintenance` | |
| vendor_id | uuid FK → vendors | nullable (null for leased) |
| current_trip_id | uuid FK → trips | nullable |
| vehicle_length | text | nullable |

### 2.4 Database — trip_owners table (relevant columns)

| Column | Notes |
|---|---|
| operations_consigner_owner_id | Set when consigner ops accepts |
| operations_vehicles_owner_id | **Set when vehicle ops assigns** |

### 2.5 Existing Fleet API

- `GET /api/fleet/vehicles?status=available&vehicleType=...` — lists vehicles with `isOwnerDriver` flag
- `fleet_vehicle_list_v1` RPC — supports filtering by status, ownership kind, vehicle type
- `FleetVehicle` type has: `id`, `number`, `type`, `ownershipType`, `status`, `vendorId`, `vendorName`, `isOwnerDriver`, `hasPolicy`

---

## 3. Requirements

### 3.1 Pickup Date (Quick Fix)

Add `pickup_date` column to `trips`. This is the actual date the vehicle should arrive for loading, separate from `schedule_date` (when the trip was scheduled/requested).

- Shown in trip request form (create + edit)
- Shown in trip detail overview
- Passed through all RPCs

### 3.2 Vehicle Request Flow (Stage: quoted → confirmed)

**Who:** `operations_consigner`, `admin`, `super_admin`

**When:** Trip is at `quoted` stage.

**How:** On the trip detail page, consigner ops sees a "Confirm & Request Vehicle" button. Clicking it opens a **confirmation dialog** that:

1. **Shows current trip details** (read-only summary): customer, route, vehicle type, weight, planned KM, schedule date, pickup date, trip amount
2. **Allows edits** to negotiation-sensitive fields:
   - Trip Amount (may have changed after negotiation)
   - Vehicle Type (customer may have agreed to different vehicle)
   - Weight Estimate
   - Planned KM
   - Pickup Date
   - Internal Notes
3. **Confirm button** → atomically:
   - Updates trip fields (if changed)
   - Moves stage from `quoted` → `confirmed`
   - Logs stage change in `trip_stage_history`

**After confirm:** Trip is now visible to vehicle ops for assignment.

### 3.3 Vehicle Assignment Flow (Stage: confirmed → vehicle_assigned)

**Who:** `operations_vehicles`, `admin`, `super_admin`

**When:** Trip is at `confirmed` stage.

**How:** On the trip detail page, vehicle ops sees an "Assign Vehicle" button. Clicking it opens an **assignment dialog** that:

1. **Shows trip summary** (read-only): customer, route, vehicle type needed, weight, pickup date
2. **Vehicle picker**: Filterable list of available vehicles matching the trip's vehicle type
   - Shows: vehicle number, ownership type badge (Leased / Vendor / Owner-Driver), vendor name
   - Filter: by vehicle type (pre-filled from trip), by ownership kind
   - Only shows `status = 'available'` vehicles
3. **Driver Name** field (text input, required for vendor/owner-driver, optional for leased)
4. **Confirm button** → atomically:
   - Sets `trips.vehicle_id`, `trips.vehicle_number`, `trips.driver_name`, `trips.vendor_id`
   - Sets `trips.leased_flag = true` if vehicle is leased, `false` otherwise
   - Updates `vehicles.status = 'on_trip'`, `vehicles.current_trip_id = trip_id`
   - Sets `trip_owners.operations_vehicles_owner_id = assigning_user.id`
   - Moves stage from `confirmed` → `vehicle_assigned`
   - Logs stage change in `trip_stage_history`

### 3.4 Role Behaviour (Updated)

| Action | sales_consigner | operations_consigner | operations_vehicles | admin/super_admin |
|---|---|---|---|---|
| Create trip request | Own customers | Any | No | Any |
| Accept request (→ quoted) | No | Yes | No | Yes |
| Confirm & request vehicle (→ confirmed) | No | Yes | No | Yes |
| Assign vehicle (→ vehicle_assigned) | No | No | Yes | Yes |
| View trip detail | Own (read-only) | All | All | All |

---

## 4. Implementation Phases

### Phase 1: Database Migrations (2 migrations)

#### Migration 1: `trip_pickup_date_and_confirm`

```sql
-- Add pickup_date to trips
ALTER TABLE trips ADD COLUMN pickup_date date;

-- Update existing RPCs to handle pickup_date (done in Migration 2)
```

#### Migration 2: `trip_confirm_and_assign_rpcs`

**1. Update `trip_request_create_v1`** — add `p_pickup_date date` parameter
- OR create `trip_request_create_v2` to avoid breaking existing version

**2. Update `trip_request_update_v1`** — add `p_pickup_date date` parameter

**3. Update `trip_list_v1` and `trip_get_v1`** — include `pickup_date` in returned jsonb

**4. `trip_confirm_v1(p_actor_user_id, p_trip_id, p_trip_amount, p_vehicle_type, p_weight_estimate, p_planned_km, p_pickup_date, p_internal_notes)`**
- SECURITY DEFINER, SET search_path = public
- Role check: `operations_consigner`, `admin`, `super_admin`
- Validates: trip exists, `current_stage = 'quoted'`
- Updates trip fields (COALESCE for optional changes)
- Moves stage: `quoted` → `confirmed`
- INSERT `trip_stage_history`
- Returns jsonb `{trip_id, trip_code}`

**5. `trip_assign_vehicle_v1(p_actor_user_id, p_trip_id, p_vehicle_id, p_driver_name)`**
- SECURITY DEFINER, SET search_path = public
- Role check: `operations_vehicles`, `admin`, `super_admin`
- Validates: trip exists, `current_stage = 'confirmed'`
- Validates: vehicle exists, `status = 'available'`
- Lookups: vehicle.number, vehicle.vendor_id, vehicle.ownership_type
- Sets `trips.vehicle_id`, `trips.vehicle_number`, `trips.driver_name`, `trips.vendor_id`
- Sets `trips.leased_flag = (vehicle.ownership_type = 'leased')`
- Updates `vehicles.status = 'on_trip'`, `vehicles.current_trip_id = trip_id`
- Sets `trip_owners.operations_vehicles_owner_id = p_actor_user_id`
- Moves stage: `confirmed` → `vehicle_assigned`
- INSERT `trip_stage_history`
- Returns jsonb `{trip_id, trip_code, vehicle_id, vehicle_number}`

---

### Phase 2: API Routes (2 new files + 2 edits)

#### `src/app/api/trips/[tripId]/confirm/route.ts` — POST (new)

- `requireTripActor()` → validate role is ops_consigner/admin
- Body: `{ tripAmount?, vehicleType?, weightEstimate?, plannedKm?, pickupDate?, internalNotes? }`
- Calls `trip_confirm_v1`
- Returns `{ tripId, tripCode }`

#### `src/app/api/trips/[tripId]/assign-vehicle/route.ts` — POST (new)

- `requireTripActor()` → validate role is ops_vehicles/admin
- Body: `{ vehicleId, driverName? }`
- Calls `trip_assign_vehicle_v1`
- Returns `{ tripId, tripCode, vehicleId, vehicleNumber }`

#### `src/app/api/trips/_shared.ts` — edit

- Add `operations_vehicles` to `TRIP_ALLOWED_ROLES`
- Add `pickup_date` to `TripRow` and `normalizeTripRow`
- Add new error codes: `vehicle_not_found`, `vehicle_not_available`, `trip_not_quoted`, `trip_not_confirmed`

#### `src/app/api/trips/route.ts` — edit

- Pass `pickupDate` to `trip_request_create_v1` (add `p_pickup_date` param)

#### `src/app/api/trips/[tripId]/route.ts` — edit

- Pass `pickupDate` to `trip_request_update_v1` (add `p_pickup_date` param)

---

### Phase 3: Client Helpers + Types (3 edits)

#### `src/lib/api/trips.ts` — edit

Add:
```typescript
interface ConfirmTripInput {
  tripAmount?: number | null;
  vehicleType?: string;
  weightEstimate?: number | null;
  plannedKm?: number | null;
  pickupDate?: string;
  internalNotes?: string;
}

interface AssignVehicleInput {
  vehicleId: string;
  driverName?: string;
}

// confirmTrip(tripId, input) → POST /api/trips/{id}/confirm
// assignVehicle(tripId, input) → POST /api/trips/{id}/assign-vehicle
```

- Add `pickupDate` to `CreateTripRequestInput` and `UpdateTripRequestInput`

#### `src/lib/types/index.ts` — edit

Add to `Trip` interface:
- `pickupDate: string | null`

#### `src/lib/query/keys.ts` — edit (if needed)

- Add `availableVehicles` key for the vehicle picker:
```typescript
availableVehicles: (filters: { vehicleType?: string }) =>
  ["fleet", "vehicles", "available", filters] as const,
```

---

### Phase 4: Frontend (3 file edits)

#### 4a. Trip Request Forms — add pickup date

**`src/app/(app)/trips/new/page.tsx`** — add Pickup Date field (date input) between Schedule Date and Trip Amount.

**`src/app/(app)/trips/[tripId]/edit/page.tsx`** — add Pickup Date field, pre-fill from trip data.

#### 4b. Trip Detail Page — confirmation + assignment dialogs

**`src/app/(app)/trips/[tripId]/page.tsx`** — major changes:

**Confirm & Request Vehicle Dialog** (shown when `stage === "quoted"` and user is ops_consigner/admin):
- Trigger: "Confirm & Request Vehicle" button
- Dialog content:
  - Read-only summary: Customer, Route (pickup → drop), Schedule Date
  - Editable fields: Trip Amount, Vehicle Type (select from master), Weight Estimate, Planned KM, Pickup Date, Internal Notes
  - Pre-filled from current trip data
  - Warning text: "This will confirm the trip and request a vehicle from the fleet team."
- Confirm button → `useMutation` → `confirmTrip(tripId, input)` → invalidate queries
- On success: dialog closes, trip refreshes at `confirmed` stage

**Assign Vehicle Dialog** (shown when `stage === "confirmed"` and user is ops_vehicles/admin):
- Trigger: "Assign Vehicle" button
- Dialog content:
  - Read-only trip summary: Customer, Route, Vehicle Type needed, Weight, Pickup Date
  - **Vehicle picker**: fetched via `listFleetVehicles({ status: "available", vehicleType: trip.vehicleType })`
    - Rendered as a scrollable list of cards/rows
    - Each vehicle shows: number, type, ownership badge (Leased/Vendor/Owner-Driver), vendor name
    - Click to select (radio-style, highlighted border)
    - Search input to filter within results
  - **Driver Name** text input
  - Warning: "Vehicle status will change to On Trip."
- Confirm button → `useMutation` → `assignVehicle(tripId, { vehicleId, driverName })` → invalidate queries
- On success: dialog closes, trip refreshes at `vehicle_assigned` stage

#### 4c. Overview Tab — add pickup date

**`src/app/(app)/trips/[tripId]/overview-tab.tsx`** — add Pickup Date row next to Schedule Date.

---

### Phase 5: Mock Data Update

Update `src/lib/mock-data/index.ts`:
- Add `pickupDate` field to all TRIPS entries

---

## 5. File Manifest

| Phase | Action | File |
|---|---|---|
| 1 | migrate | `trip_pickup_date_and_confirm` (Supabase MCP) |
| 1 | migrate | `trip_confirm_and_assign_rpcs` (Supabase MCP) |
| 2 | create | `src/app/api/trips/[tripId]/confirm/route.ts` |
| 2 | create | `src/app/api/trips/[tripId]/assign-vehicle/route.ts` |
| 2 | edit | `src/app/api/trips/_shared.ts` |
| 2 | edit | `src/app/api/trips/route.ts` |
| 2 | edit | `src/app/api/trips/[tripId]/route.ts` |
| 3 | edit | `src/lib/api/trips.ts` |
| 3 | edit | `src/lib/types/index.ts` |
| 3 | edit | `src/lib/query/keys.ts` |
| 4 | edit | `src/app/(app)/trips/new/page.tsx` |
| 4 | edit | `src/app/(app)/trips/[tripId]/edit/page.tsx` |
| 4 | edit | `src/app/(app)/trips/[tripId]/page.tsx` |
| 4 | edit | `src/app/(app)/trips/[tripId]/overview-tab.tsx` |
| 5 | edit | `src/lib/mock-data/index.ts` |

**New files:** 2 | **Edited files:** 10 | **Migrations:** 2

---

## 6. Stage Flow Diagram (After Implementation)

```
Sales creates          Consigner Ops         Consigner Ops          Vehicle Ops
trip request           accepts               confirms + edits       assigns vehicle
     │                      │                      │                      │
     ▼                      ▼                      ▼                      ▼
┌──────────┐        ┌──────────┐        ┌──────────────┐        ┌─────────────────┐
│ request   │───────►│  quoted  │───────►│  confirmed   │───────►│vehicle_assigned │
│ received  │        │          │        │              │        │                 │
│           │        │ ops_con  │        │ vehicle req  │        │ vehicle set     │
│ editable  │        │ = owner  │        │ sent to      │        │ status=on_trip  │
│ by sales  │        │          │        │ vehicle team │        │ ops_veh = owner │
└──────────┘        └──────────┘        └──────────────┘        └─────────────────┘
```

---

## 7. Verification

1. RPCs tested via `execute_sql` after each migration
2. `pnpm build` — zero errors
3. **Pickup date**: visible in create form, edit form, detail overview
4. **Confirm flow**: Consigner ops on `quoted` trip → "Confirm & Request Vehicle" → dialog with editable fields → confirm → stage moves to `confirmed`
5. **Assign flow**: Vehicle ops on `confirmed` trip → "Assign Vehicle" → dialog with vehicle picker → select vehicle + driver → confirm → stage moves to `vehicle_assigned`, vehicle status = `on_trip`
6. **Role guards**: sales_consigner cannot see confirm/assign buttons; ops_vehicles cannot see confirm button; ops_consigner cannot see assign button
7. **Vehicle picker**: shows only `available` vehicles, filters by vehicle type, shows ownership badges
8. **Leased flag**: auto-set based on assigned vehicle's `ownership_type`

---

## 8. Future Considerations (Out of Scope)

- Vehicle unassignment / reassignment
- Driver phone number and contact details
- Vehicle capacity validation against trip weight
- Notification to vehicle ops when vehicle is requested
- Vehicle release after trip completion (on_trip → available)
- Stage transitions beyond `vehicle_assigned` (at_loading, in_transit, etc.)
