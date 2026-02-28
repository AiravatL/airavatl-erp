# AiravatL ERP - Vehicle CRM Plan (Ownership + UX + RPC/API)

Version: 1.0  
Date: February 24, 2026

## 1. Scope
Design Vehicle CRM for two onboarding patterns:

1. Owner-cum-driver vehicle
- Driver is owner.

2. Vendor-owned vehicle
- Vendor is owner.
- Vendor can have multiple drivers/vehicles under the same vendor profile.

Also align module UX and access:
- Pipeline page should have `Add Vehicle` CTA (not a top tab).
- Board/List should be view modes, not module tabs.
- `sales_vehicles` sees only own leads.
- `admin`/`super_admin` sees all leads.
- Operations roles have no Vehicle CRM access.

## 2. Current State Review

Current frontend:
- `src/app/(app)/vehicle-crm/page.tsx` (board)
- `src/app/(app)/vehicle-crm/all/page.tsx` (list)
- `src/app/(app)/vehicle-crm/new/page.tsx` (add form)
- `src/app/(app)/vehicle-crm/[vehicleLeadId]/page.tsx` (detail)

Current schema:
- `vehicle_leads` has `is_owner_cum_driver`, `owner_name`, `owner_contact`, `vehicle_registration`, `added_by_id`, `stage`.
- `vendors` and `vehicles` masters already exist for final onboarding.

Gap:
- Vendor-owned leads are currently denormalized in lead row (`owner_name` text), so same vendor repeats across many rows.

## 3. Role and Access Model (Required)

| Action | sales_vehicles | admin/super_admin | operations_vehicles | others |
|---|---|---|---|---|
| View pipeline/list | Own leads only | All leads | No | No |
| View detail | Own lead only | All leads | No | No |
| Create lead | Yes | Yes | No | No |
| Edit lead | Own lead only | Yes | No | No |
| Stage change | Own lead only | Yes | No | No |
| Onboard lead | Own lead only | Yes | No | No |
| Add activity | Own lead only | Yes | No | No |

## 4. Data Model Plan

## 4.1 Keep Existing
- `vehicle_leads` remains the CRM pipeline source.
- `vendors`, `vehicles` remain final operational masters.

## 4.2 Recommended Additions to `vehicle_leads`
1. `owner_type text check (owner_type in ('owner_cum_driver','vendor_owned')) default 'owner_cum_driver'`
2. `vendor_id uuid null references vendors(id)`  
   Used when `owner_type = 'vendor_owned'`.
3. `updated_by_id uuid null references profiles(id)`

## 4.3 Constraints
1. If `owner_type = 'owner_cum_driver'`:
- `vendor_id is null`
- `is_owner_cum_driver = true`

2. If `owner_type = 'vendor_owned'`:
- `vendor_id is not null`
- `is_owner_cum_driver = false`

3. Add index:
- `idx_vehicle_leads_added_by_stage (added_by_id, stage, created_at desc)`
- `idx_vehicle_leads_vendor_stage (vendor_id, stage, created_at desc)`

## 4.4 Onboarding Mapping

`vehicle_lead_onboard_v1` should:
1. Validate lead in `docs_pending` stage with docs checklist complete.
2. Upsert/create `vehicles` row from lead registration/type/capacity.
3. Set ownership:
- `owner_cum_driver` -> `vehicles.ownership_type = 'leased'`, `vendor_id = null`
- `vendor_owned` -> `vehicles.ownership_type = 'vendor'`, `vendor_id = lead.vendor_id`
4. Move lead stage to `onboarded`.
5. Write `audit_logs`.

## 5. RPC Contracts (Required)

All RPCs should be `SECURITY DEFINER`, role-checked inside function, and return normalized rows.

1. `vehicle_lead_list_v1(p_actor_user_id uuid, p_view text default 'board', p_stage vehicle_lead_stage default null, p_search text default null, p_limit int default 100, p_offset int default 0)`
- Role check: `sales_vehicles`, `admin`, `super_admin`
- `sales_vehicles` filter: `added_by_id = p_actor_user_id`

2. `vehicle_lead_get_v1(p_actor_user_id uuid, p_lead_id uuid)`
- Same access control, row-level.

3. `vehicle_lead_create_v1(p_actor_user_id uuid, ...lead fields...)`
- Role check: `sales_vehicles`, `admin`, `super_admin`
- Sets `added_by_id = p_actor_user_id`

4. `vehicle_lead_update_v1(p_actor_user_id uuid, p_lead_id uuid, ...editable fields...)`
- `sales_vehicles` can update only own lead.

5. `vehicle_lead_move_stage_v1(p_actor_user_id uuid, p_lead_id uuid, p_to_stage vehicle_lead_stage, p_note text default null)`
- Enforce valid stage transitions.
- Create stage-change activity.

6. `vehicle_lead_add_activity_v1(p_actor_user_id uuid, p_lead_id uuid, p_type vehicle_lead_activity_type, p_description text)`
- Same row-level access.

7. `vehicle_lead_onboard_v1(p_actor_user_id uuid, p_lead_id uuid, p_note text default null)`
- Converts lead to master entities and marks onboarded.

## 6. Next.js API Plan

1. `GET /api/vehicle-crm/leads`
- Calls `vehicle_lead_list_v1`

2. `POST /api/vehicle-crm/leads`
- Calls `vehicle_lead_create_v1`

3. `GET /api/vehicle-crm/leads/[leadId]`
- Calls `vehicle_lead_get_v1`

4. `PATCH /api/vehicle-crm/leads/[leadId]`
- Calls `vehicle_lead_update_v1`

5. `POST /api/vehicle-crm/leads/[leadId]/stage`
- Calls `vehicle_lead_move_stage_v1`

6. `POST /api/vehicle-crm/leads/[leadId]/activities`
- Calls `vehicle_lead_add_activity_v1`

7. `POST /api/vehicle-crm/leads/[leadId]/onboard`
- Calls `vehicle_lead_onboard_v1`

Response contract:
- `{ ok: true, data }`
- `{ ok: false, message }`

## 7. UI/UX Plan

## 7.1 Navigation
- Remove top tab strip for Vehicle CRM.
- Keep two view buttons in page header:
  - `Board`
  - `List`
- Add `Add Vehicle` primary CTA in header on pipeline/list.

## 7.2 Board View
- Columns by `vehicle_lead_stage`.
- Card sections:
  - Driver + vehicle number
  - Ownership badge: `Owner-cum-driver` / `Vendor-owned`
  - Vendor name (if vendor-owned)
  - Route, market rate, next follow-up
  - Stage actions (context menu)

## 7.3 List View
- Columns:
  - Driver
  - Mobile
  - Vehicle
  - Owner Type
  - Vendor/Owner
  - Stage
  - Next Follow-up
  - Added By
- Filters:
  - Stage
  - Owner type
  - Vehicle type
  - Search

## 7.4 Add/Edit Form UX
- Section 1: Ownership Type (first decision)
  - `Owner-cum-driver`
  - `Vendor-owned`
- Section 2 dynamic fields:
  - Owner-cum-driver: auto-sync owner fields from driver
  - Vendor-owned: select/create vendor + driver details
- Section 3: Vehicle details + preferred routes + rates
- Section 4: Follow-up and remarks
- Keep same form component for add/edit mode.

## 7.5 Detail Screen
- Header: lead identity + stage badge + ownership badge.
- Left: profile and vehicle details.
- Right: activity timeline and quick add activity.
- Actions: move stage, onboard, reject.

## 8. TanStack Query Plan

Query keys:
- `vehicleCrmLeads(filters, view)`
- `vehicleCrmLead(leadId)`
- `vehicleCrmActivities(leadId)`

Mutations:
- create lead
- update lead
- move stage (optimistic board/list update)
- add activity (optimistic append)
- onboard lead (optimistic stage update)

## 9. RLS and Policy Plan

`vehicle_leads` and `vehicle_lead_activities`:
1. `sales_vehicles`:
- `select/insert` own rows only (`added_by_id = auth.uid()`)
- update own rows only

2. `admin` / `super_admin`:
- full read/write

3. `operations_vehicles`, `operations_consigner`, others:
- no access

Audit:
- every create/update/stage/onboard action writes `audit_logs`.

## 10. Rollout Order

1. DB migration (owner_type/vendor_id/constraints/indexes).
2. RPC creation and grants.
3. API routes (`/api/vehicle-crm/*`).
4. Frontend wiring from mock data to API + TanStack Query.
5. QA role matrix and row-level visibility tests.
