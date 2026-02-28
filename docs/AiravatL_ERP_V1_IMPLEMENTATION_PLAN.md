# AiravatL ERP V1 - Next.js + Supabase Implementation Plan

Version: 1.0  
Date: 21 Feb 2026  
Source PRD: `docs/AiravatL_ERP_V1_PRD_Permissions_Wireframes.md`

## 1) Delivery Objective
Build AiravatL ERP V1 as a web app that enforces role-based ownership, stage gates, payment controls, and leased-fleet leakage checks defined in the PRD.

## 2) Target Stack
- Frontend: Next.js 15+ (App Router), TypeScript, Tailwind CSS, shadcn/ui
- Backend: Supabase (Postgres, Auth, Storage, Realtime, Edge Functions)
- Validation: Zod
- Data fetching: Server Components + TanStack Query for interactive client workflows
- Forms: React Hook Form + Zod resolver
- Tables: TanStack Table
- Testing: Vitest, Playwright
- Hosting: Vercel (app) + Supabase project

## 3) System Architecture
- `web`: Next.js app (UI, server actions, route handlers)
- `db`: Supabase Postgres schema + migrations + RLS policies
- `storage`: Supabase storage buckets for docs, proofs, and odometer photos
- `jobs`: Supabase Edge Functions/cron for SLA alerts and aging refresh

Data flow:
1. User logs in via Supabase Auth.
2. Role is resolved from `profiles.role`.
3. UI and server actions enforce permission checks.
4. Postgres RLS enforces final data access control.
5. Stage transitions run gate validation transactionally.
6. Every critical write emits an audit log row.

## 4) Domain Modules
- Auth + RBAC
- Dashboard + Alerts
- Customers (CRM-lite)
- Trips (list/create/detail + stage transitions)
- Quotes
- Documents
- Payments
- Leased Expenses + Checkpoints
- Driver Wallet/Advances
- Receivables + Aging
- Tickets
- Reports
- Settings (policy + users)

## 5) Proposed Database Model (V1)
Core tables:
- `profiles` (user_id, full_name, role, active)
- `customers` (master + credit fields)
- `vendors`
- `vehicles` (ownership_type: leased/vendor)
- `trips` (header, current_stage, leased_flag, sla fields)
- `trip_owners` (sales_owner, ops_owner, accounts_owner)
- `trip_stage_history` (from_stage, to_stage, actor, timestamp)
- `quotes` + `quote_versions`
- `trip_documents` (doc_type, status, file_path, verified_by)
- `payment_requests` (type, amount, beneficiary, status)
- `payment_proofs` (request_id, file_path, paid_at)
- `expense_entries` (category, amount, cap_status, approval_status)
- `odometer_checkpoints` (checkpoint_type, reading, photo_path, at_time)
- `driver_wallet_entries` (advance, adjustment, balance_delta)
- `receivables` (trip_id/customer_id, due_date, collected_status)
- `tickets` + `ticket_comments`
- `policy_settings` (margin floor, caps, POD SLA, DA/day, rent/day, fuel variance)
- `audit_logs` (entity, action, before_json, after_json, actor)

## 6) Permission and Security Strategy
Application and DB both enforce PRD matrix.

- Define enum roles: `founder_admin`, `sales`, `ops`, `field`, `accounts`, `support`
- Build centralized permission map in code: `resource -> action -> allowed_roles`
- Implement RLS per table:
  - Read policies scoped by role and ownership where required
  - Write policies restricted to allowed roles/actions
- Use server-only service role key only in trusted server runtime
- Validate every mutation with both:
  - schema validation (Zod)
  - authorization check (`assertPermission`)

## 7) Workflow Engine (Stage Gates)
Implement a `transition_trip_stage(trip_id, to_stage, actor)` procedure/service that:
1. Checks actor role against allowed transition.
2. Runs gate checks:
   - `Loaded (Docs OK)`: invoice + e-way bill (+ LR when required)
   - `Advance Paid`: only Accounts can mark paid with proof
   - `Vendor Settled`: requires POD soft + approved settlement
   - `Closed`: customer collected OR approved credit workflow
3. Writes stage history + audit log in same transaction.
4. Returns structured errors for UI.

## 8) Storage and Upload Plan
Buckets:
- `trip-documents`
- `payment-proofs`
- `checkpoint-photos`
- `ticket-attachments`

Rules:
- Signed upload URLs only
- Max file size/type restrictions by bucket
- Path convention: `trip/{trip_code}/{module}/{timestamp}_{filename}`
- Every upload entry linked to DB row; orphan cleanup job weekly

## 9) UI and Routing Plan (Next.js)
Route groups:
- `(auth)/login`, `(auth)/forgot-password`
- `(app)/dashboard`
- `(app)/trips`, `(app)/trips/new`, `(app)/trips/[tripId]`
- `(app)/customers`, `(app)/customers/[customerId]`
- `(app)/vendors`, `(app)/fleet`
- `(app)/payments`
- `(app)/receivables`
- `(app)/tickets`
- `(app)/reports`
- `(app)/settings/users`, `(app)/settings/policy`

Trip detail tabs:
- Overview, Quote, Vehicle, Docs, Payments, Expenses, Checkpoints, Tickets, Timeline

## 10) Implementation Phases

### Phase 0 - Project Bootstrap (Week 1)
- Initialize Next.js app with auth shell and role-aware layout
- Set up Supabase project, migrations, environments
- Add lint, formatter, test baseline, CI checks

Exit criteria:
- Login/logout works
- Role-based nav rendering works
- Migration pipeline operational

### Phase 1 - Core Masters + Trip Header Flow (Weeks 2-3)
- Customers CRUD with permissions
- Vendors/vehicles basic masters
- Trips list + create trip + trip header edit permissions
- Stage transitions: Request Received -> Vehicle Assigned

Exit criteria:
- Sales and Ops can create/assign trips per matrix
- Audit logs exist for trip create/edit/stage updates

### Phase 2 - Trip Card Operational Modules (Weeks 4-5)
- Quote tab with versioning and low-margin approval flag
- Docs tab with checklist and verify/reject actions
- Payments tab with request lifecycle and proof upload
- Stage gates for Loaded/Advance Paid

Exit criteria:
- Blocked transitions return clear reasons
- Accounts-only payment finalization enforced

### Phase 3 - Leased Control Layer (Weeks 6-7)
- Checkpoints tab (3 mandatory checkpoints with photos/readings)
- Expenses tab with caps, approvals, and over-cap escalation
- Fuel variance computation and alert generation

Exit criteria:
- Leased trip cannot close without required controls
- Variance flags visible on dashboard and reports

### Phase 4 - Accounts and Support Workflows (Week 8)
- Payments queue screen
- Receivables + aging buckets + follow-up status
- Tickets board and ticket detail workflow

Exit criteria:
- Accounts and Support daily operations run fully in ERP

### Phase 5 - Reports, Settings, Hardening (Weeks 9-10)
- Founder/Accounts reports with CSV export
- Policy settings and user management
- Performance pass, security review, UAT fixes

Exit criteria:
- PRD screens complete
- UAT sign-off for go-live pilot

## 11) Cross-Cutting Build Standards
- Every mutable domain action must write `audit_logs`
- Every stage mutation uses centralized transition service
- Every list screen supports filter + pagination + role-safe export
- All datetime handling in UTC in DB; localize in UI
- Do not bypass RLS for end-user workflows

## 12) QA and Acceptance Plan
Test suites:
- Unit: validators, permission map, stage gate logic
- Integration: server actions + DB transitions
- E2E: login by role, trip lifecycle, docs gate, payment gate, leased flow

Mandatory acceptance scenarios:
- Unauthorized role cannot perform restricted action (UI + API)
- Required documents block stage advance
- Accounts-only payment proof closure
- Closed stage blocked without collection/credit flow
- Leased checkpoints and expense controls function end-to-end

## 13) Risks and Mitigation
- Risk: PRD permission ambiguity for edge actions
  - Mitigation: maintain a decision log and finalize with founder weekly
- Risk: RLS complexity causing hidden access bugs
  - Mitigation: policy tests per role per table before UAT
- Risk: file upload failure at critical gate steps
  - Mitigation: resumable uploads + retry + explicit pending status

## 14) Immediate Next Actions
1. Finalize schema and RLS migration set (`v1_core_schema.sql`, `v1_rls.sql`).
2. Implement auth + role shell + permission helper package.
3. Build Trips list/create/detail skeleton with stage timeline.
4. Deliver Phase 1 demo to validate operational flow before deeper modules.
