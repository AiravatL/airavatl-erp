**AiravatL Internal ERP (V1)\
PRD + Permissions + UI Wireframe Outline**

Version: 1.0\
Date: 16 Feb 2026

# 1. Overview

AiravatL Internal ERP V1 is a web-based internal operations system
designed to replace WhatsApp/Excel-driven coordination with a single,
auditable workflow. V1 focuses on trip lifecycle control, task
ownership, document gates, payment approvals, and leased-fleet leakage
controls (without telematics).

## 1.1 Goals

-   Single source of truth: every trip tracked on one Trip Card with
    owners, stages, tasks, documents, and payments.

-   Process gates: stage progression is blocked unless required
    data/documents/payments are present.

-   Leakage reduction: consistent quoting and margin approvals;
    fuel/expense controls for leased vehicles; POD and receivable
    discipline.

-   Scalable operations: clear role boundaries, audit trails, and
    dashboards that highlight exceptions (red alarms).

## 1.2 Non-Goals (V1)

-   Telematics/GPS automation (future upgrade).

-   Full invoicing/GST automation beyond simple ledger and receivable
    tracking.

-   HR/payroll modules (beyond driver advances and DA).

# 2. Users and Roles

V1 supports role-based login aligned to AiravatL's team structure.

## 2.1 Roles (V1)

-   Founder / Admin: policy control, approvals, and analytics.

-   Sales: consignor management, quote creation, and collections
    follow-up.

-   Operations (Ops): vehicle assignment, dispatch, in-transit
    management, documentation coordination, and payment requests.

-   Field: vendor/driver onboarding, vehicle master updates, and market
    rate inputs.

-   Accounts: payment approvals, ledger, settlements, and receivable
    aging.

-   Support: ticketing and follow-ups for operational escalations and
    documentation/payment chasing.

# 3. Trip Lifecycle Workflow (V1)

## 3.1 Standard Stages

Trips move through fixed stages. Each stage has required fields (gates).

-   Request Received

-   Quoted

-   Confirmed

-   Vehicle Assigned

-   At Loading

-   Loaded (Docs OK)

-   Advance Paid

-   In Transit

-   Delivered

-   POD Soft Received

-   Vendor Settled

-   Customer Collected

-   Closed

## 3.2 Gate Rules (Must Enforce)

-   Loaded (Docs OK): invoice + e-way bill uploaded; LR uploaded if
    Airavat issues LR.

-   Advance Paid: only Accounts can mark payment as paid with proof.

-   Vendor Settled: requires POD soft and approved settlement.

-   Closed: requires customer collected OR approved credit workflow with
    aging tracking.

# 4. Leased Vehicles Monitoring (No Telematics)

Leased vehicles require tighter controls for utilization and cost
leakage. V1 enforces 3 odometer checkpoints, fuel receipt discipline,
expense caps, and automated trip P&L (expected vs actual).

## 4.1 Mandatory Checkpoints

-   Dispatch from parking: odometer photo + reading + timestamp.

-   Fuel stop (post-loading): odometer photo + reading + fuel/DEF
    receipt + liters + amount.

-   Destination arrival: odometer photo + reading + timestamp.

## 4.2 Expense Policy (V1 Defaults)

-   Driver DA: auto-calculated (default ₹1000/day; configurable).

-   Vehicle rent: auto-calculated (default ₹3333/day; configurable).

-   Fuel/DEF: receipt mandatory; approval by Accounts.

-   Unofficial gate/union and Dala Kharcha: cap + mandatory reason +
    approval above cap.

-   Repairs: only via pre-approval workflow (receipt mandatory).

## 4.3 Fuel Variance (Expected Range)

Because mileage varies by vehicle type and route, ERP uses mileage bands
(min/max) and an optional route factor (plain/mixed/hilly) to compute an
expected fuel range. Trips exceeding thresholds raise alerts for review.

# 5. Detailed Permissions Matrix (Field-by-Field)

Legend: R = Read, C = Create, E = Edit, A = Approve/Finalize, - = No
Access

## 5.1 Customers (Consignors)

  -----------------------------------------------------------------------------------------------------
  **Field**         **Founder/Admin**   **Sales**   **Ops**    **Field**   **Accounts**   **Support**
  ----------------- ------------------- ----------- ---------- ----------- -------------- -------------
  Name / Address /  R/E                 C/E         R          R           R              R
  GSTIN                                                                                   

  Credit Days /     R/E                 R (request  R          \-          R/E            R
  Credit Limit                          change)                                           

  Owner (Sales)     R/E                 R/E (own)   R          \-          R              R

  Active/Inactive   R/E                 R (request) R          \-          R              R
  -----------------------------------------------------------------------------------------------------

## 5.2 Trips - Core Fields (Header)

  -----------------------------------------------------------------------------------------------------------
  **Field**              **Founder/Admin**   **Sales**    **Ops**    **Field**   **Accounts**   **Support**
  ---------------------- ------------------- ------------ ---------- ----------- -------------- -------------
  Customer / Route /     R/E                 C/E (until   R          R           R              R
  Schedule (pre-confirm)                     Confirmed)                                         

  Planned KM             R/E                 R            C/E        R           R              R

  Vehicle Type Required  R/E                 C/E (until   R/E        R           R              R
  / Weight Estimate                          Confirmed)   (logged)                              

  Assign Owners          R/E                 R (own)      R/E        \-          R/E            R
  (Sales/Ops/Accounts)                                                                          

  Assigned               R/E                 R            C/E        R           R              R
  Vehicle/Driver                                                                                

  Leased Flag            R/E                 R            R/E        R           R              R

  Internal Notes         R/E                 R/E          R/E        R/E         R/E            R/E
  -----------------------------------------------------------------------------------------------------------

## 5.3 Stage Transitions (Who can move stages)

  -----------------------------------------------------------------------
  **Transition**                      **Allowed Role(s)**
  ----------------------------------- -----------------------------------
  Request Received → Quoted           Sales (or Founder)

  Quoted → Confirmed                  Sales (or Founder)

  Confirmed → Vehicle Assigned        Ops

  Vehicle Assigned → At Loading       Ops

  At Loading → Loaded (Docs OK)       Ops (requires docs gate)

  Loaded → Advance Paid               Accounts only

  Advance Paid → In Transit           Ops

  In Transit → Delivered              Ops

  Delivered → POD Soft Received       Ops

  POD Soft Received → Vendor Settled  Accounts only

  Vendor Settled → Customer Collected Sales updates status; Accounts can
                                      verify

  Customer Collected → Closed         Accounts (or Founder)
  -----------------------------------------------------------------------

## 5.4 Quotes

  -----------------------------------------------------------------------------------------------
  **Field**   **Founder/Admin**   **Sales**   **Ops**    **Field**   **Accounts**   **Support**
  ----------- ------------------- ----------- ---------- ----------- -------------- -------------
  Market Rate R/E                 R           R/E        R/E         R              R
  Reference                                                                         

  Vendor      R/E                 R           R/E        R           R              R
  Expected                                                                          
  Cost                                                                              

  Airavat     R/E                 C/E         R          \-          R              R
  Margin                                                                            

  Customer    R/E                 C/E         R          \-          R              R
  Quoted                                                                            
  Price                                                                             

  Approve Low A                   \-          \-         \-          \-             \-
  Margin                                                                            
  Quote                                                                             
  -----------------------------------------------------------------------------------------------

## 5.5 Documents

  ---------------------------------------------------------------------------------------------------
  **Field**       **Founder/Admin**   **Sales**   **Ops**    **Field**   **Accounts**   **Support**
  --------------- ------------------- ----------- ---------- ----------- -------------- -------------
  Invoice / E-way R                   C/E         C/E        \-          R              R
  Bill Upload                                                                           

  LR              R/A                 R           C/E        \-          R              R
  Create/Upload                                                                         

  POD Soft Upload R                   R           C/E        \-          R              R

  Document        R/A                 \-          R/E        \-          R/A            R
  Verify/Reject                                                                         
  ---------------------------------------------------------------------------------------------------

## 5.6 Payment Requests & Proofs

  ---------------------------------------------------------------------------------------------------------
  **Field**             **Founder/Admin**   **Sales**   **Ops**    **Field**   **Accounts**   **Support**
  --------------------- ------------------- ----------- ---------- ----------- -------------- -------------
  Create Payment        R/E                 \-          C/E        \-          R              \-
  Request                                                                                     

  Approve/Hold/Reject   R/A                 \-          \-         \-          A/E            \-

  Mark Paid + Upload    R                   \-          \-         \-          C/E/A          \-
  Proof                                                                                       
  ---------------------------------------------------------------------------------------------------------

## 5.7 Leased Checkpoints (Odometer)

  -----------------------------------------------------------------------------------------------------
  **Field**       **Founder/Admin**   **Sales**   **Ops**      **Field**   **Accounts**   **Support**
  --------------- ------------------- ----------- ------------ ----------- -------------- -------------
  Create/Update   R                   \-          C/E          \-          R              \-
  Checkpoint                                                                              

  Edit after      A (override)        \-          Request      \-          A              \-
  settlement                                      correction                              
  started                                                                                 
  -----------------------------------------------------------------------------------------------------

## 5.8 Trip Expenses (Leased)

  ---------------------------------------------------------------------------------------------------------
  **Field**             **Founder/Admin**   **Sales**   **Ops**    **Field**   **Accounts**   **Support**
  --------------------- ------------------- ----------- ---------- ----------- -------------- -------------
  Add/Submit Expense    R                   \-          C/E        \-          R              \-
  Entry                                                                                       

  Approve/Reject/Hold   R/A                 \-          \-         \-          A/E            \-
  Expense                                                                                     

  Override for over-cap A                   \-          \-         \-          Escalate       \-
  expenses                                                                                    
  ---------------------------------------------------------------------------------------------------------

## 5.9 Driver Wallet / Advances

  --------------------------------------------------------------------------------------------------
  **Field**     **Founder/Admin**   **Sales**   **Ops**     **Field**   **Accounts**   **Support**
  ------------- ------------------- ----------- ----------- ----------- -------------- -------------
  Request       R                   \-          C (request) \-          A/C/E          \-
  advance entry                                                                        

  Adjust        R                   \-          R           \-          A/E            \-
  against trip                                                                         

  View          R                   \-          R           \-          R              \-
  outstanding                                                                          
  --------------------------------------------------------------------------------------------------

## 5.10 Tickets

  ---------------------------------------------------------------------------------------------------
  **Field**       **Founder/Admin**   **Sales**   **Ops**    **Field**   **Accounts**   **Support**
  --------------- ------------------- ----------- ---------- ----------- -------------- -------------
  Create ticket   R                   C           C          C           C              C

  Assign owner    A                   R (request) R/E        R (limited) R/E            R/E/A

  Resolve/close   A                   R           R/E        R           R/E            R/E/A
  ---------------------------------------------------------------------------------------------------

# 6. Screen-by-Screen UI Wireframe Outline (Dev Build)

## 6.1 Global Layout

-   Top navigation: Dashboard, Trips, Customers, Vendors/Fleet,
    Payments, Accounts, Tickets, Reports, Settings.

-   Role-based menu visibility (e.g., Payments/Accounts highlighted for
    Accounts role).

-   Search bar available on Trips/Customers/Vendors lists.

## 6.2 Screen 1: Login

-   Email/Password or OTP (Supabase Auth).

-   Forgot password flow.

-   Redirect after login based on role.

## 6.3 Screen 2: Dashboard (Role-based)

-   My Tasks (overdue/today/this week).

-   My Active Trips table.

-   Alerts panel: missing docs, pending approvals, POD overdue, overdue
    receivables, fuel variance (role dependent).

## 6.4 Screen 3: Trips List

-   Table: Trip Code, Customer, Route, Status, Owners, Vehicle, Planned
    KM, Age, Next Task.

-   Filters: Status, customer, owner, vehicle type, leased/market, date
    range.

-   Export CSV (Founder/Accounts).

## 6.5 Screen 4: Create Trip (Sales/Ops)

-   Customer select/create.

-   Pickup/Drop manual location text (lane/location allowed).

-   Vehicle requirement + weight estimate + schedule window.

-   Auto-assign owners (Sales=creator; Ops selectable/round-robin).

## 6.6 Screen 5: Trip Detail (Trip Card)

-   Header: Trip code, status badge, customer, owners, primary actions
    (contextual by stage).

-   Tabs: Overview, Quote, Vehicle, Docs, Payments, Expenses (leased),
    Checkpoints (leased), Tickets, Timeline.

### Trip Card - Overview Tab

-   Route, schedule, planned KM, vehicle requirement.

-   Stage timeline with SLA timer.

-   Internal notes and key contacts.

### Trip Card - Quote Tab

-   Quote versions (v1, v2\...), market reference, vendor expected cost.

-   Sales margin input, approval banner if below threshold.

-   Mark accepted / rejected.

### Trip Card - Vehicle Tab (Ops)

-   Assign vehicle/driver/vendor.

-   Leased badge if leased trip.

-   Optional: vendor offer log and selection reason.

### Trip Card - Docs Tab

-   Checklist: invoice, e-way bill, LR (if required), POD soft, POD
    original status.

-   Upload and preview; verify/reject actions for Ops/Accounts.

-   POD SLA countdown after Delivered.

### Trip Card - Payments Tab

-   Payment request timeline.

-   Create request (Ops): advance/balance/other, amount, beneficiary,
    notes.

-   Approve/hold/pay (Accounts) and upload proof.

### Trip Card - Expenses Tab (Leased)

-   Expense sheet grouped by category.

-   Auto items: Driver DA/day and Vehicle rent/day (configurable).

-   Cap warnings; over-cap requires founder approval.

-   Accounts approval workflow.

### Trip Card - Checkpoints Tab (Leased)

-   3 checkpoint cards: Dispatch, Fuel Stop, Destination.

-   Capture form: odometer value + photo + timestamp + location text
    (optional).

### Trip Card - Tickets and Timeline Tabs

-   Tickets: create/assign/resolve linked issues.

-   Timeline: audit log of changes (status moves, approvals, edits,
    uploads).

## 6.7 Screen 6: Customers (CRM-lite)

-   Customer list: owner, active trips, outstanding amount, credit days,
    last activity.

-   Customer detail: contacts, notes, trip history, receivable summary,
    create trip CTA.

## 6.8 Screen 7: Vendors/Fleet

-   Vendors list: KYC status, vehicles count, notes.

-   Vehicles list: number, type, ownership (leased/vendor), status,
    current trip.

-   Leased fleet dashboard: utilization, profit, fuel variance flags,
    idle days.

## 6.9 Screen 8: Payments Queue (Accounts)

-   Table: trip, request type, amount, beneficiary, requested by,
    status, age.

-   Side panel: docs checklist + approve/hold/reject + mark paid +
    upload proof.

## 6.10 Screen 9: Receivables & Aging (Accounts)

-   Customer-wise outstanding with aging buckets (0-7, 8-15, 16-30,
    30+).

-   Trip-wise receivable detail and follow-up status.

## 6.11 Screen 10: Tickets (Support)

-   Kanban: Open, In Progress, Waiting, Resolved.

-   Ticket detail: linked trip, issue type, notes, attachments, owner,
    resolution log.

## 6.12 Screen 11: Reports (Founder/Accounts)

-   Leased trip P&L report, fuel variance report, expense anomalies,
    utilization report.

-   Sales performance: trips, revenue, collections.

-   Export CSV.

## 6.13 Screen 12: Settings (Founder/Admin)

-   Policy settings editable without code: minimum margin, caps
    (unofficial/dala/parking), POD SLA, DA/day, rent/day, fuel variance
    thresholds.

-   User management: create users, assign roles, deactivate users.
