# AiravatL ERP - Trip Accounts Proof + Final Payment Completion Plan

Version: 1.0  
Date: February 26, 2026

## 1. Scope

This phase extends the current trip start + advance flow to cover:

1. Accounts marks advance payment as paid by uploading payment proof.
2. Accounts can clearly view payment method data:
   - method (`bank` / `upi`)
   - UPI QR (if uploaded)
   - request amount
   - trip total amount.
3. Vehicle ops can request final payment after advance is paid.
4. Final amount defaults to `trip_amount - paid_advance_total`.
5. Accounts uploads final payment proof and marks final payment as paid.
6. Trip is marked completed after final payment is paid.

Out of scope in this phase:

1. Ticket workflow implementation.
2. Full accounting ledger/journal posting.

## 2. Current Baseline (Already in DB)

On ERP Supabase (`supabase` MCP):

1. Migration `trip_start_advance_flow_v1` is applied.
2. `payment_requests` already has:
   - `payment_method`
   - bank fields
   - UPI fields
   - UPI QR metadata.
3. RPCs already available:
   - `trip_advance_request_create_v1`
   - `trip_advance_upi_qr_prepare_v1`
   - `trip_payment_requests_list_v1`
   - loading-proof RPCs.

Gap:

1. No accounts proof upload/paid-confirm RPC for payment requests.
2. No final-payment request RPC with default amount logic.
3. No explicit trip completion RPC tied to paid final payment.

## 3. Proposed Data Model Additions

## 3.1 `payment_requests` additions

Add columns:

1. `paid_proof_object_key text null`
2. `paid_proof_file_name text null`
3. `paid_proof_mime_type text null`
4. `paid_proof_size_bytes bigint null`
5. `paid_proof_uploaded_at timestamptz null`
6. `payment_reference text null`
7. `paid_amount numeric null` (for future partial-payment support; set = `amount` now)

Indexes:

1. `idx_payment_requests_status_type_created` on `(status, type, created_at desc)`
2. `idx_payment_requests_trip_type_paid` on `(trip_id, type, status)`

## 3.2 Optional trip completion timestamp

Add on `trips`:

1. `completed_at timestamptz null`
2. `completed_by_id uuid null references profiles(id)`

Note:

1. Keep existing stage enum for now; use `closed` as completed state in backend.
2. UI can label `closed` as `Completed`.

## 4. Business Rules

## 4.1 Advance payment paid flow

1. Only `accounts`, `admin`, `super_admin` can mark payment requests as paid.
2. Marking paid requires proof metadata + object key.
3. On success:
   - `payment_requests.status = 'paid'`
   - `reviewed_by_id`, `reviewed_at` set
   - proof columns populated.
4. If request `type = 'advance'` and trip is pre-transit stage, trip stage can move to `advance_paid` (optional transition guard).

## 4.2 Final payment request flow

1. Only trip vehicle owner (`operations_vehicles`) or admin roles can create final request.
2. Final request uses `payment_requests.type = 'balance'`.
3. Default amount:
   - `greatest(trip_amount - paid_advance_total, 0)`.
4. Prevent duplicate active final requests:
   - no other `balance` request in `pending/approved`.
5. If computed/default amount is `<= 0`, API rejects with clear message.

## 4.3 Completion flow

1. When `balance` request is marked `paid` by accounts:
   - trip stage -> `closed`
   - `completed_at`, `completed_by_id` set (if columns added)
   - stage history inserted.

## 5. RPC Plan (RPC-only business logic)

## 5.1 Accounts payment queue/read RPC

1. `trip_payment_queue_list_v1(p_actor_user_id uuid, p_status text default null, p_type text default null, p_search text default null, p_limit int default 50, p_offset int default 0)`

Returns:

1. payment request data
2. `trip_code`
3. `trip_amount`
4. method details (UPI ID, QR object key, bank summary)
5. requester/reviewer names.

Permissions:

1. `accounts`, `admin`, `super_admin`.

## 5.2 Payment proof upload RPCs

1. `trip_payment_proof_prepare_v1(p_actor_user_id uuid, p_payment_request_id uuid, p_file_name text, p_mime_type text, p_file_size_bytes bigint)`
2. `trip_payment_mark_paid_v1(p_actor_user_id uuid, p_payment_request_id uuid, p_object_key text, p_file_name text, p_mime_type text, p_file_size_bytes bigint, p_payment_reference text default null, p_paid_amount numeric default null, p_notes text default null)`

Behavior:

1. Validate actor role.
2. Validate request exists and is payable.
3. Validate R2 key pattern and file constraints.
4. Update paid/proof fields and status.
5. If request is final (`balance`) then complete trip.

## 5.3 Final payment request RPC

1. `trip_final_payment_request_create_v1(p_actor_user_id uuid, p_trip_id uuid, p_amount numeric default null, p_beneficiary text default null, p_notes text default null, p_payment_method public.payment_method default null, ...bank/upi fields...)`

Behavior:

1. Validate trip + actor ownership/admin.
2. Compute suggested amount if `p_amount` is null.
3. Enforce final amount > 0.
4. Create `payment_requests` row with `type='balance'`, `status='pending'`.
5. Return created request and computed summary.

## 5.4 Trip payment summary RPC (for UI)

1. `trip_payment_summary_v1(p_actor_user_id uuid, p_trip_id uuid)`

Returns:

1. `trip_amount`
2. `paid_advance_total`
3. `pending_advance_total`
4. `suggested_final_amount`
5. `paid_balance_total`
6. `is_trip_completed`.

## 6. API Route Plan (Next.js)

1. `GET /api/payments/queue` -> `trip_payment_queue_list_v1`
2. `POST /api/payments/[paymentRequestId]/proof/prepare` -> `trip_payment_proof_prepare_v1` + R2 presign PUT
3. `POST /api/payments/[paymentRequestId]/mark-paid` -> `trip_payment_mark_paid_v1`
4. `POST /api/trips/[tripId]/final-payment-request` -> `trip_final_payment_request_create_v1`
5. `GET /api/trips/[tripId]/payment-summary` -> `trip_payment_summary_v1`

Rule:

1. API does not directly mutate business tables; only RPC mutations.

## 7. UI/UX Plan

## 7.1 Accounts page (`/payments`)

Show queue cards/table with:

1. trip code
2. trip total amount
3. request type (`advance`/`balance`)
4. request amount
5. payment method
6. beneficiary
7. UPI QR preview if present
8. payment status.

Actions:

1. `Upload Proof + Mark Paid` for pending/approved requests.

## 7.1.1 Role UX Rules (implemented)

1. Entry points are role-specific:
   - `operations_vehicles`: Trip detail -> Payments tab (`Get Advance`, `Get Final Payment`)
   - `accounts/admin`: Payments queue page.
2. Queue is split into task-focused tabs:
   - `Pending Advance`
   - `Pending Final`
   - `Paid History`.
3. If role is not allowed for queue actions, UI shows a clear reason.
4. Every actionable card shows:
   - trip code
   - trip amount
   - request amount
   - method details
   - requester/reviewer + timestamps.
5. UPI QR and paid proof are previewable in-place via signed URLs.

## 7.2 QR visibility

1. If `upi_qr_object_key` exists, render secure image preview.
2. Preferred access:
   - backend signed-GET endpoint (short TTL), not public bucket URL.

## 7.3 Trip detail payments tab

Add:

1. Trip total amount.
2. Paid advance total.
3. Suggested final amount.
4. `Get Final Payment` button for ops vehicle owner/admin after advance paid.
5. Final/completed badge when final payment is paid.
6. Compact process strip:
   - `Vehicle Assigned -> Advance Requested -> Advance Paid -> Final Requested -> Final Paid -> Completed`.

## 8. Permissions Matrix

1. `operations_vehicles` owner:
   - create advance/final requests
   - view own trip payment records.
2. `accounts`:
   - view payment queue
   - upload proof
   - mark paid.
3. `admin/super_admin`:
   - full override.
4. `sales_consigner/operations_consigner/support`:
   - read-only by existing trip access rules; no paid action.

## 9. Suggested Implementation Order

1. Migration v2 for proof/completion columns + indexes.
2. RPCs: queue list, proof prepare/mark paid, final request, summary.
3. API routes with validation and R2 worker integration.
4. Accounts payments UI (queue + mark paid).
5. Trip detail payments tab upgrades (`Get Final Payment`, summary).
6. End-to-end QA with role matrix.

## 10. Acceptance Criteria

1. Accounts can mark advance as paid only after uploading proof.
2. Accounts can view method + QR + request amount + trip amount in one screen.
3. Vehicle ops can create final payment request with default `trip_amount - paid_advance_total`.
4. Accounts can mark final payment as paid with proof upload.
5. Final paid marks trip completed (`closed`) and shows completed state in UI.
6. All mutations are RPC-based.
