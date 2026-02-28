# AiravatL ERP - Coding Standards and Codebase Guidelines

Version: 3.0  
Date: 21 Feb 2026  
Stack: Next.js (App Router), TypeScript, Supabase, Tailwind CSS, TanStack Query

## 1) Engineering Principles
- Clarity over cleverness.
- Server-first design for security and correctness.
- Domain boundaries over framework convenience.
- No silent failures: return explicit errors.
- Security and auditability are product features, not extras.

## 2) Repository Structure
Preferred structure:

```text
.
├── src/
│   ├── app/                    # Next.js routes (App Router)
│   │   ├── (auth)/
│   │   └── (app)/
│   ├── modules/                # Domain modules (feature-first)
│   │   ├── trips/
│   │   ├── customers/
│   │   ├── payments/
│   │   ├── accounts/
│   │   ├── tickets/
│   │   └── settings/
│   ├── components/             # Shared UI components
│   ├── lib/                    # Framework-agnostic helpers
│   │   ├── auth/
│   │   ├── permissions/
│   │   ├── db/
│   │   └── validation/
│   ├── server/                 # Server-only code (actions/services)
│   └── styles/
├── supabase/
│   ├── migrations/
│   ├── seeds/
│   └── tests/
├── tests/
│   ├── unit/
│   ├── integration/
│   └── e2e/
└── docs/
```

Rules:
- Keep domain logic in `src/modules/*`, not route files.
- Keep route files thin: compose UI + call actions/hooks.
- Any code using service role keys must live in server-only paths.

## 3) Naming Conventions
- Files/folders: `kebab-case`
- React components/types: `PascalCase`
- Variables/functions: `camelCase`
- Constants: `UPPER_SNAKE_CASE`
- DB tables/columns: `snake_case`
- Avoid abbreviations except common domain terms (`pod`, `gst`, `lr`)

## 4) TypeScript Standards
- `strict` mode required.
- No `any` in app code. Use `unknown` + refinement.
- Export explicit types for service inputs/outputs.
- Use discriminated unions for status/result states.

Example result contract:

```ts
type ActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; code: string; message: string };
```

## 5) Next.js Standards
- Default to Server Components.
- Use Client Components only for interactive UI.
- Mutations go through Server Actions or Route Handlers.
- Do not call Supabase service-role APIs from the browser.
- Co-locate route-level loading/error boundaries where needed.

## 5.1 API Abstraction and RPC Rules
- Client features must call `src/lib/api/*` wrappers, not raw `fetch(...)` scattered across UI.
- Client features must not query business tables directly from browser Supabase clients.
- Route handlers should be RPC-first:
  1. call versioned RPC (`*_v1`)
  2. fallback to SQL query only when RPC is missing (`PGRST202`)
  3. normalize response to `{ ok, data?, message? }`
- Keep one typed file per API domain (example: `src/lib/api/admin-users.ts`).
- Promote fallback SQL to RPC in the next migration cycle; fallbacks are temporary.

## 6) Supabase and Data Access Rules
- Schema changes only via SQL migrations in `supabase/migrations`.
- Every table must have RLS enabled.
- Every write path must perform:
  1. input validation (Zod)
  2. permission check (role/resource/action)
  3. DB operation under RLS
- Storage uploads use signed URLs and DB-linked metadata rows.
- Never trust client-provided role; read role from authenticated profile.

## 7) Permissions and Stage Gate Rules
- Centralize permissions in one map (`lib/permissions`).
- Never duplicate role checks in multiple styles.
- Trip stage transitions must use one transition service.
- Gate failures must return machine-friendly codes and user-friendly text.

Required gate checks:
- `Loaded (Docs OK)`: required docs present and valid.
- `Advance Paid`: Accounts-only finalization with proof.
- `Vendor Settled`: POD soft + settlement approval.
- `Closed`: collection complete or approved credit flow.

## 8) UI and Design System Rules
- Use shared primitives from `src/components`.
- No inline hard-coded colors in feature code.
- Use semantic status tokens for stage and approval states.
- Tables must support loading, empty, error, and permission-denied states.
- Forms must show field-level and submit-level errors.

## 9) State Management Rules
- Server state: TanStack Query (client) or server component fetch.
- Local UI state: React state.
- Avoid global stores unless state truly spans distant branches.
- Do not duplicate server data in local stores.

## 10) Validation and Error Handling
- Validate all external inputs with Zod.
- Normalize domain errors with stable `code` values.
- Log unexpected exceptions with context (`user_id`, `trip_id`, action).
- Never expose internal stack traces to end users.

## 11) Auditability and Observability
- Critical actions must create audit log entries:
  - stage transitions
  - payment approvals/rejections
  - document verification/rejection
  - expense approvals/overrides
  - policy changes
- Include correlation/request ID in server logs.

## 12) Testing Requirements
Minimum coverage targets:
- Unit: permission map, gate validators, pure domain logic
- Integration: server actions against test DB/RLS behavior
- E2E: role-based trip lifecycle happy path + critical denials

PRs touching permissions, stage transitions, or payments must include tests.

## 13) Performance and Reliability
- Paginate list endpoints (no unbounded table reads).
- Add proper DB indexes for all filtered/sorted columns.
- Use optimistic UI only when rollback behavior is defined.
- Keep p95 route response time targets explicit for key screens.

## 14) File Size and Refactor Triggers
Refactor when exceeding:
- Route file: 250 lines
- Component file: 200 lines
- Service/action file: 180 lines
- Hook file: 150 lines

If a file exceeds limits, split by domain responsibility, not by arbitrary chunks.

## 15) Pull Request Checklist
- [ ] Requirements mapped to PRD section.
- [ ] Permissions checked in UI + server + RLS.
- [ ] Zod validation added/updated.
- [ ] Audit logging added for critical writes.
- [ ] Tests added/updated.
- [ ] Migration and rollback path included (if schema changed).
- [ ] Docs updated (`docs/` when behavior/process changes).

## 16) Definition of Done
A feature is done only if:
- Functional behavior matches PRD.
- Unauthorized access is blocked at all layers.
- Logs and audit entries are generated correctly.
- Tests pass in CI.
- User-facing errors are understandable and actionable.
