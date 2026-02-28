# AiravatL ERP - Fleet Restructure Plan

Version: 1.0  
Date: February 25, 2026

## 1. Goal
Restructure the current `Vendors / Fleet` module into a single `Fleet` module with this UX:

- Sidebar label: `Fleet`
- No global `Add Vendor` action
- Tabs in this exact order:
  1. `All Vehicles`
  2. `Vendors`
  3. `Leased Vehicles`

Business rule:
- Vendors are created via conversion/onboarding flows (not manually from Fleet page).
- Vendors list must include both normal vendors and driver-cum-owner entities.

## 2. Current State (Observed)
- Sidebar label is `Vendors / Fleet` (`src/components/layout/sidebar.tsx`).
- `src/app/(app)/vendors/page.tsx`:
  - shows `Add Vendor` button (must remove),
  - uses mock data for Vendors and Vehicles tabs (`VENDORS`, `VEHICLES`),
  - only Leased tab is live via RPC-backed API.
- `vendor_list_v1` RPC exists.
- No RPC for unified `All Vehicles` list.

## 3. Target Information Architecture
- Route remains `/vendors` for now (no breaking URL change), but UI title/label becomes `Fleet`.
- Tabs:
  - `All Vehicles`: every vehicle in organization (`vendor` + `leased` ownership).
  - `Vendors`: all vendor entities, including driver-cum-owner profiles.
  - `Leased Vehicles`: existing leased vehicle list and create flow.

## 4. Backend Plan (RPC-First)

## 4.1 New/Updated RPCs
1. `fleet_vehicle_list_v1(p_actor uuid, p_search text default null, p_status text default null, p_ownership text default null, p_limit int default 200, p_offset int default 0)`
- Returns vehicles across all ownership types.
- Includes vendor metadata and optional leased policy flags.

2. `vendor_list_v2(p_actor uuid, p_search text default null, p_limit int default 200, p_offset int default 0)`
- Extends current vendor list with:
  - `vehicles_count`
  - `owner_driver_flag` (derived)
  - `source`/`kind` hint (vendor_fleet vs owner_driver) from conversion metadata.

Notes:
- Keep `vendor_list_v1` intact for backward compatibility.
- Use `SECURITY DEFINER`, role checks inside RPC.

## 4.2 Derivation for Driver-Cum-Owner
- Prefer deriving from existing conversion-linked data:
  - `vehicle_leads.converted_vendor_id`
  - `vehicle_leads.is_owner_cum_driver`
- If multiple leads map to one vendor, `owner_driver_flag = true` if any source lead was owner-cum-driver.

## 5. API Layer Plan
Add Fleet APIs and keep normalized `{ ok, data }` responses:

1. `GET /api/fleet/vehicles` -> `fleet_vehicle_list_v1`
2. `GET /api/fleet/vendors` -> `vendor_list_v2`
3. Reuse existing `GET /api/leased-vehicles` for `Leased Vehicles` tab.

No direct table queries from UI components.

## 6. Frontend Plan

## 6.1 Navigation and Header
- Sidebar label change:
  - `Vendors / Fleet` -> `Fleet`
- Page title:
  - `Vendors & Fleet` -> `Fleet`
- Remove `Add Vendor` button from top header.

## 6.2 Tabs
- Replace current tab order with:
  - `All Vehicles | Vendors | Leased Vehicles`
- Persist single search input across tabs with tab-aware placeholder text.

## 6.3 All Vehicles Tab (new live data)
- Data source: `GET /api/fleet/vehicles`
- Columns:
  - Vehicle Number
  - Type
  - Ownership (`vendor`/`leased`)
  - Vendor/Owner Name
  - Status
  - Policy indicator (for leased)
- Mobile card fallback as in current style.

## 6.4 Vendors Tab (new live data)
- Data source: `GET /api/fleet/vendors`
- Card fields:
  - Name
  - Contact
  - KYC Status
  - Vehicles Count
  - Badge: `Owner-Driver` or `Vendor`

## 6.5 Leased Vehicles Tab
- Keep current working list + `Add Leased Vehicle` CTA for write roles.
- No behavior change except tab position and shared search wiring.

## 7. Roles and Permissions
- Read access should align with existing Fleet consumers.
- Write access:
  - No vendor create action in Fleet UI.
  - Leased vehicle create remains admin/super_admin only.

## 8. Compatibility and Migration Strategy
1. Add new RPCs without removing old ones.
2. Add new API routes.
3. Switch Fleet page from mock data to API data.
4. Remove `Add Vendor` button.
5. Keep `/vendors` route stable.
6. Optional cleanup later: deprecate old vendor RPC once unused.

## 9. Acceptance Criteria
- Sidebar shows `Fleet`.
- Header has no `Add Vendor` button.
- Tabs are exactly: `All Vehicles | Vendors | Leased Vehicles`.
- Vendors tab includes owner-driver entities.
- All Vehicles shows both vendor and leased vehicles from DB.
- No mock data dependency remains in Fleet page.
- All data loaded through API -> RPC path.
