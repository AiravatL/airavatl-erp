# Trip Upload Remediation (2026-02-27)

## Scope
This remediation closes the upload/security gaps identified in the trip proof and payment proof flow.

## Implemented Changes

1. `trip_proofs` security
- RLS remains enabled.
- Added explicit service-role policy:
  - `trip_proofs_service_role_all_v1`

2. `trip_proofs` proof type constraint
- Updated `trip_proofs_proof_type_chk` to:
  - `proof_type in ('loading', 'pod')`

3. Worker doc type for payment proofs
- API now uses `payment-proof` (already corrected before this remediation).

4. Canonical object key flow
- API now uses RPC-returned canonical object keys for:
  - loading proof prepare
  - payment proof prepare
  - UPI QR prepare
- Worker is now called with `objectKey`.
- If worker returns a different key, API returns `502` to prevent metadata/file-key drift.

5. Audit logs
- Confirmed in DB RPCs:
  - `trip_loading_proof_confirm_v1` inserts `audit_logs`
  - `trip_payment_mark_paid_v1` inserts `audit_logs`
- New POD confirm RPC also inserts `audit_logs`.

6. Worker auth model
- API no longer forwards user Supabase JWT to worker.
- API now uses server-side shared secret from:
  - `R2_PRESIGN_WORKER_SHARED_SECRET`
- Headers sent:
  - `X-R2-Worker-Secret`
  - `Authorization: Bearer <shared-secret>` (compatibility fallback)

7. Server in-memory signed URL cache
- Removed in-memory map cache from payment object-view route.
- Route now always requests a fresh short-lived signed URL from worker.

8. POD upload implementation
- Added POD prepare/confirm RPCs:
  - `trip_pod_proof_prepare_v1`
  - `trip_pod_proof_confirm_v1`
- Added APIs:
  - `POST /api/trips/[tripId]/pod-proof/prepare`
  - `POST /api/trips/[tripId]/pod-proof/confirm`
- Added UI:
  - POD upload action in Trip Docs tab
  - POD upload dialog
- POD is optional and not required for trip completion.

## Migration
- Added and applied migration:
  - `supabase/migrations/20260227123000_trip_proofs_pod_and_worker_alignment_v1.sql`

## Intentional Non-Change
- `payment_proofs` table is still not introduced.
- Current model remains `payment_requests` proof columns (1:1 proof per payment request).
