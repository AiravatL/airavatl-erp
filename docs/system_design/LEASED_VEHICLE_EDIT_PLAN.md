# AiravatL ERP - Leased Vehicle Master Edit Plan

Version: 1.0  
Date: February 25, 2026

## 1. Goal
Enable editing of leased vehicle **master fields** from the leased vehicle detail page:
- `vehicle number`
- `vehicle type`
- optional: `vendor assignment`, `status`

Policy editing already exists and remains separate.

## 2. Access Rules
- Edit master fields is **admin-only**:
  - `super_admin`
  - `admin`
- All other roles remain read-only.

## 3. Current State
- Backend already has update RPC/API:
  - RPC: `leased_vehicle_update_v1(...)`
  - API: `PATCH /api/leased-vehicles/[vehicleId]`
- Frontend currently exposes only policy edit in:
  - `src/app/(app)/vendors/[vehicleId]/page.tsx`

## 4. Proposed UX

### 4.1 Detail Page Layout
On `src/app/(app)/vendors/[vehicleId]/page.tsx`:
- Add a new card above policy cards: **Vehicle Master**
- Fields:
  - Vehicle Number (`text`, uppercase)
  - Vehicle Type (`select` from vehicle master options)
  - Vendor (`optional`, existing vendor list)
  - Status (`available | on_trip | maintenance`)
- Buttons:
  - `Save Master` (admin only)
  - `Reset` (admin only)

### 4.2 Validation UX
- Vehicle number required, uppercase and trimmed.
- Vehicle type required.
- Show inline validation errors.
- Conflict error (`duplicate number`) surfaced as clear message.

### 4.3 Read-Only UX
For non-admin users:
- Fields shown in disabled state or summary rows.
- No save action.

## 5. Backend Alignment
- Reuse existing `PATCH /api/leased-vehicles/[vehicleId]`.
- No new RPC required for baseline implementation.
- Optional hardening:
  - validate `type` via `vehicle_master_validate_selection_v1` in PATCH route, same as CRM forms.

## 6. Frontend Changes
- `src/app/(app)/vendors/[vehicleId]/page.tsx`
  - add `VehicleMasterEditor` section
  - keep existing `PolicyEditor` unchanged
- `src/lib/api/leased-vehicles.ts`
  - already contains `updateLeasedVehicle(...)`, reuse it
- query invalidation:
  - `queryKeys.leasedVehicle(vehicleId)`
  - `queryKeys.leasedVehicles(...)`
  - optionally `queryKeys.fleetVehicles(...)` if page is reached via Fleet

## 7. Edge Cases
- Changing number when trip history links still rely on old number snapshots.
- If vehicle type becomes inactive in master, allow existing type to display but block new invalid values.
- Concurrent edits: use optimistic UI only after server success for this flow (avoid accidental mismatch).

## 8. Delivery Steps
1. Add Vehicle Master edit card UI on detail page.
2. Prefill from current vehicle response.
3. Wire `updateLeasedVehicle(vehicleId, payload)` mutation.
4. Enforce admin-only save button visibility and disable state.
5. Add success/error banners consistent with policy save UX.
6. Invalidate relevant query caches.
7. Add manual QA for duplicate number, invalid type, and role restrictions.

## 9. Acceptance Criteria
- Admin can update leased vehicle number/type from detail page.
- Non-admin users cannot modify master fields.
- Successful save reflects in Fleet list and detail view.
- Duplicate vehicle number returns a clear error and keeps form state.
- Policy edit behavior remains unchanged.
