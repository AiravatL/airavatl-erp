# AiravatL ERP - Customers Module Plan

Version: 1.0  
Date: February 25, 2026

## 1. Scope
- Replace mock-data Customers screens with DB-backed implementation.
- Keep module UX similar to Fleet (search + filters + table/cards + detail).
- No `Add Customer` button on customers list.
- Customer creation source remains:
  - Consigner CRM conversion (`lead -> customer`)
  - Optional controlled import/migration (admin-only, separate flow)

## 2. Current Gaps
- `src/app/(app)/customers/page.tsx` uses `CUSTOMERS` mock data and shows `Add Customer`.
- `src/app/(app)/customers/[customerId]/page.tsx` uses mock `CUSTOMERS`, `TRIPS`, `RECEIVABLES`.
- No RPC/API layer for customers list/detail.
- No TanStack query keys for customers.

## 3. Target UX

### 3.1 Customers List (`/customers`)
- Header: `Customers` + count only (no add action).
- Search: by customer name, GSTIN, sales owner.
- Filters:
  - Status: `all | active | inactive`
  - Owner: sales consigner owner (optional)
  - Credit health: `within_limit | over_limit` (optional)
- Views:
  - Desktop table: customer, owner, active trips, outstanding, credit terms, status.
  - Mobile cards: same summary.
- Row click -> customer detail page.

### 3.2 Customer Detail (`/customers/[customerId]`)
- Summary cards:
  - profile (name/address/GSTIN/status)
  - credit terms (days + limit)
  - outstanding
  - sales owner
- Sections:
  - Trip history (latest first)
  - Receivables list and aging snapshot
- Actions:
  - `New Trip` allowed by trip permissions
  - optional `Activate/Deactivate` for admin/super_admin

## 4. Roles and Access
- `super_admin`, `admin`, `sales_consigner`, `accounts`, `support`:
  - view all customers
- `sales_consigner`:
  - can edit limited profile fields only for assigned customers (optional phase-2)
- `admin`, `super_admin`:
  - can update customer master fields (`active`, credit terms, owner)
- `operations_*`, `sales_vehicles`:
  - read-only access if business wants visibility; otherwise hide menu by role

## 5. RPC Design (Supabase)

Use RPC-only data access from Next.js API routes.

- `customer_list_v1(
    p_actor uuid,
    p_search text default null,
    p_status text default null,
    p_owner_id uuid default null,
    p_credit_health text default null,
    p_limit int default 100,
    p_offset int default 0
  )`
  - returns paged rows with computed:
    - `active_trips_count`
    - `outstanding_amount`
    - `credit_utilization_pct`
  - enforces actor role checks.

- `customer_get_v1(
    p_actor uuid,
    p_customer_id uuid
  )`
  - single customer profile + computed metrics.

- `customer_trip_history_v1(
    p_actor uuid,
    p_customer_id uuid,
    p_limit int default 50,
    p_offset int default 0
  )`
  - trip code, route, stage, dates, amounts.

- `customer_receivables_v1(
    p_actor uuid,
    p_customer_id uuid,
    p_limit int default 50,
    p_offset int default 0
  )`
  - due dates, pending/collected, aging bucket.

- `customer_update_v1(
    p_actor uuid,
    p_customer_id uuid,
    p_name text default null,
    p_address text default null,
    p_gstin text default null,
    p_credit_days int default null,
    p_credit_limit numeric default null,
    p_sales_owner_id uuid default null,
    p_active boolean default null
  )`
  - admin/super_admin write access only.
  - partial update behavior.

## 6. API Routes (Next.js)
- `GET /api/customers`
  - query params: `search`, `status`, `ownerId`, `creditHealth`, `limit`, `offset`
  - calls `customer_list_v1`
- `GET /api/customers/[customerId]`
  - calls `customer_get_v1`
- `GET /api/customers/[customerId]/trips`
  - calls `customer_trip_history_v1`
- `GET /api/customers/[customerId]/receivables`
  - calls `customer_receivables_v1`
- `PATCH /api/customers/[customerId]`
  - calls `customer_update_v1` (admin/super_admin only)

## 7. Frontend Integration
- Add API client:
  - `src/lib/api/customers.ts`
- Add query keys:
  - `queryKeys.customers(filters)`
  - `queryKeys.customer(customerId)`
  - `queryKeys.customerTrips(customerId, paging)`
  - `queryKeys.customerReceivables(customerId, paging)`
- Replace mock data usage in:
  - `src/app/(app)/customers/page.tsx`
  - `src/app/(app)/customers/[customerId]/page.tsx`
- Remove `Add Customer` button from list screen.
- Keep list/detail responsive table + card parity.

## 8. Compatibility and Safety
- No destructive schema change required.
- Keep `consigner_lead_win_convert_v1` / conversion RPCs as primary customer creation path.
- Ensure `customers.sales_consigner_owner_id` role validation still allows `admin/super_admin` assignments where required.
- Add/verify indexes:
  - `customers(name)`
  - `customers(active)`
  - `customers(sales_consigner_owner_id)`
  - receivables/trips indexes by `customer_id`

## 9. Delivery Steps
1. Create customer RPC migration (v1 functions + grants).
2. Add API routes under `src/app/api/customers/*`.
3. Add `src/lib/api/customers.ts` and query keys.
4. Rebuild customers list/detail pages on TanStack Query.
5. Remove `Add Customer` action from customers list.
6. Add role-gated edit actions for admin/super_admin only.
7. Validate with seeded data + consigner-converted customers.

## 10. Acceptance Criteria
- Customers screens no longer use mock data.
- No `Add Customer` button appears in customers list.
- List filtering works for status/owner/search.
- Detail shows live trip + receivable data.
- APIs use RPC only (no direct table queries in route handlers).
- Existing consigner conversion-created customers appear automatically.
