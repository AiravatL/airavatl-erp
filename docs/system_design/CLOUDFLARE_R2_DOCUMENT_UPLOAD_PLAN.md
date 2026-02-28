# Cloudflare R2 Document Upload Plan (ERP)

## 1. Purpose

Define how ERP will implement document/image upload using the same Cloudflare account already used by other AiravatL apps, while keeping ERP secure, RPC-first, and audit-friendly.

## 2. Source Pattern from `airavatlApp` (Supabase MCP Verified)

Observed in `airavatlApp` DB:

- Tables: `trip_proofs`, `trip_documents`
- RPCs: `confirm_proof_upload`, `confirm_pod_upload`, `get_trip_proofs`, plus trip status marker RPCs
- `trip_proofs` stores: `object_key`, `external_url`, `file_name`, `file_size_bytes`, geo fields, `expires_at`
- Confirm RPC pattern updates trip-level proof flags atomically after metadata insert

For ERP we will reuse the same pattern with tighter separation for payment proofs.

## 3. ERP Current State (Gap)

Current ERP DB has file path columns but no full document-upload module:

- `expense_entries.receipt_file_path`
- `odometer_checkpoints.photo_path`
- `ticket_comments.attachment_path`

And ERP lacks upload module tables for:

- trip operational proofs (`loading`, `pod`)
- payment proofs (`advance`, `final/balance`)

So, uploads should be implemented as a first-class module, not ad-hoc per page.

## 4. Architecture (ERP)

Recommended flow:

1. Client requests presign from ERP API route.
2. ERP API validates session/role, then calls Cloudflare Worker presign endpoint.
3. Client uploads directly to R2 (PUT).
4. Client calls ERP confirm API route.
5. ERP confirm API calls RPC (no direct table writes) to persist metadata and update workflow state.

Why this variant:

- Keeps auth/authorization centralized in ERP API + RPC.
- Keeps browser free from R2 credentials.
- Preserves existing ERP pattern: `API -> RPC -> DB`.

## 5. Bucket and Key Strategy (Configured)

You created a dedicated bucket: `airavatl-erp`.

Use the same Cloudflare account with strict ERP key namespace.

Bucket access must remain private.

### Object key format

- `erp/{module}/{entity_id}/{doc_type}/{yyyy}/{mm}/{timestamp}_{uuid}.{ext}`

Examples:

- `erp/trip-proofs/{trip_id}/loading/2026/02/1709050000_a1b2.jpg`
- `erp/trip-proofs/{trip_id}/pod/2026/02/1709050000_c3d4.jpg`
- `erp/payment-proofs/{payment_request_id}/advance/2026/02/1709050000_e5f6.pdf`
- `erp/payment-proofs/{payment_request_id}/final/2026/02/1709050000_g7h8.jpg`

Important: keep endpoint/host values in environment variables; never hardcode URLs in app code or docs.

Required env vars:

- `CLOUDFLARE_R2_BUCKET=airavatl-erp`
- `CLOUDFLARE_R2_S3_ENDPOINT` (base endpoint)
- `CLOUDFLARE_R2_ACCOUNT_ID`
- `CLOUDFLARE_R2_ACCESS_KEY_ID`
- `CLOUDFLARE_R2_SECRET_ACCESS_KEY`
- `R2_PRESIGN_WORKER_URL`
- `R2_PRESIGN_WORKER_SHARED_SECRET`

## 6. Retention Policy

Do not blindly copy 90 days for ERP.

Recommended by module:

- Operational media (temporary): 90-180 days
- Financial/compliance docs (invoice, POD, payment proofs): 1 year minimum (or per legal policy)

Action needed: finalize retention with business/compliance before lifecycle rules are enabled.

## 7. Database Changes (Updated Scope)

## 7.1 Create `trip_proofs` (loading/POD optional)

Suggested columns:

- `id uuid pk`
- `trip_id uuid not null fk trips(id) on delete cascade`
- `proof_type text not null` (`loading` | `pod`)
- `file_name text`
- `mime_type text`
- `file_size_bytes bigint`
- `storage_provider text not null default 'cloudflare_r2'`
- `object_key text not null`
- `external_url text` (optional for compatibility; object key is canonical)
- `uploaded_by_id uuid fk profiles(id)`
- `uploaded_at timestamptz`
- `latitude numeric` (optional)
- `longitude numeric` (optional)
- `expires_at timestamptz`
- `created_at timestamptz default now()`
- `updated_at timestamptz default now()`

Constraints/indexes:

- index `(trip_id, proof_type, created_at desc)`
- index `(expires_at)`
- optional unique `(trip_id, proof_type)` only if latest-only storage is required

## 7.2 Create `payment_proofs` (required for advance/final payment closure)

Suggested columns:

- `id uuid pk`
- `payment_request_id uuid not null fk payment_requests(id) on delete cascade`
- `proof_kind text not null` (`advance` | `final`)
- `file_name text`
- `mime_type text`
- `file_size_bytes bigint`
- `storage_provider text not null default 'cloudflare_r2'`
- `object_key text not null`
- `payment_mode text`
- `payment_reference text`
- `paid_at timestamptz`
- `uploaded_by_id uuid not null fk profiles(id)`
- `created_at timestamptz default now()`

Constraints/indexes:

- index `(payment_request_id, created_at desc)`
- index `(proof_kind)`
- optional unique `(payment_request_id)` if only one proof row should exist per request

Workflow rule:

- For `payment_requests.type in ('advance','balance')`, proof is required before marking `status='paid'`.
- `loading` and `pod` proofs remain optional uploads.

## 8. RPC Design (Required)

Implement via Supabase migrations.

### 8.1 Presign-intent RPCs

- `trip_proof_prepare_upload_v1(p_actor, p_trip_id, p_proof_type, p_file_name, p_mime_type, p_file_size_bytes)`
- `payment_proof_prepare_upload_v1(p_actor, p_payment_request_id, p_file_name, p_mime_type, p_file_size_bytes)`

Responsibilities:

- Validate role and ownership/stage permissions
- Validate file type/size
- Return canonical `object_key` and upload policy payload

### 8.2 Confirm RPCs

- `trip_proof_confirm_upload_v1(p_actor, p_trip_id, p_proof_type, p_object_key, p_file_name, p_mime_type, p_file_size_bytes, p_latitude, p_longitude)`
- `payment_proof_confirm_upload_v1(p_actor, p_payment_request_id, p_object_key, p_file_name, p_mime_type, p_file_size_bytes, p_payment_mode, p_payment_reference, p_paid_at)`

Responsibilities:

- Validate object key prefix for entity/module
- Upsert metadata row using RPC only
- Update workflow flags atomically:
  - `loading` -> set trip loading proof marker fields
  - `pod` -> set trip POD marker fields
  - payment proof -> allow payment status transition to `paid`
- Write `audit_logs`

### 8.3 View URL RPC (optional)

If we want RPC-mediated download tokens:

- `file_get_view_url_v1(p_actor, p_object_key)`

(Alternative: API route calls worker directly after access checks.)

## 9. API Routes (Next.js)

Add ERP routes:

- `POST /api/uploads/presign`
- `POST /api/uploads/confirm`
- `POST /api/uploads/view-url`

Request payload includes module context:

- `module`: `trip_proof | payment_proof`

Route behavior:

- Validate auth with existing store/session flow
- Call relevant prepare/confirm RPC
- Call worker for signed URL generation using server env config
- Return only required URL + metadata

## 10. Cloudflare Worker Contract

Endpoints:

- `POST /presign/put`
- `POST /presign/get`

Inputs from ERP API:

- `object_key`
- `content_type`
- `expires_in`

Security controls:

- Worker auth via shared secret header from ERP server (not client JWT)
- Bucket remains private
- CORS only for ERP domains
- Worker/bucket identifiers injected via env variables only

## 11. Validation Rules

Minimum rules to enforce in RPC/API:

- Allowed types: `pdf`, `jpg`, `jpeg`, `png`, `webp`
- Max size:
  - docs: 10 MB
  - images: 5 MB
- Reject executable/content-type mismatch
- Strict object-key prefix check by module and entity
- Signed URL TTL <= 5 minutes

## 12. UI Integration Points (ERP)

Phase 1 targets:

- Trip detail docs tab: `src/app/(app)/trips/[tripId]/docs-tab.tsx`
- Payment proof upload in payments flow:
  - advance payment proof (required to mark paid)
  - final/balance payment proof (required to mark paid)
- Trip proof upload controls:
  - loading proof (optional)
  - POD proof (optional)

Phase 2 targets:

- Ticket attachments (`ticket_comments.attachment_path`)
- Expense receipts (`expense_entries.receipt_file_path`)
- Odometer photos (`odometer_checkpoints.photo_path`)

## 13. Implementation Phases

### Phase 1: Infra + Required Payment + Optional Trip Proofs

- Create bucket/prefix and lifecycle
- Deploy worker
- Add `trip_proofs` + `payment_proofs` tables
- Add prepare/confirm RPCs
- Add `/api/uploads/*` routes
- Implement payment proof required flow + optional loading/POD upload UI

### Phase 2: Existing Path-Column Modules

- Migrate ticket/expense/odometer uploads to same presign/confirm flow
- Keep backward compatibility for old path columns

### Phase 3: Hardening

- Virus scan hook (optional)
- Thumbnail generation for images
- Retry + orphan cleanup job
- Usage metrics and alerting

## 14. Non-Negotiables

- No direct table writes from frontend/server routes (RPC only)
- No public bucket ACL
- No long-lived signed URLs
- All upload confirms must create audit trail

## 15. Open Decisions

- Final retention by doc type
- Separate ERP bucket vs shared bucket with prefix isolation
- Whether to include inline malware scanning in v1
- Whether to enforce one-file-per-doc-type or keep full version history in table
