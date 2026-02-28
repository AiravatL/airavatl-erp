# AiravatL ERP — Database Schema (Live)

Last verified against live Supabase schema on **February 25, 2026**.

This document reflects the current deployed schema and RPC contracts.

## 1. Core Design

- PostgreSQL schema: `public`
- Primary keys: `uuid` (`gen_random_uuid()`)
- Timestamps: `timestamptz`
- Naming: `snake_case`
- Access pattern: RPC-first (`SECURITY DEFINER` functions are primary write/read surface)
- Auth identity: `profiles.id` -> `auth.users.id`

## 2. Role Model (`role_type`)

`super_admin`, `admin`, `operations_consigner`, `operations_vehicles`, `sales_vehicles`, `sales_consigner`, `accounts`, `support`

## 3. Enums (Current)

- `role_type`: `super_admin`, `admin`, `operations_consigner`, `operations_vehicles`, `sales_vehicles`, `sales_consigner`, `accounts`, `support`
- `trip_stage`: `request_received`, `quoted`, `confirmed`, `vehicle_assigned`, `at_loading`, `loaded_docs_ok`, `advance_paid`, `in_transit`, `delivered`, `pod_soft_received`, `vendor_settled`, `customer_collected`, `closed`
- `ownership_type`: `leased`, `vendor`
- `vehicle_status`: `available`, `on_trip`, `maintenance`
- `kyc_status`: `verified`, `pending`, `rejected`
- `doc_type`: `invoice`, `eway_bill`, `lr`, `pod_soft`, `pod_original`
- `doc_status`: `pending`, `uploaded`, `verified`, `rejected`
- `payment_type`: `advance`, `balance`, `vendor_settlement`, `other`
- `payment_status`: `pending`, `approved`, `on_hold`, `rejected`, `paid`
- `expense_category`: `driver_da`, `vehicle_rent`, `fuel`, `def`, `toll`, `unofficial_gate`, `dala_kharcha`, `repair`, `parking`, `other`
- `cap_status`: `within_cap`, `over_cap`
- `approval_status`: `pending`, `approved`, `rejected`, `escalated`
- `checkpoint_type`: `dispatch`, `fuel_stop`, `destination`
- `ticket_status`: `open`, `in_progress`, `waiting`, `resolved`
- `ticket_issue_type`: `documentation`, `payment`, `operational`, `customer_complaint`, `other`
- `receivable_status`: `pending`, `partial`, `collected`, `overdue`
- `aging_bucket`: `0_7`, `8_15`, `16_30`, `30_plus`
- `lead_stage`: `new_enquiry`, `contacted`, `quote_sent`, `negotiation`, `won`, `lost`
- `lead_source`: `referral`, `website`, `cold_call`, `existing_customer`
- `lead_priority`: `low`, `medium`, `high`
- `lead_activity_type`: `call`, `email`, `meeting`, `note`, `stage_change`
- `vehicle_lead_stage`: `new_entry`, `contacted`, `docs_pending`, `verified`, `onboarded`, `rejected`
- `vehicle_lead_activity_type`: `call`, `whatsapp`, `meeting`, `note`, `stage_change`, `doc_upload`
- `route_terrain`: `plain`, `mixed`, `hilly`
- `rate_category`: `ftl`, `ptl`, `odc`, `container`, `express`
- `rate_status`: `pending`, `approved`, `rejected`
- `alert_type`: `missing_docs`, `pending_approval`, `pod_overdue`, `overdue_receivable`, `fuel_variance`, `sla_breach`
- `alert_severity`: `low`, `medium`, `high`

## 4. Table Inventory (26 Tables)

### 4.1 Identity and Access

#### `profiles`
- Columns: `id`, `full_name`, `email`, `role`, `active`, `created_at`, `updated_at`
- Constraints: PK(`id`), UNIQUE(`email`), FK(`id`) -> `auth.users.id` ON DELETE CASCADE

### 4.2 CRM and Master Data

#### `customers`
- Columns: `id`, `name`, `address`, `gstin`, `credit_days`, `credit_limit`, `sales_consigner_owner_id`, `active`, timestamps
- Constraints: FK(`sales_consigner_owner_id`) -> `profiles.id`
- Indexes: `idx_customers_name`, `idx_customers_active`, `idx_customers_sales_owner`

#### `consigner_leads`
- Columns: identity/contact, `source`, `estimated_value`, `route`, `vehicle_type`, `stage`, `priority`, `sales_consigner_owner_id`, `converted_customer_id`, timestamps
- Constraints: FK owner -> `profiles`, FK converted customer -> `customers`
- Indexes: `idx_consigner_leads_owner_stage`

#### `consigner_lead_activities`
- Columns: `lead_id`, `type`, `description`, `created_by_id`, `created_at`
- Constraints: FK(`lead_id`) -> `consigner_leads.id` ON DELETE CASCADE
- Indexes: `idx_consigner_lead_activities_lead`

#### `vehicle_leads`
- Columns: driver/owner/contact/address fields, `vehicle_type`, `vehicle_length`, `vehicle_capacity`, `vehicle_registration`, `stage`, `added_by_id`, `converted_vendor_id`, timestamps
- Constraints: FK(`added_by_id`) -> `profiles`, FK(`converted_vendor_id`) -> `vendors`
- Indexes: `idx_vehicle_leads_converted_vendor`

#### `vehicle_lead_activities`
- Columns: `vehicle_lead_id`, `type`, `description`, `created_by_id`, `created_at`
- Constraints: FK(`vehicle_lead_id`) -> `vehicle_leads.id` ON DELETE CASCADE

#### `vehicle_master_types`
- Columns: `id`, `name`, `active`, `created_by_id`, `updated_by_id`, timestamps
- Constraints: UNIQUE(`name`), non-empty name check, FK to `profiles`
- Indexes: `idx_vehicle_master_types_active_name`

#### `vehicle_master_type_lengths`
- Columns: `id`, `vehicle_type_id`, `length_value`, `active`, `created_by_id`, `updated_by_id`, timestamps
- Constraints: UNIQUE(`vehicle_type_id`, `length_value`), non-empty check, FK(`vehicle_type_id`) -> `vehicle_master_types.id` ON DELETE CASCADE
- Indexes: `idx_vehicle_master_lengths_type_active`

### 4.3 Fleet

#### `vendors`
- Columns: `id`, `name`, `contact_phone`, `kyc_status`, `notes`, `active`, timestamps

#### `vehicles`
- Columns: `id`, `number`, `type`, `vehicle_length`, `ownership_type`, `vendor_id`, `status`, `current_trip_id`, timestamps
- Constraints: UNIQUE(`number`), FK(`vendor_id`) -> `vendors`, FK(`current_trip_id`) -> `trips`
- Indexes: `idx_vehicles_ownership`

#### `leased_vehicle_policies`
- Columns: `vehicle_id`, `driver_da_per_day`, `vehicle_rent_per_day`, mileage bounds, terrain/cap fields, timestamps
- Constraints: UNIQUE(`vehicle_id`), FK(`vehicle_id`) -> `vehicles.id` ON DELETE CASCADE
- Indexes: `idx_leased_policies_vehicle`

### 4.4 Trips and Operations

#### `trips`
- Columns: `trip_code`, `customer_id`, `current_stage`, route fields, `vehicle_type`, `vehicle_type_id`, assignment fields, financial fields, `pickup_date`, timestamps
- Constraints:
  - UNIQUE(`trip_code`)
  - FK(`customer_id`) -> `customers`
  - FK(`requested_by_id`) -> `profiles`
  - FK(`vehicle_id`) -> `vehicles`
  - FK(`vendor_id`) -> `vendors`
  - FK(`vehicle_type_id`) -> `vehicle_master_types`
- Indexes: `idx_trips_customer_stage_updated`, `idx_trips_requested_by`, `idx_trips_vehicle_type_id`

#### `trip_owners`
- Columns: one row per trip owner mapping (`sales_*`, `operations_*`, `accounts`), timestamps
- Constraints: UNIQUE(`trip_id`), FK all owner columns -> `profiles`, FK(`trip_id`) -> `trips.id` ON DELETE CASCADE
- Indexes: partial indexes for owner lookups

#### `trip_stage_history`
- Columns: `trip_id`, `from_stage`, `to_stage`, `actor_id`, `notes`, `created_at`
- Constraints: FK(`trip_id`) -> `trips.id` ON DELETE CASCADE, FK(`actor_id`) -> `profiles`
- Indexes: `idx_trip_stage_history_trip`

#### `quote_versions`
- Columns: `trip_id`, `version`, margin/price fields, `approved`, `approved_by_id`, `created_at`
- Constraints: UNIQUE(`trip_id`, `version`), FK(`trip_id`) -> `trips.id` ON DELETE CASCADE

### 4.5 Finance and Execution

#### `payment_requests`
- Columns: `trip_id`, `type`, `amount`, `beneficiary`, request/review metadata, timestamps
- Constraints: CHECK `amount > 0`, FK trip -> `trips`, user refs -> `profiles`

#### `expense_entries`
- Columns: `trip_id`, `category`, `amount`, cap/approval fields, receipt fields, submitter, timestamps
- Constraints: CHECK `amount > 0`, CHECK over-cap requires `reason`, FK trip -> `trips` ON DELETE CASCADE

#### `odometer_checkpoints`
- Columns: `trip_id`, `checkpoint_type`, readings/photo/location/fuel/def fields, recorder metadata, timestamps
- Constraints:
  - UNIQUE(`trip_id`, `checkpoint_type`)
  - CHECK reading >= 0 when present
  - CHECK fuel fields required for `fuel_stop`

#### `receivables`
- Columns: `trip_id`, `customer_id`, `trip_code`, amount/due/status/aging/follow-up fields, timestamps
- Constraints: FK trip -> `trips` ON DELETE CASCADE, FK customer -> `customers`
- Indexes: `idx_receivables_customer_status_due`

### 4.6 Rates

#### `market_rates`
- Columns: route, `vehicle_type`, `vehicle_type_id`, category/value fields, submit/review metadata, status, timestamps
- Constraints:
  - FK(`submitted_by_id`) -> `profiles`
  - FK(`reviewed_by_id`) -> `profiles`
  - FK(`vehicle_type_id`) -> `vehicle_master_types`
- Indexes: `idx_market_rates_status_created_at`, `idx_market_rates_route_vehicle`, `idx_market_rates_vehicle_type_id`

#### `market_rate_comments`
- Columns: `rate_id`, `comment_text`, `created_by_id`, timestamps
- Constraints: non-blank text check, FK(`rate_id`) -> `market_rates.id` ON DELETE CASCADE
- Indexes: `idx_market_rate_comments_rate_created`

### 4.7 Support and Governance

#### `tickets`
- Columns: trip linkage, issue/title/description, status, assignee/creator, timestamps
- Constraints: FK trip/assignee/creator references

#### `ticket_comments`
- Columns: `ticket_id`, `comment_text`, `attachment_path`, `author_id`, `created_at`
- Constraints: FK(`ticket_id`) -> `tickets.id` ON DELETE CASCADE

#### `policy_settings`
- Columns: `key`, `value` (jsonb), description, `updated_by_id`, `updated_at`
- Constraints: UNIQUE(`key`)

#### `alerts`
- Columns: alert type/severity, message fields, optional trip linkage, dismissal metadata
- Constraints: FK(`trip_id`) -> `trips`, FK(`dismissed_by_id`) -> `profiles`

#### `audit_logs`
- Columns: entity/action metadata, actor metadata, `before_data`, `after_data`, `created_at`
- Indexes: `idx_audit_logs_entity` (`entity`, `entity_id`, `created_at desc`)

## 5. Key Schema Changes (Compared to Early V1)

- `market_rates.vehicle_type_id` added and now **required** (`NOT NULL` + FK to `vehicle_master_types`).
- `trips.vehicle_type_id` added (nullable for compatibility, populated when vehicle type is provided).
- Rate and Trip request RPCs now validate vehicle types through `vehicle_master_validate_selection_v1`.
- `vehicles.vehicle_length` added; leased vehicle RPCs migrated to v2 (`*_v2`) to carry length.
- CRM conversion tracking fields exist:
  - `consigner_leads.converted_customer_id`
  - `vehicle_leads.converted_vendor_id`
- Legacy planned tables `trip_documents` and `payment_proofs` are **not present** in current schema.

## 6. RLS Status (Current Live)

RLS is **not** enabled on all tables currently.

- RLS enabled with policies:
  - `consigner_leads`, `consigner_lead_activities`
  - `trips`, `trip_owners`, `trip_stage_history`
  - `vendors`, `vehicles`, `leased_vehicle_policies`
- RLS enabled with 0 policies (effectively deny-all unless accessed via definer RPC):
  - `vehicle_master_types`, `vehicle_master_type_lengths`
- RLS disabled on remaining tables (`profiles`, `customers`, `market_rates`, `market_rate_comments`, `receivables`, `payment_requests`, `expense_entries`, `tickets`, `alerts`, `audit_logs`, etc.)

Note: because the app is RPC-first with `SECURITY DEFINER`, many operations remain controlled in function logic even where direct table RLS is limited.

## 7. RPC Catalog (Deployed)

### Auth and Admin
- `auth_get_my_profile_v1`
- `admin_list_users_v1`
- `admin_upsert_profile_v1`

### Vehicle Master
- `vehicle_master_list_v1`
- `vehicle_master_upsert_type_v1`
- `vehicle_master_set_type_active_v1`
- `vehicle_master_upsert_length_v1`
- `vehicle_master_set_length_active_v1`
- `vehicle_master_validate_selection_v1`

### Rates
- `rate_submit_v1`
- `rate_update_v1`
- `rate_get_by_id_v1`
- `rate_list_approved_v1`
- `rate_list_review_v1`
- `rate_list_mine_v1`
- `rate_review_decide_v1`
- `rate_add_comment_v1`
- `rate_list_comments_v1`
- `rate_update_comment_v1`
- `rate_delete_comment_v1`

### Trip Request
- `trip_assert_actor_v1`
- `trip_generate_code_v1`
- `trip_request_create_v1` (2 overloads)
- `trip_request_update_v1` (2 overloads)
- `trip_request_accept_v1`
- `trip_get_v1`
- `trip_list_v1`

### Consigner CRM
- `consigner_lead_create_v1`
- `consigner_lead_update_v1`
- `consigner_lead_move_stage_v1`
- `consigner_lead_add_activity_v1`
- `consigner_lead_list_activities_v1`
- `consigner_lead_get_v1`
- `consigner_lead_list_v1`
- `consigner_lead_convert_v1`
- `consigner_lead_win_convert_v1`

### Vehicle CRM
- `vehicle_lead_create_v1`
- `vehicle_lead_update_v1`
- `vehicle_lead_move_stage_v1`
- `vehicle_lead_add_activity_v1`
- `vehicle_lead_list_activities_v1`
- `vehicle_lead_get_v1`
- `vehicle_lead_list_v1`
- `vehicle_lead_onboard_v1`

### Fleet and Vendors
- `vendor_list_v1`, `vendor_list_v2`
- `fleet_vehicle_list_v1`
- `leased_vehicle_list_v1`, `leased_vehicle_list_v2`
- `leased_vehicle_get_v1`, `leased_vehicle_get_v2`
- `leased_vehicle_create_v1`, `leased_vehicle_create_v2`
- `leased_vehicle_update_v1`, `leased_vehicle_update_v2`
- `leased_vehicle_update_policy_v1`

### Customers
- `customer_assert_actor_v1`
- `customer_list_v1`
- `customer_get_v1`
- `customer_trip_history_v1`
- `customer_receivables_v1`

## 8. Notes for Ongoing Work

- Prefer v2 fleet RPCs where available (`leased_vehicle_*_v2`, `vendor_list_v2`).
- Keep Vehicle Master as canonical source for `vehicle_type` in new modules.
- If moving toward stricter direct-query access, RLS coverage should be expanded on currently unprotected tables.
