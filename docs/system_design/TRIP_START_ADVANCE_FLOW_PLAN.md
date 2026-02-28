# AiravatL ERP - Trip Start + Advance Request Flow Plan

Version: 1.2
Date: February 26, 2026

---

## 1. Scope

This phase covers post-assignment trip execution:

1. Vehicle assignment marks trip as started.
2. Assigning vehicle ops user becomes trip vehicle-ops owner.
3. Optional loading proof upload.
4. `Get Advance` flow with amount + payout method (`bank` or `upi`).
5. UPI QR upload must be reusable later for final payment (not one-time only).
6. Advance request creation is in scope; accounts ticket creation is deferred to next phase.

Core rule: RPC-first backend design, no direct business-table queries from frontend code.

---

## 2. Confirmed Baseline (Current State)

1. Trip flow implemented until `trip_assign_vehicle_v1`.
2. `trip_assign_vehicle_v1` currently sets `operations_vehicles_owner_id` only when null.
3. No explicit trip start markers (`started_at`, `started_by_id`) on `trips`.
4. `payment_requests` does not yet store full bank/UPI payout details.
5. No reusable UPI payout profile model exists yet.
6. Trip Payments/Docs tabs are still mostly mock-data driven in UI.

---

## 3. Simplified Trip Stage Model (Recommended)

To reduce stage complexity, keep active operational stages to:

1. `request_received`
2. `quoted`
3. `confirmed`
4. `vehicle_assigned`
5. `in_transit`
6. `delivered`
7. `closed`

Implementation note:

1. Do not hard-drop enum values immediately.
2. Stop using extra stages (`at_loading`, `loaded_docs_ok`, `advance_paid`, `pod_soft_received`, `vendor_settled`, `customer_collected`) for new transitions.
3. Track those process steps as data flags/events (proof uploads, payment requests, tickets), not stage hops.

---

## 4. Data Model Changes

## 4.1 `trips` (trip start marker)

Add:

1. `started_at timestamptz null`
2. `started_by_id uuid null references profiles(id)`

Optional index:

1. `idx_trips_started_by` on `(started_by_id)`

## 4.2 New `payout_profiles` (reusable payout instrument store)

Purpose: store reusable beneficiary payout details for both advance and final payment.

Columns:

1. `id uuid pk default gen_random_uuid()`
2. `beneficiary_name text not null`
3. `beneficiary_phone text null`
4. `vendor_id uuid null references vendors(id)`
5. `payment_method payment_method not null` (`bank` | `upi`)
6. Bank fields:
   - `bank_account_holder text null`
   - `bank_account_number text null`
   - `bank_ifsc text null`
   - `bank_name text null`
7. UPI fields:
   - `upi_id text null`
   - `upi_qr_object_key text null`
   - `upi_qr_file_name text null`
   - `upi_qr_mime_type text null`
   - `upi_qr_size_bytes bigint null`
   - `upi_qr_uploaded_at timestamptz null`
8. `active boolean not null default true`
9. `created_by_id uuid not null references profiles(id)`
10. `updated_by_id uuid null references profiles(id)`
11. `created_at timestamptz not null default now()`
12. `updated_at timestamptz not null default now()`

Checks:

1. `payment_method='bank'` requires bank fields.
2. `payment_method='upi'` requires one of `upi_id` or `upi_qr_object_key`.

Indexes:

1. `idx_payout_profiles_vendor_method` on `(vendor_id, payment_method, updated_at desc)`
2. `idx_payout_profiles_beneficiary` on `(beneficiary_name)`

## 4.3 `payment_requests` (link request -> payout profile + accounts ticket)

Add:

1. `payout_profile_id uuid null references payout_profiles(id)`
2. `accounts_ticket_id uuid null references tickets(id)`
3. Snapshot fields for audit consistency:
   - `payment_method payment_method null`
   - `beneficiary_snapshot text null`
   - `upi_qr_object_key_snapshot text null`

Indexes:

1. `idx_payment_requests_trip_type_status_created` on `(trip_id, type, status, created_at desc)`
2. `idx_payment_requests_accounts_ticket` on `(accounts_ticket_id)`
3. Partial unique index to prevent duplicate active advances:
   - `(trip_id)` where `type='advance' and status in ('pending','approved')`

## 4.4 New `trip_proofs` (optional loading proof)

Columns:

1. `id uuid pk default gen_random_uuid()`
2. `trip_id uuid not null references trips(id) on delete cascade`
3. `proof_type text not null` (current value: `loading`)
4. `object_key text not null`
5. `file_name text not null`
6. `mime_type text not null`
7. `file_size_bytes bigint not null`
8. `uploaded_by_id uuid not null references profiles(id)`
9. `created_at timestamptz not null default now()`

Indexes:

1. `idx_trip_proofs_trip_type_created` on `(trip_id, proof_type, created_at desc)`

---

## 5. RPC Plan

Versioned RPCs only.

## 5.1 Assignment + start

1. `trip_assign_vehicle_v2(p_actor_user_id, p_trip_id, p_vehicle_id)`
   - role: `operations_vehicles`, `admin`, `super_admin`
   - stage validation: `confirmed`
   - sets assignment details (same as v1)
   - always sets `trip_owners.operations_vehicles_owner_id = p_actor_user_id`
   - sets `trips.started_at`, `trips.started_by_id`
   - stage move only: `confirmed -> vehicle_assigned`
   - inserts `trip_stage_history`

## 5.2 Loading proof upload

2. `trip_loading_proof_prepare_v1(...)`
3. `trip_loading_proof_confirm_v1(...)`

Behavior:

1. Upload/confirm optional proof.
2. No mandatory stage transition.

## 5.3 Reusable payout profile RPCs

4. `payout_profile_upsert_v1(...)`
5. `payout_profile_list_v1(p_actor_user_id, p_search text, p_vendor_id uuid)`
6. `payout_profile_prepare_upi_qr_upload_v1(...)`
7. `payout_profile_confirm_upi_qr_upload_v1(...)`

## 5.4 Advance request (ticket deferred)

8. `trip_advance_request_create_v1(...)`

Required behavior:

1. Validate actor is trip vehicle-ops owner or admin/super_admin.
2. Validate amount and payout profile/method payload.
3. Insert `payment_requests` row with `type='advance'`, `status='pending'`.
4. Return created payment request metadata.

Important:

1. No extra trip-stage transition on advance creation in simplified model.

## 5.5 Read RPCs

9. `trip_payment_requests_list_v1(p_actor_user_id, p_trip_id)`
10. `trip_loading_proofs_list_v1(p_actor_user_id, p_trip_id)`

---

## 6. API Route Plan

Update/add route handlers:

1. `POST /api/trips/[tripId]/assign-vehicle` -> call `trip_assign_vehicle_v2`
2. `POST /api/trips/[tripId]/loading-proof/prepare`
3. `POST /api/trips/[tripId]/loading-proof/confirm`
4. `GET /api/trips/[tripId]/loading-proof`
5. `POST /api/trips/[tripId]/advance-request` -> creates payment request only
6. `GET /api/trips/[tripId]/payment-requests`
7. `GET /api/payout-profiles`
8. `POST /api/payout-profiles`
9. `POST /api/payout-profiles/upi-qr/prepare`
10. `POST /api/payout-profiles/upi-qr/confirm`

Rule:

1. API handlers call RPC only.

---

## 7. UI/UX Changes

## 7.1 Trip Detail Actions

At `vehicle_assigned`:

1. `Upload Loading Proof` (optional).
2. `Get Advance`.

## 7.2 Get Advance Dialog

Flow:

1. Enter amount.
2. Select payout method (`bank` or `upi`).
3. If `upi`:
   - enter UPI ID or upload UPI QR.
4. Submit creates advance payment request.

## 7.3 Reuse for Final Payment

Final payment screen (accounts phase) should fetch `payout_profiles` and reuse same UPI QR/profile without re-upload.

---

## 8. Permissions

| Action | operations_vehicles owner | operations_consigner | admin/super_admin | accounts | sales/support |
|---|---|---|---|---|---|
| Assign vehicle + start trip | Yes | No | Yes | No | No |
| Upload loading proof | Yes | View | Yes | View | View |
| Create payout profile | Yes | No | Yes | View | No |
| Create advance request | Yes | No | Yes | View | No |
| Receive accounts ticket (next phase) | No | No | Yes | Yes | No |

---

## 9. Migration and Compatibility Notes

1. Keep existing RPCs active (`trip_assign_vehicle_v1`) until API fully moved to v2.
2. Add new schema objects in additive migrations only.
3. Do not remove old trip enum values in this phase.
4. Hide deprecated stages in UI first, then decide enum cleanup later.

---

## 10. Implementation Order

1. Migration: add `started_at/started_by_id`, `payment_method` enum, `payout_profiles`, `payment_requests` extensions, `trip_proofs`.
2. Migration: create RPCs (`trip_assign_vehicle_v2`, payout profile RPCs, loading proof RPCs, `trip_advance_request_create_v1`).
3. API route implementation.
4. Trip detail UI for loading proof + get advance.
5. Replace trip payment/docs mock queries with TanStack Query + API.
6. QA for role matrix, duplicate advance prevention, and payout profile reuse.

---

## 11. Acceptance Criteria

1. Vehicle assignment marks trip started and sets vehicle-ops owner deterministically.
2. Vehicle ops can create advance with bank or UPI.
3. UPI QR can be uploaded once and reused in later final payment flow.
4. Ticket creation is intentionally deferred and will be added in the next phase.
5. No additional trip stage hops are required for loading proof or advance creation.
