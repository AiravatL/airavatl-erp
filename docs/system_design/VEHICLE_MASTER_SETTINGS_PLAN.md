# AiravatL ERP - Vehicle Master Settings (Implemented)

Version: 1.0  
Date: February 25, 2026

## Scope
- Admin-managed `vehicle type` and `vehicle length` master data.
- Used by Vehicle CRM and Consigner CRM create/edit flows.
- RPC-first backend with Next.js API routes.
- Backfill from existing production values to stay compatible.

## Data Model
- `vehicle_master_types`
  - `id`, `name` (unique), `active`
  - `created_by_id`, `updated_by_id`
  - `created_at`, `updated_at`
- `vehicle_master_type_lengths`
  - `id`, `vehicle_type_id` (FK), `length_value`
  - `active`
  - `created_by_id`, `updated_by_id`
  - `created_at`, `updated_at`

## Compatibility
- Backfilled distinct type values from:
  - `vehicle_leads.vehicle_type`
  - `consigner_leads.vehicle_type`
  - `market_rates.vehicle_type`
  - `vehicles.type`
  - `trips.vehicle_type`
- Backfilled lengths from `vehicle_leads.vehicle_length` mapped to type.
- Existing leads/rates remain valid; UI keeps legacy-safe fallback.

## RPC Contracts
- `vehicle_master_list_v1(p_actor_user_id, p_include_inactive)`
- `vehicle_master_upsert_type_v1(p_actor_user_id, p_type_id, p_name, p_active)`
- `vehicle_master_set_type_active_v1(p_actor_user_id, p_type_id, p_active, p_apply_to_lengths)`
- `vehicle_master_upsert_length_v1(p_actor_user_id, p_type_id, p_length_id, p_length_value, p_active)`
- `vehicle_master_set_length_active_v1(p_actor_user_id, p_length_id, p_active)`
- `vehicle_master_validate_selection_v1(p_vehicle_type, p_vehicle_length, p_allow_inactive)`

Role checks are enforced inside RPCs via:
- `vehicle_master_assert_active_actor_v1`
- `vehicle_master_assert_admin_actor_v1`

## API Routes
- `GET /api/vehicle-master/options`
  - Active master options for authenticated users.
- `GET /api/admin/vehicle-master`
  - Full list including inactive, admin only.
- `POST /api/admin/vehicle-master/types`
- `PATCH /api/admin/vehicle-master/types/[typeId]`
- `POST /api/admin/vehicle-master/lengths`
- `PATCH /api/admin/vehicle-master/lengths/[lengthId]`

## UI
- New admin page: `/admin/vehicle-master`
  - Add/rename/activate/deactivate vehicle types
  - Add/rename/activate/deactivate lengths under each type
- Admin section tabs:
  - `Users`
  - `Vehicle Master`

## Frontend Integration
- Vehicle CRM new form uses `/api/vehicle-master/options` via TanStack Query.
- Consigner CRM new form uses the same options source.
- Create/update APIs validate selected vehicle type/length via `vehicle_master_validate_selection_v1`.
