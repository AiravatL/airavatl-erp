# AiravatL ERP - Vendor Multi-Vehicle and Multi-Driver Plan

Version: 1.0  
Date: February 27, 2026

## 1. Goal

Support real fleet vendors where:

1. One vendor can have many vehicles.
2. One vendor can have many drivers.
3. New vehicles/drivers can be added later (post-onboarding) and used in trips.
4. Owner-cum-driver flow continues to work cleanly.

Mandatory business rule:

1. Normal vendor fleet should have both drivers and vehicles.
2. When assigning a vendor vehicle to a trip, selected driver must belong to the same vendor.

## 2. Current State (Verified)

## 2.1 What already works

1. `vendors` -> `vehicles` is already one-to-many via `vehicles.vendor_id`.
2. Fleet pages already show vehicles and vendors via RPC (`fleet_vehicle_list_v1`, `vendor_list_v2`).
3. Owner-driver tagging exists through `vehicle_leads.is_owner_cum_driver`.

## 2.2 Current gaps

1. No dedicated `vendor_drivers` table (drivers are stored as text snapshots).
2. `vehicle_lead_onboard_v1` creates exactly one vendor + one vehicle from one lead; no reusable driver entity.
3. Trips store `driver_name` text, not a `driver_id` reference.
4. No Fleet UI to add/manage vendor drivers and vendor vehicles after onboarding.

## 3. Target Data Model

## 3.1 Keep existing tables

1. `vendors`
2. `vehicles`

## 3.2 Add new tables

### `vendor_drivers`

1. `id uuid pk`
2. `vendor_id uuid not null references vendors(id) on delete cascade`
3. `full_name text not null`
4. `phone text not null`
5. `alternate_phone text null`
6. `license_number text null`
7. `license_expiry date null`
8. `is_owner_driver boolean not null default false`
9. `active boolean not null default true`
10. `notes text null`
11. `created_by_id uuid not null references profiles(id)`
12. `updated_by_id uuid null references profiles(id)`
13. `created_at timestamptz not null default now()`
14. `updated_at timestamptz not null default now()`

Indexes:

1. `(vendor_id, active, created_at desc)`
2. `(phone)`

### `vehicle_driver_assignments`

1. `id uuid pk`
2. `vehicle_id uuid not null references vehicles(id) on delete cascade`
3. `driver_id uuid not null references vendor_drivers(id) on delete cascade`
4. `assigned_at timestamptz not null default now()`
5. `unassigned_at timestamptz null`
6. `assigned_by_id uuid not null references profiles(id)`
7. `notes text null`

Constraints:

1. One active assignment per vehicle (partial unique on `vehicle_id where unassigned_at is null`).
2. Driver and vehicle must belong to same vendor (enforced inside RPC).

## 3.4 Data invariants (must enforce in RPCs)

1. A `vendor` ownership vehicle must always have a non-null `vendor_id`.
2. A `vendor_driver` must always have non-null `vendor_id`.
3. Trip vehicle assignment using a `vendor` vehicle requires a driver from that same `vendor_id`.
4. Cross-vendor driver assignment is rejected.
5. For `owner_driver` vendors, the same person can be both vendor owner and driver (`is_owner_driver = true`).

## 3.3 Extend existing tables (backward compatible)

### `vehicles`

1. Add `current_driver_id uuid null references vendor_drivers(id)`.
2. Keep existing fields unchanged.

### `trips`

1. Add `driver_id uuid null references vendor_drivers(id)`.
2. Keep existing `driver_name` text as snapshot for backward compatibility and reporting.

## 4. CRM Model Changes

## 4.1 Vehicle CRM create/edit form

Current owner-cum-driver checkbox is acceptable. Keep it.

Add explicit lead intent:

1. `lead_mode = owner_driver | vendor_fleet`
2. If `owner_driver`, owner fields auto-derive from driver.
3. If `vendor_fleet`, owner fields required and validated.

## 4.2 Onboard flow upgrade (`vehicle_lead_onboard_v2`)

Replace rigid onboard logic with:

1. Mode A: `create_new_vendor`
2. Mode B: `attach_to_existing_vendor` (search/select vendor)

On success:

1. Create/attach vendor.
2. Create vehicle under vendor.
3. Create driver under vendor from lead.
4. Create initial vehicle-driver assignment and set `vehicles.current_driver_id`.
5. Mark lead onboarded + `converted_vendor_id`.

## 5. RPC Plan (RPC-only)

## 5.1 New RPCs

1. `vendor_driver_list_v1(p_actor, p_vendor_id, p_search, p_active, p_limit, p_offset)`
2. `vendor_driver_create_v1(p_actor, p_vendor_id, p_full_name, p_phone, p_alternate_phone, p_license_number, p_license_expiry, p_is_owner_driver, p_notes)`
3. `vendor_driver_update_v1(...)`
4. `vendor_driver_set_active_v1(p_actor, p_driver_id, p_active)`
5. `vendor_vehicle_create_v1(p_actor, p_vendor_id, p_number, p_type, p_vehicle_length, p_status)`
6. `vendor_vehicle_update_v1(...)`
7. `vehicle_driver_assign_v1(p_actor, p_vehicle_id, p_driver_id, p_notes)`
8. `vehicle_driver_unassign_v1(p_actor, p_vehicle_id, p_notes)`
9. `vendor_driver_get_v1(p_actor, p_driver_id)` (optional detail page)
10. `vehicle_lead_onboard_v2(...)`

## 5.2 Existing RPCs to update

1. `trip_assign_vehicle_v2` -> include optional `p_driver_id`; if missing, fallback to current driver.
2. `trip_available_vehicles_v1` -> include `current_driver_id`, `current_driver_name`.
3. `fleet_vehicle_list_v1` -> include `current_driver_name`.
4. `vendor_list_v2` -> include `drivers_count`.

Validation rules inside `trip_assign_vehicle_v2` (updated):

1. If selected vehicle ownership is `vendor`, resolve `vehicle.vendor_id`.
2. If `p_driver_id` provided, ensure `vendor_drivers.vendor_id = vehicle.vendor_id`.
3. If `p_driver_id` is null, fallback to `vehicles.current_driver_id`; if still null, reject with `driver_required_for_vendor_vehicle`.
4. Snapshot selected driver name to `trips.driver_name` and store `trips.driver_id`.

## 6. API Plan

## 6.1 New routes

1. `GET /api/fleet/vendors/[vendorId]/drivers`
2. `POST /api/fleet/vendors/[vendorId]/drivers`
3. `PATCH /api/fleet/drivers/[driverId]`
4. `PATCH /api/fleet/drivers/[driverId]/active`
5. `GET /api/fleet/vendors/[vendorId]/vehicles`
6. `POST /api/fleet/vendors/[vendorId]/vehicles`
7. `PATCH /api/fleet/vehicles/[vehicleId]`
8. `POST /api/fleet/vehicles/[vehicleId]/assign-driver`
9. `POST /api/fleet/vehicles/[vehicleId]/unassign-driver`

## 6.2 Existing routes to update

1. `POST /api/vehicle-crm/leads/[leadId]/onboard` -> call `vehicle_lead_onboard_v2`
2. `GET /api/trips/available-vehicles` -> expose driver info
3. `POST /api/trips/[tripId]/assign-vehicle` -> optionally accept `driverId`

## 7. UI/UX Plan

## 7.1 Fleet module

1. Vendor card click opens `Vendor Detail`.
2. Vendor detail tabs:
   - `Vehicles`
   - `Drivers`
   - `Overview`
3. Actions:
   - `Add Vehicle`
   - `Add Driver`
   - `Assign Driver` on vehicle rows

Post-onboard management rule:

1. After vendor is onboarded, user can add additional vehicles and drivers under that vendor from Vendor Detail.

## 7.2 Trip assign vehicle dialog

1. Show current driver with vehicle card.
2. Optionally select a different driver from vendor driver list before assign.
3. Persist selected driver into trip (`driver_id` + `driver_name` snapshot).

## 7.3 CRM onboarding dialog

1. Keep current simple mode for owner-driver.
2. For vendor fleet lead, allow:
   - create new vendor, or
   - attach lead to existing vendor.

## 8. Role Permissions

Write operations:

1. `super_admin`, `admin`, `operations_vehicles` can add/edit drivers and vehicles.
2. `sales_vehicles` can create leads and onboard based on ownership rules, but cannot edit sensitive driver/vehicle records post-onboard (configurable).

Read operations:

1. Same visibility as current Fleet/Trip readers.

## 9. Data Migration Plan

## 9.1 Backfill drivers

For each vendor:

1. Create owner-driver rows from `vehicle_leads` where `converted_vendor_id` matches and `is_owner_cum_driver = true`.
2. For non-owner-driver leads, create driver row from `driver_name/mobile`.
3. De-duplicate by `(vendor_id, normalized_phone, normalized_name)`.

## 9.2 Backfill vehicle-driver links

1. Map each vendor vehicle to best matching driver (same lead and/or owner-driver heuristic).
2. Set `vehicles.current_driver_id`.
3. Insert assignment history rows.

## 9.3 Backfill trips

1. Populate `trips.driver_id` using vehicle current assignment where possible.
2. Keep `trips.driver_name` unchanged.

## 10. Compatibility Rules

1. Do not remove existing fields (`trips.driver_name`, owner-driver lead fields).
2. Keep v1 RPCs available during transition.
3. New screens must use only RPC-backed APIs (no direct queries).

## 11. Rollout Phases

### Phase 1 - Schema + RPC foundations

1. Add `vendor_drivers`, `vehicle_driver_assignments`, and table extensions.
2. Add new driver/assignment RPCs.
3. Add `vehicle_lead_onboard_v2`.

### Phase 2 - Fleet management UI

1. Vendor detail page with Drivers and Vehicles tabs.
2. Add Driver/Add Vehicle forms.
3. Driver assignment UI.

### Phase 3 - Trip integration

1. Update available vehicles endpoint with driver data.
2. Update assign-vehicle flow to capture driver.
3. Store `driver_id` in trips.

### Phase 4 - Migration + cleanup

1. Backfill and verify.
2. Switch onboard route to v2.
3. Deprecate v1 onboarding logic after validation window.

## 12. Acceptance Criteria

1. A vendor can have multiple vehicles and multiple drivers.
2. New driver/vehicle can be added after onboarding from Fleet UI.
3. Trip assignment can use vendor-linked drivers only (same vendor enforced).
4. Owner-cum-driver behavior still works and is clearly labeled.
5. No direct DB writes from API routes; RPC-only.
