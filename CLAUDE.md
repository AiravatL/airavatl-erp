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
- `src/lib/auth/` — Supabase Auth + Zustand `auth-store.ts` (session + role claims)
- `src/lib/api/` — Client-side RPC fetchers (one file per domain: trips, auctions, payments, …)
- `src/lib/query/` — TanStack Query keys and hooks

### Key Domain Concepts

**7 Roles:** `super_admin`, `admin`, `sales_consigner`, `operations`, `sales_vehicles`, `accounts`, `support`.
- **operations** owns auctions + trips (create, manage, select winner); doesn't see financial amounts
- **sales_consigner** is restricted to Consigner CRM + Customer pages
- Role gating happens in API routes via `requireServerActor(allowedRoles)` from `@/lib/auth/server-actor` and in the sidebar via the `roles` field on each nav item

**Two Trip Systems (share the same URL routes):**
- **Legacy trips** — 13-stage lifecycle (request_received → closed), RPCs `trip_list_active_v2`, `trip_get_v2`. Shrinking but not yet deleted.
- **Auction trips** — new auction-flow (waiting_driver_acceptance → delivery_completed), RPCs `erp.trip_list_v1`, `erp.trip_detail_v1`. This is the path new trips take.
- Both share `erp/src/app/api/trips/_shared.ts` which exports `mapRpcError` (legacy) and `mapTripRpcError` (new).

**App-shell layout** — `components/layout/app-shell.tsx` provides a full-width topbar above the sidebar. Page titles/descriptions are pushed to the topbar via `PageHeaderProvider` + `useRegisterPageHeader`; the `<PageHeader>` component itself now only renders action buttons inline, and the title text shows in the topbar left chunk (aligned with main content).

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
