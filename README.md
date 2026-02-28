# AiravatL ERP

AiravatL ERP is a Next.js + Supabase ERP application for logistics operations, including:
- Trips and trip lifecycle
- Fleet and vendor management
- Vehicle/Consigner CRM
- Rate library + rate requests + comments/review
- Payments and proof uploads (R2 presign worker flow)
- Tickets and role-based queues
- Reports (overview + subpages)
- Admin user and vehicle master management

## Tech Stack
- Next.js (App Router, TypeScript)
- Supabase (Auth, Postgres, RPC-first backend)
- TanStack Query (client data fetching/caching)
- Zustand (auth/session state)
- shadcn/ui + Tailwind CSS
- Recharts (via shadcn chart wrapper)

## Architecture Notes
- Frontend does not query DB directly.
- Frontend calls `/api/*` routes only.
- API routes call Supabase RPCs for business logic and permissions.
- Role/permission checks are enforced in backend RPC + API route layer.

## Prerequisites
- Node.js 20+
- pnpm 10+

## Setup
1. Install dependencies:
```bash
pnpm install
```
2. Create `.env.local` with required variables:
```bash
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=

# Required for admin user create/password update routes
SUPABASE_SERVICE_ROLE_KEY=

# Required for R2 presign worker integration
R2_PRESIGN_WORKER_URL=
```
3. Start dev server:
```bash
pnpm dev
```
4. Open `http://localhost:3000`

## Useful Commands
```bash
pnpm dev
pnpm lint
pnpm exec tsc --noEmit
pnpm build
pnpm start
```

## Database / Migrations
- SQL migrations are in `supabase/migrations/`.
- Apply migrations via your Supabase workflow (MCP / SQL editor / CI migration pipeline).

## Main Docs
- PRD: `docs/AiravatL_ERP_V1_PRD_Permissions_Wireframes.md`
- Schema: `docs/DATABASE_SCHEMA.md`
- System design plans: `docs/system_design/`
- Coding standards: `docs/CODING_STANDARDS.md`

## Security Notes
- Never commit `.env*`, service role keys, worker secrets, or private credentials.
- Keep only references/placeholders in docs, not raw secrets.
