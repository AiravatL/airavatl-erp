# AiravatL ERP - System Design (RPC + API)

Version: 1.0  
Date: February 22, 2026

## 1. Design Principle
Design for scale, do not prematurely build distributed complexity.

For current ERP size, we keep:
- Next.js monolith
- Supabase Postgres/Auth/Storage
- API routes + RPC functions

We avoid right now:
- Microservices
- Queues and event buses
- Redis caching tier

## 2. Target Architecture

```text
Browser UI (Next.js App Router)
        |
        |  calls typed app API client (src/lib/api/*)
        v
Next.js Route Handlers (/api/*)
        |
        |  RPC-first, SQL fallback where needed
        v
Supabase Postgres + Auth + Storage
```

Key rule: client components should not query business tables directly. They call API handlers through `src/lib/api/*`.

## 3. API Abstraction Layer
`src/lib/api/*` is the contract boundary for frontend features.

Current modules:
- `src/lib/api/auth.ts` -> current profile/session-facing data
- `src/lib/api/admin-users.ts` -> admin user listing and creation
- `src/lib/api/http.ts` -> shared JSON request handling

Benefits:
- UI is insulated from backend storage changes
- Easier migration from SQL fallback to strict RPC without UI rewrites
- Centralized error normalization for UX

## 4. RPC-First Strategy
Server handlers should execute this order:
1. Attempt versioned RPC (e.g. `admin_list_users_v1`)
2. If RPC missing (`PGRST202`), fallback to direct query/upsert
3. Return normalized JSON contract

This allows phased rollout: SQL now, RPC hardened later.

Helper:
- `src/lib/supabase/rpc.ts` with `isMissingRpcError(...)`

## 5. Required RPC Contracts (To Create in DB)

### 5.1 `auth_get_my_profile_v1()`
Purpose: return authenticated user profile payload.

Expected return shape:
- `id uuid`
- `full_name text`
- `email text`
- `role role_type`
- `active boolean`

Used by:
- `GET /api/auth/me`

### 5.2 `admin_list_users_v1()`
Purpose: return users list for Admin module.

Expected return shape:
- `id uuid`
- `full_name text`
- `email text`
- `role role_type`
- `active boolean`
- `created_at timestamptz`

Used by:
- `GET /api/admin/users`

### 5.3 `admin_upsert_profile_v1(...)`
Purpose: insert/update profile for newly created auth user.

Parameters:
- `p_user_id uuid`
- `p_full_name text`
- `p_email text`
- `p_role role_type`
- `p_active boolean`
- `p_actor_user_id uuid`

Expected return shape:
- same as profile row with `created_at`

Used by:
- `POST /api/admin/users`

## 6. Security Model
- Route handlers validate actor role before privileged operations (`super_admin`, `admin`).
- Creating auth users requires `SUPABASE_SERVICE_ROLE_KEY` on server only.
- Frontend never receives service key.
- All responses use `{ ok, data?, message? }` pattern.

## 7. Idempotency and Reliability
- Profile create path is upsert-based.
- Auth/profile mismatch triggers sign-out to avoid ghost sessions.
- Auth bootstrap includes timeout fallback to prevent infinite loading UI.

## 8. Current Modules Aligned to This Design
- Administration renamed from Settings to `/admin/*`.
- User list and create-user screens run through `/api/admin/users`.
- Session/profile bootstrap runs through `/api/auth/me`.

## 9. Next Technical Steps
1. Add audit logging inside admin RPCs for user-create/user-update actions.
2. Remove SQL fallbacks once RPC coverage is complete and tested in staging.
3. Expand RPC-first pattern to Trips/Payments/Receivables modules.
4. Add API version tags if mobile/web clients diverge in future.
