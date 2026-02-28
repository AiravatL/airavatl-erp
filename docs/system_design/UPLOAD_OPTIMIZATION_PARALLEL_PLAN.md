# Upload Optimization and Parallel Processing Plan (ERP)

## Implementation Status (2026-02-26)

Implemented now (Phase A quick wins):

- Shared client upload utility with retry + timeout + progress callbacks.
- Shared client image optimization utility (resize/compress) before upload.
- Signed file view URL caching (memory + persistent local storage) with expiry safety.
- On-demand preview fetch (lazy) instead of eager fetch per card render.
- Integrated into:
  - loading proof upload dialog
  - advance request UPI QR upload
  - final payment request UPI QR upload
  - accounts payment proof upload dialog
  - payments queue preview dialogs

Still pending:

- batch endpoints (`prepare-many`, `presign-many`, `confirm-many`)
- batch RPCs (`*_many_v1`)
- cross-module upload queue/persistence and dedup

## 1. Objective

Make ERP document/image uploads fast and reliable by default.

Targets:

- Reduce end-to-end upload time per file by 30-50%
- Support parallel multi-file upload safely
- Keep server/RPC pattern unchanged (`API -> RPC -> DB`)

This plan complements:

- `docs/system_design/CLOUDFLARE_R2_DOCUMENT_UPLOAD_PLAN.md`

Required business behavior in this phase:

- Payment proofs are required for:
  - advance payment
  - final/balance payment
- Trip proofs are optional:
  - loading
  - POD

## 2. What to Optimize

Current slow points in upload flows are typically:

1. Client-side file processing (resize/compress)
2. Sequential presign calls
3. Sequential PUT uploads
4. Sequential confirm calls

For multi-file uploads, these steps must run in parallel where independent.

## 3. Parallel Upload Strategy

## 3.1 Batch First, Then Concurrent PUT

Recommended flow for N files:

1. `prepare-many` (single request) -> returns N upload intents (`object_key`, validation result).
2. `presign-many` (single API call to worker through ERP API) -> returns N signed PUT URLs.
3. Upload files with bounded concurrency (default `3`, max `4`).
4. Confirm each successful file (batched or per-file with queue).

This removes request waterfalls and cuts network round-trips.

Implementation note:

- Keep worker URL/endpoints in environment configuration; do not hardcode host/base URL.

## 3.2 Concurrency Controls

- Default concurrent uploads: `3`
- Reduce to `2` on slow network/mobile (`effectiveType` contains `2g`/`3g`)
- Increase to `4` on fast broadband only
- Never unbounded parallelism

## 3.3 Failure Isolation

- One file failure must not fail all files
- Use `Promise.allSettled` for upload + confirm stages
- Show per-file status: `queued | uploading | confirming | done | failed`

## 4. Client-Side Optimization Rules

## 4.1 Image Optimization

Before upload:

- Normalize orientation
- Resize long edge to 1280px (or 960px for proof-only screens)
- JPEG/WebP quality: `0.65 - 0.75`
- Target size:
  - photos: <= 400 KB (ideal), <= 1.5 MB (hard cap)

## 4.2 Document Optimization

- PDF: keep original, but hard-cap size (10 MB default)
- Reject unsupported formats before prepare step
- Optional future: server-side PDF compression pipeline

## 4.3 Hashing and Dedup (optional v2)

- Compute SHA-256 client-side for files <= 10 MB
- Skip upload if same hash already linked to same entity/doc_type

## 5. API and RPC Changes for Parallelism

## 5.1 New API Endpoints

- `POST /api/uploads/prepare-many`
- `POST /api/uploads/presign-many`
- `POST /api/uploads/confirm-many`

## 5.2 New RPCs

- `file_prepare_upload_many_v1(p_actor uuid, p_items jsonb)`
- `file_confirm_upload_many_v1(p_actor uuid, p_items jsonb)`

`p_items` contains module/entity/doc metadata arrays.

RPC rules:

- Validate each item independently
- Return structured per-item result (ok/error)
- Keep audit logs per successful item

## 6. UI/UX Performance Rules

- Start upload immediately after file selection (no blocking modal chains)
- Use one compact progress section instead of noisy step-by-step text
- Show aggregate summary: `7/10 uploaded`
- Allow retry for failed items only
- Keep form usable while uploads continue (non-blocking)
- For payment mark-as-paid actions: block submit until required proof upload is confirmed
- For loading/POD: show upload as optional in UI, no hard stage block

## 7. Retry, Timeout, and Queue

- PUT timeout: 60s (configurable by file size)
- Retry count: 2 (3 total attempts)
- Backoff: 500ms, 1500ms (+ jitter)
- Persist queue in memory first; optional local persistence in v2

## 8. Security and Guardrails

- Presigned URL TTL: <= 5 min
- Max files per batch: 10
- Max total batch payload: 40 MB
- Validate MIME + extension + declared doc_type
- Confirm step must verify object_key prefix and actor access

## 9. Observability (Mandatory)

Track per file:

- `prepare_ms`
- `presign_ms`
- `upload_ms`
- `confirm_ms`
- `file_size_bytes`
- `mime_type`
- `result`

Track per batch:

- total files
- successful files
- failed files
- total elapsed ms

Store metrics in app logs + optional analytics event stream.

## 10. Suggested Defaults

- `MAX_FILE_MB_IMAGE = 5`
- `MAX_FILE_MB_DOC = 10`
- `BATCH_MAX_FILES = 10`
- `UPLOAD_CONCURRENCY = 3`
- `PRESIGN_TTL_SECONDS = 300`

## 11. Implementation Phases

### Phase A (Quick wins)

- Client image compression tuning
- Bounded parallel PUT uploads (`Promise.allSettled` + queue)
- Per-file retry UI

### Phase B (Core parallel backend)

- `prepare-many`, `presign-many`, `confirm-many`
- Batch RPCs
- Unified upload store/hook for all modules

### Phase C (Advanced)

- Hash dedup
- resumable uploads for large docs
- background queue persistence

## 12. Acceptance Criteria

- 5-file mixed batch completes in <= 12s on good network
- Failed file retry works without re-uploading successful files
- No direct DB writes from client routes (RPC-only remains intact)
- All uploaded files have audit entries and valid metadata rows
- Cannot mark advance/final payment as paid without proof
- Loading/POD upload controls work independently as optional artifacts
