# AiravatL ERP - Rate Request Workflow Plan

Version: 1.0  
Date: February 26, 2026

## 1. Goal

Add a new rate request workflow where:

1. `sales_consigner` and `operations_consigner` can request a rate without entering price.
2. `sales_vehicles` or `operations_vehicles` can provide price on that request.
3. If `sales_vehicles` provides price, it requires review by `operations_vehicles/admin/super_admin`.
4. If `operations_vehicles/admin/super_admin` provides price, it is auto-approved.
5. Approved prices are published into Rate Library (`market_rates`) and visible in All Rates page to everyone.

## 2. Current State (Compatibility)

Current module already has:

1. `market_rates` for published/reviewed rates.
2. `rate_submit_v1`, `rate_review_decide_v1`, `rate_list_approved_v1`, etc.
3. Existing comments on `market_rates`.

Plan keeps all current behavior intact and adds request flow as a parallel pipeline.

## 3. Proposed Workflow

### 3.1 Request Phase

1. Consigner user opens `Request Rate` form (same fields as rate form except freight fields not required).
2. System creates a rate request in `open` status.

### 3.2 Pricing Phase

1. Vehicle team opens pricing queue and submits quote amount for request.
2. If actor role is `operations_vehicles/admin/super_admin`, quote is auto-approved and published.
3. If actor role is `sales_vehicles`, quote enters `pending_review`.

### 3.3 Review Phase

1. `operations_vehicles/admin/super_admin` review pending quotes from `sales_vehicles`.
2. Approve: publish to `market_rates`, request becomes `fulfilled`.
3. Reject: quote marked rejected; request remains open for re-quote.

### 3.4 Publish Phase

1. On approval, create a `market_rates` row with `status='approved'`.
2. Link request -> published rate (`published_rate_id`).
3. All users continue to see approved rates from `/rates` as today.

## 4. Role Matrix

| Action | sales_consigner | operations_consigner | sales_vehicles | operations_vehicles | admin/super_admin | support/accounts |
|---|---|---|---|---|---|---|
| Create rate request | Yes | Yes | No | No | Yes | No |
| View own requests | Yes | Yes | Yes | Yes | Yes | No |
| View all requests | No | No | Yes | Yes | Yes | No |
| Submit quote on request | No | No | Yes | Yes | Yes | No |
| Review quote | No | No | No | Yes | Yes | No |
| View all approved library rates | Yes | Yes | Yes | Yes | Yes | Yes |

## 5. Database Design

## 5.1 New enums

1. `rate_request_status`: `open`, `fulfilled`, `cancelled`
2. `rate_quote_status`: `pending_review`, `approved`, `rejected`

## 5.2 New table: `rate_requests`

Columns:

1. `id uuid pk`
2. `from_location text not null`
3. `to_location text not null`
4. `vehicle_type text not null`
5. `vehicle_type_id uuid not null`
6. `rate_category rate_category not null`
7. `notes text null`
8. `status rate_request_status not null default 'open'`
9. `requested_by_id uuid not null`
10. `requested_by_role role_type not null`
11. `published_rate_id uuid null references market_rates(id)`
12. `fulfilled_at timestamptz null`
13. `created_at timestamptz not null default now()`
14. `updated_at timestamptz not null default now()`

Indexes:

1. `(status, created_at desc)`
2. `(requested_by_id, created_at desc)`
3. `(vehicle_type_id, from_location, to_location)`

## 5.3 New table: `rate_request_quotes`

Columns:

1. `id uuid pk`
2. `rate_request_id uuid not null references rate_requests(id)`
3. `freight_rate numeric not null`
4. `rate_per_ton numeric null`
5. `rate_per_kg numeric null`
6. `confidence_level text null`
7. `source text null`
8. `remarks text null`
9. `status rate_quote_status not null`
10. `quoted_by_id uuid not null`
11. `reviewed_by_id uuid null`
12. `review_remarks text null`
13. `published_rate_id uuid null references market_rates(id)`
14. `created_at timestamptz not null default now()`
15. `updated_at timestamptz not null default now()`
16. `reviewed_at timestamptz null`

Indexes:

1. `(rate_request_id, created_at desc)`
2. `(status, created_at desc)`
3. `(quoted_by_id, created_at desc)`
4. partial unique open review guard: one `pending_review` quote per request

## 6. RPC Plan (RPC-first)

### 6.1 Request creation/listing

1. `rate_request_create_v1(...)`
2. `rate_request_list_v1(p_actor_user_id, p_status, p_search, p_limit, p_offset)`
3. `rate_request_get_v1(p_actor_user_id, p_request_id)`

Rules:

1. Only consigner roles + admin can create.
2. Vehicle master validation is mandatory (`vehicle_master_validate_selection_v1`).

### 6.2 Quote submission/listing

1. `rate_request_quote_submit_v1(...)`
2. `rate_request_quote_list_v1(p_actor_user_id, p_request_id)`
3. `rate_request_pricing_queue_v1(p_actor_user_id, p_status, p_search, p_limit, p_offset)`

Rules:

1. `sales_vehicles` quote => `pending_review`.
2. `operations_vehicles/admin/super_admin` quote => `approved` and publish immediately.

### 6.3 Quote review/publish

1. `rate_request_quote_decide_v1(p_actor_user_id, p_quote_id, p_action, p_review_remarks)`

Rules:

1. Approve action publishes one `market_rates` row and sets `rate_requests.published_rate_id`.
2. Reject action leaves request open for another quote.

### 6.4 Optional convenience

1. `rate_request_publish_latest_v1(...)` can be skipped in V1 because publish happens in submit/decide RPCs.

## 7. API Plan (Next.js)

1. `POST /api/rate-requests`
2. `GET /api/rate-requests`
3. `GET /api/rate-requests/[requestId]`
4. `POST /api/rate-requests/[requestId]/quotes`
5. `GET /api/rate-requests/[requestId]/quotes`
6. `GET /api/rate-requests/pricing-queue`
7. `POST /api/rate-requests/quotes/[quoteId]/decision`

All mutations must call RPCs only.

## 8. UI/UX Plan

## 8.1 Rate Library navigation

Add sub-navigation:

1. `All Rates` (existing approved list)
2. `Request Rate` (new form, no freight fields)
3. `Request Tracker` (consigner-focused list with status)
4. `Pricing Queue` (vehicle team queue)

## 8.2 Request Rate form

Reuse `RateUpsertForm` as base with mode toggle:

1. `mode='request'` hides freight fields.
2. location, vehicle type, category, notes stay.
3. submit CTA: `Create Request`.

## 8.3 Pricing Queue card

Card should show:

1. route + vehicle type + category
2. requester name + role + created date
3. latest quote status
4. action buttons:
   - `Add/Update Quote`
   - `Approve/Reject` (reviewer roles only)

## 8.4 Visibility UX

1. Consigner roles see their request tracker and request form.
2. Vehicle roles see pricing queue.
3. Everyone sees All Rates approved tab.

## 9. Audit and Tickets Integration

Use existing `audit_logs` on:

1. request create
2. quote submit
3. quote approve/reject
4. publish to market rates

Optional V1.1:

1. auto-ticket for pricing request assignment to vehicle sales queue.

## 10. Migration Sequence

1. Migration A: enums + new tables + indexes.
2. Migration B: request/quote RPCs.
3. Migration C: grants + helper views if needed.
4. API routes.
5. Frontend tabs/forms/queues.
6. QA with role matrix and publish-to-library verification.

## 11. Acceptance Criteria

1. Consigner sales/ops can create request without freight amount.
2. Vehicle sales can quote and quote goes to review.
3. Vehicle ops/admin quote auto-publishes without review.
4. Approved quote appears in `/rates` all rates page.
5. Rejected sales quote does not appear in all rates and request remains re-quotable.
6. Existing direct rate submit flow continues working.
