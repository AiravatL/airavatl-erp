# AiravatL ERP - Ticketing System Plan (Workflow Tickets V1)

Version: 1.0  
Date: February 26, 2026

## 1. Objective

Implement workflow-driven tickets so role handoffs are visible and auto-closed when the task is completed.

V1 scope:

1. Vehicle assignment workflow ticket (user-specific).
2. Advance payment workflow ticket (role-specific: accounts).
3. Final payment workflow ticket (role-specific: accounts).

## 2. Required Behavior

1. When a trip is ready for vehicle assignment and an `operations_vehicles` owner is set, create/update a user-specific ticket for that owner.
2. When vehicle assignment is completed, auto-resolve that ticket.
3. When `Get Advance` is created, create accounts-role ticket with creator + trip context.
4. When advance payment proof is uploaded and payment marked paid, auto-resolve the ticket.
5. When `Get Final Payment` is created, create accounts-role ticket with creator + trip context.
6. When final payment proof is uploaded and payment marked paid, auto-resolve the ticket.
7. Visibility:
   - `super_admin`, `admin`, `support`: all tickets.
   - other roles: only tickets assigned to user, assigned to their role, or created by them.

## 3. Data Model Plan

Use existing `tickets` + `ticket_comments` with additions:

1. `tickets.assigned_role role_type null`
2. `tickets.source_type ticket_source_type null` (`manual`, `trip_vehicle_assignment`, `payment_request`)
3. `tickets.source_id uuid null`
4. `tickets.resolved_by_id uuid null`
5. `tickets.resolution_note text null`
6. `tickets.metadata jsonb not null default '{}'`

Indexes:

1. `tickets(status, created_at desc)`
2. `tickets(assigned_to_id, status, created_at desc)` partial
3. `tickets(assigned_role, status, created_at desc)` partial
4. `tickets(created_by_id, created_at desc)`
5. `tickets(source_type, source_id)`
6. unique open-source guard: one unresolved ticket per `(source_type, source_id)`
7. `ticket_comments(ticket_id, created_at)`

## 4. Automation Strategy

Prefer DB-trigger-based automation so ticket lifecycle remains consistent regardless of API/route path.

### 4.1 Vehicle Assignment Ticket

Functions:

1. `trip_ticket_upsert_vehicle_assignment_v1(trip_id, actor_id)`

Triggers:

1. `trip_owners` insert/update on `operations_vehicles_owner_id`
2. `trips` update on `current_stage`

Rules:

1. Trip stage `confirmed` + owner set => create/update open ticket for that owner.
2. Trip stage reaches `vehicle_assigned` (or later) => resolve ticket.

### 4.2 Payment Tickets

Functions:

1. `trip_ticket_sync_payment_request_v1(payment_request_id, actor_id)`

Trigger:

1. `payment_requests` insert and update on `status`

Rules:

1. Insert advance/final request (`pending/approved`) => create/update open ticket assigned to role `accounts`.
2. `payment_requests.status = paid` => resolve ticket.

## 5. RPC Plan (RPC-only API policy)

1. `ticket_list_v1(actor_id, status, search, limit, offset)`
2. `ticket_counts_v1(actor_id, search)`
3. `ticket_update_status_v1(actor_id, ticket_id, to_status, note)`

Notes:

1. `ticket_update_status_v1` supports manual lifecycle changes (`open`, `in_progress`, `waiting`, `resolved`).
2. Auto-resolution remains source-of-truth for workflow tickets.

## 6. API Plan (Next.js)

1. `GET /api/tickets`
   - calls `ticket_list_v1` + `ticket_counts_v1`
2. `PATCH /api/tickets/[ticketId]/status`
   - calls `ticket_update_status_v1`

## 7. UI/UX Plan

Tickets page:

1. Board + list view.
2. Status columns: `Open`, `In Progress`, `Waiting`, `Resolved`.
3. Card shows:
   - title
   - issue type
   - assignee (user or role)
   - creator
   - trip reference (link)
   - created date
4. Quick actions:
   - Start
   - Waiting
   - Resolve/Reopen

## 8. Security and Access

1. Visibility enforced in RPCs, not just UI.
2. Any status mutation uses `ticket_update_status_v1` permission checks.
3. `created_by_id` and assignment data are always stored in DB for auditability.

## 9. Future Tickets (Out of Scope for V1)

1. POD follow-up tickets.
2. Receivables follow-up tickets.
3. SLA breach escalation tickets.
4. Ticket routing rules by branch/team.
