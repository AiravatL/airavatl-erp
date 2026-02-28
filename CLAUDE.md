# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
pnpm dev          # Start dev server (Next.js with Turbopack)
pnpm build        # Production build
pnpm lint         # ESLint (next.js core-web-vitals + typescript)
```

No test runner is configured yet. When added, it will use Vitest (unit/integration) and Playwright (E2E).

## Architecture

AiravatL ERP is a logistics operations system built with **Next.js 16 (App Router) + Supabase**. It manages trip lifecycle, document gates, payment approvals, and leased-fleet controls.

### Stack
- Next.js App Router, TypeScript (strict), Tailwind CSS, shadcn/ui (new-york style, lucide icons)
- Supabase: Postgres + Auth + Storage + Edge Functions
- Forms: React Hook Form + Zod | Tables: TanStack Table | Data fetching: Server Components + TanStack Query
- Path alias: `@/*` → `./src/*`

### Source Layout
- `src/app/(auth)/` — Login flow
- `src/app/(app)/` — All authenticated routes (dashboard, trips, customers, vendors, payments, receivables, tickets, reports, settings)
- `src/components/ui/` — shadcn/ui primitives
- `src/components/layout/` — AppShell, Sidebar
- `src/components/shared/` — PageHeader, StatusBadge, EmptyState
- `src/lib/types/` — Domain TypeScript types
- `src/lib/auth/` — Auth context (currently mock, will be Supabase Auth)
- `src/lib/mock-data/` — Mock data for all entities (development phase)
- `src/modules/` — Domain logic (services, actions) — scaffolded but empty, to be filled as backend connects

### Key Domain Concepts

**6 Roles:** `founder_admin`, `sales`, `ops`, `field`, `accounts`, `support`. Permissions are centralized in a role→resource→action map in `lib/permissions/`. The sidebar and dashboard adapt based on role.

**Trip Lifecycle (13 stages):** Request Received → Quoted → Confirmed → Vehicle Assigned → At Loading → Loaded (Docs OK) → Advance Paid → In Transit → Delivered → POD Soft Received → Vendor Settled → Customer Collected → Closed. Each stage transition has gate rules (required docs, payment proofs, approvals).

**Leased trips** have extra tabs: Expenses (with caps and approval) and Checkpoints (3 mandatory odometer readings with photos).

### Coding Conventions (from docs/CODING_STANDARDS.md)
- Files/folders: `kebab-case`. Components/types: `PascalCase`. DB columns: `snake_case`.
- Default to Server Components; Client Components only for interactivity.
- Result type pattern: `{ ok: true; data: T } | { ok: false; code: string; message: string }`
- No `any` — use `unknown` + refinement.
- Every mutable action must write to `audit_logs`. Stage transitions use one centralized service.
- Validate all inputs with Zod. Never trust client-provided role.
- File size limits: Route 250 lines, Component 200 lines, Service 180 lines, Hook 150 lines.

### Supabase
- MCP server configured in `.mcp.json` (project ref: `ueelrgqvgoogpmudculd`)
- Schema changes go in `supabase/migrations/`. Every table must have RLS enabled.
- Storage buckets: trip-documents, payment-proofs, checkpoint-photos, ticket-attachments
- All write paths: Zod validation → permission check → DB operation under RLS

### Reference Documents
- `docs/AiravatL_ERP_V1_PRD_Permissions_Wireframes.md` — Full PRD with field-level permission matrix
- `docs/AiravatL_ERP_V1_IMPLEMENTATION_PLAN.md` — Implementation phases and DB model
- `docs/CODING_STANDARDS.md` — Coding conventions and PR checklist
