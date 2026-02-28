# Reports Module Plan (Charts + Subpages)

Version: 1.0  
Date: 2026-02-28

## 1. Objective
1. Replace current placeholder `/reports` with production-grade analytics.
2. Add report subpages with actionable charts and tables.
3. Keep architecture RPC-first and API-layer only (no direct table queries in frontend).

## 2. Scope
1. Reports landing page: KPI overview + quick chart snapshots.
2. Subpages:
   - `/reports/trip-pnl`
   - `/reports/fuel-variance`
   - `/reports/expense-summary`
   - `/reports/utilization`
   - `/reports/sales-performance`
   - `/reports/receivables-aging`
3. CSV export for each subpage.
4. Shared filter bar for date range and ownership filters.

## 2.1 Locked Report Requirements
1. `Trip P&L Report`
   - Leased trip profitability analysis with expected vs actual costs.
2. `Fuel Variance Report`
   - Fuel consumption analysis against expected ranges per route.
3. `Expense Summary`
   - Category-wise expense breakdown with cap analysis.
4. `Utilization Report`
   - Leased fleet utilization, idle days, and trip frequency.
5. `Sales Performance`
   - Trip volume, revenue, and collection metrics by salesperson.
6. `Receivables Aging`
   - Outstanding receivables with aging analysis by customer.

## 3. Access Control
1. Keep current access roles: `super_admin`, `admin`, `accounts`.
2. Optional later phase:
   - `sales_consigner` sees only own sales-performance slice.
   - `operations_vehicles` sees only utilization/fuel slices.

## 4. Frontend UX Plan
## 4.0 Information Architecture (Hard Rule)
1. Reports data must not be implemented as one giant single page.
2. Use:
   - `/reports` as overview only (KPI + snapshots + links)
   - dedicated category subpages for full report analysis.
3. Overview page should show summaries and “Open Report” actions, not full drilldown tables for every category.
4. Each category subpage owns its own filters, charts, table, and export action.

## 4.1 Reports Landing (`/reports`)
1. Top filter strip:
   - `Date Range` (preset + custom)
   - `Owner` (optional)
   - `Vehicle Type` (optional)
2. KPI cards:
   - Total trips
   - Closed trips
   - Revenue
   - Total expenses
   - Gross margin %
   - Outstanding receivables
3. Snapshot charts:
   - Trips trend (line)
   - Revenue vs Expense (dual bar)
   - Receivables aging donut
   - Payment status stacked bar
4. Report cards link to subpages (not static tiles).

## 4.2 Subpage Design Pattern
1. Each report page includes:
   - Header + last updated timestamp
   - Chart area
   - Drilldown table
   - Export CSV button
2. Mobile:
   - Single-column chart stack
   - Horizontal scroll for wide tables
3. Empty states:
   - Explicit “No data in selected period” messaging.

## 5. Chart Library
1. Use `recharts` for V1.
2. Shared chart wrappers in `src/components/reports/charts/*`:
   - `LineTrendChart`
   - `StackedBarChart`
   - `DonutChart`
   - `VarianceScatterChart` (or grouped bar fallback)
3. Shared formatting:
   - Currency labels via existing `formatCurrency`
   - Compact number formatter for axes/tooltips.

## 6. RPC + API Design (RPC-Only Data Access)
## 6.1 Shared RPC input
1. `p_actor_user_id uuid`
2. `p_from_date date`
3. `p_to_date date`
4. Optional slices:
   - `p_vehicle_type text default null`
   - `p_owner_id uuid default null`

## 6.2 New RPCs
1. `report_overview_v1(...)`
   - Returns KPI cards + small chart datasets.
2. `report_trip_pnl_v1(...)`
   - Returns per-trip P&L rows + summary buckets.
3. `report_fuel_variance_v1(...)`
   - Returns expected vs actual fuel/cost variance.
4. `report_expense_summary_v1(...)`
   - Returns category totals, cap breaches, monthly trend.
5. `report_utilization_v1(...)`
   - Returns vehicle utilization %, idle days, trips per vehicle.
6. `report_sales_performance_v1(...)`
   - Returns owner-wise revenue, trips, margin, collection ratio.
7. `report_receivables_aging_v1(...)`
   - Returns aging buckets, overdue totals, customer-wise outstanding.

## 6.3 API Routes
1. `GET /api/reports/overview`
2. `GET /api/reports/trip-pnl`
3. `GET /api/reports/fuel-variance`
4. `GET /api/reports/expense-summary`
5. `GET /api/reports/utilization`
6. `GET /api/reports/sales-performance`
7. `GET /api/reports/receivables-aging`
8. `GET /api/reports/{slug}/export` (CSV response)

All routes:
1. Use `requireReportActor()` shared auth helper.
2. Call corresponding RPC.
3. Normalize and return `{ ok, data, meta }`.

## 7. Data Source Mapping (Current Schema)
1. Trips + stages: `trips`, `trip_stage_history`
2. Payments: `payment_requests`
3. Expenses: `expense_entries`
4. Receivables: `receivables`
5. Ownership: `trip_owners`, `profiles`
6. Fleet/vehicle dimensions: `vehicles`, `vendors`, `vendor_drivers`
7. Policy/cap context: `leased_vehicle_policies`

## 8. Known Data Gaps and Guardrails
1. Fuel variance may be incomplete if odometer/fuel capture is partial.
2. Report RPCs should return `data_quality` metadata:
   - `% rows with complete inputs`
   - warnings for low-confidence metrics.
3. Subpages should surface quality warnings clearly.

## 8.1 Readiness and TODO Mapping
1. `Trip P&L Report`
   - Status: `PARTIAL`
   - TODO:
   - expected-cost baseline standardization for all vehicle types
   - actual-cost completeness checks from `expense_entries`
2. `Fuel Variance Report`
   - Status: `TODO`
   - TODO:
   - enforce checkpoint/fuel capture completeness
   - define expected fuel model per route/vehicle/policy
3. `Expense Summary`
   - Status: `PARTIAL`
   - TODO:
   - cap-breach drilldowns and policy-linked variance details
4. `Utilization Report`
   - Status: `PARTIAL`
   - TODO:
   - idle-day definition finalization and leased-vehicle normalization
5. `Sales Performance`
   - Status: `PARTIAL`
   - TODO:
   - collection linkage and owner attribution edge cases
6. `Receivables Aging`
   - Status: `TODO` (explicitly track as pending until full receivables workflows are complete)
   - TODO:
   - aging bucket accuracy and overdue workflow alignment
   - customer follow-up status integration in report filters

## 9. Performance Plan
1. Add indexes for heavy report scans:
   - `trips(current_stage, schedule_date, completed_at)`
   - `payment_requests(trip_id, status, type, created_at)`
   - `expense_entries(trip_id, category, created_at)`
   - `receivables(collected_status, due_date, created_at)`
2. Cap default date range (example: last 90 days).
3. Pagination for drilldown tables.
4. TanStack query cache keys by filter object.

## 10. Frontend File Plan
1. API client:
   - `src/lib/api/reports.ts`
2. Query keys:
   - add `reportOverview`, `reportTripPnl`, etc in `src/lib/query/keys.ts`
3. Pages:
   - `src/app/(app)/reports/page.tsx` (overview)
   - `src/app/(app)/reports/trip-pnl/page.tsx`
   - `src/app/(app)/reports/fuel-variance/page.tsx`
   - `src/app/(app)/reports/expense-summary/page.tsx`
   - `src/app/(app)/reports/utilization/page.tsx`
   - `src/app/(app)/reports/sales-performance/page.tsx`
   - `src/app/(app)/reports/receivables-aging/page.tsx`
4. Routing/Navigational model:
   - Overview card grid links to each subpage
   - Optional left-side secondary nav within reports section for fast switching
   - Browser URL should always reflect current category page
5. Shared components:
   - `src/components/reports/filter-bar.tsx`
   - `src/components/reports/kpi-card.tsx`
   - `src/components/reports/charts/*`
   - `src/components/reports/drilldown-table.tsx`

## 11. Rollout Phases (Updated)
1. Phase 0: Requirement Lock + TODO Visibility
   - Keep six report definitions exactly as listed in section 2.1
   - Add status badges on report cards/subpages: `Ready`, `Partial`, `TODO`
2. Phase 1: Implement Ready/Partial Core
   - `report_overview_v1`
   - `report_trip_pnl_v1` (partial with explicit data-quality warnings)
   - `report_expense_summary_v1` (partial)
   - `report_sales_performance_v1` (partial)
3. Phase 2: Operational Maturity Reports
   - `report_utilization_v1` (partial -> improved)
   - CSV export for all implemented report pages
4. Phase 3: Deferred TODO Reports
   - `report_receivables_aging_v1` (from TODO to partial/ready)
   - `report_fuel_variance_v1` (from TODO to partial/ready)
5. Phase 4: Hardening
   - data quality scoring
   - performance tuning and index review
   - role-scoped slices where needed

## 12. Acceptance Criteria
1. `/reports` has real data-driven KPIs/charts.
2. All six subpages render with chart + drilldown table.
3. All data comes through API routes backed by RPCs only.
4. Export CSV works on every subpage.
5. Role access is enforced server-side.
6. P95 API latency target:
   - Overview <= 600 ms
   - Subpage datasets <= 900 ms for default range.
