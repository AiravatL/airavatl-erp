# AiravatL ERP - Rate Library Plan (V2)

Version: 2.0  
Date: February 26, 2026

## 1. Scope

Rate module now has two input flows that publish into the same approved library.

1. Direct rate submission by vehicle team.
2. Request-rate flow started by consigner team, then priced by vehicle team.

All users can view approved rates in `All Rates`.

## 2. Canonical Behavior

### 2.1 Direct Submit Flow (existing)

1. `sales_vehicles` submits rate -> `pending` -> review required.
2. `operations_vehicles/admin/super_admin` submits rate -> auto-approved.
3. Approved rate is visible in `/rates`.

### 2.2 Request-Rate Flow (new)

1. `sales_consigner` or `operations_consigner` creates request using same route/vehicle/category form but without freight amount.
2. Vehicle team adds quote amount on request.
3. Quote by `sales_vehicles` -> review required.
4. Quote by `operations_vehicles/admin/super_admin` -> no review (auto-approved).
5. Approved quote is published into `market_rates` and visible in `/rates`.

## 3. Role Access Matrix

| Action | sales_consigner | operations_consigner | sales_vehicles | operations_vehicles | admin/super_admin | others |
|---|---|---|---|---|---|---|
| Create direct rate | No | No | Yes | Yes | Yes | No |
| Create rate request | Yes | Yes | No | No | Yes | No |
| Add quote on request | No | No | Yes | Yes | Yes | No |
| Review quote | No | No | No | Yes | Yes | No |
| View approved all rates | Yes | Yes | Yes | Yes | Yes | Yes |

## 4. Data Model Strategy

## 4.1 Published library

Keep `market_rates` as the only published-rate source of truth.

## 4.2 Request workflow (new)

Add request workflow tables (detailed in `docs/system_design/RATE_REQUEST_WORKFLOW_PLAN.md`):

1. `rate_requests`
2. `rate_request_quotes`

Reason:

1. Avoids breaking existing `market_rates` RPCs/UI.
2. Clean separation between request lifecycle and published rates.
3. Easier audit and SLA tracking.

## 5. RPC Strategy

## 5.1 Existing RPCs (keep)

1. `rate_submit_v1`
2. `rate_update_v1`
3. `rate_list_approved_v1`
4. `rate_list_review_v1`
5. `rate_review_decide_v1`
6. comments RPCs

## 5.2 New request RPCs (add)

1. `rate_request_create_v1`
2. `rate_request_list_v1`
3. `rate_request_get_v1`
4. `rate_request_quote_submit_v1`
5. `rate_request_quote_list_v1`
6. `rate_request_pricing_queue_v1`
7. `rate_request_quote_decide_v1`

Publish rule:

1. Approval path creates one approved `market_rates` row.
2. Request and quote rows store `published_rate_id` linkage.

## 6. API Plan

## 6.1 Existing routes (keep)

1. `POST /api/rates`
2. `GET /api/rates`
3. `GET /api/rates/review`
4. `POST /api/rates/[rateId]/decision`
5. comment routes

## 6.2 New routes (add)

1. `POST /api/rate-requests`
2. `GET /api/rate-requests`
3. `GET /api/rate-requests/[requestId]`
4. `POST /api/rate-requests/[requestId]/quotes`
5. `GET /api/rate-requests/[requestId]/quotes`
6. `GET /api/rate-requests/pricing-queue`
7. `POST /api/rate-requests/quotes/[quoteId]/decision`

All writes remain RPC-only.

## 7. UI/UX Plan

Rate module tabs:

1. `All Rates` (approved library, everyone)
2. `Submit Rate` (vehicle team direct flow)
3. `Request Rate` (consigner flow, no freight field)
4. `Request Tracker` (consigner request history/status)
5. `Pricing Queue` (vehicle pricing + review)

Reuse `RateUpsertForm` with `mode='request'` to hide freight fields.

## 8. Compatibility and Rollout

1. Keep existing direct submit/review pages operational.
2. Add request workflow in parallel.
3. Verify publish linkage by checking request quote approval inserts approved `market_rates` row.
4. Continue showing only approved rows in `/rates`.

## 9. Detailed Request Design

Detailed schema/RPC/API breakdown for request workflow is tracked in:

`docs/system_design/RATE_REQUEST_WORKFLOW_PLAN.md`
