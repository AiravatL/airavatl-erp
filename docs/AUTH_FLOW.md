# Authentication Flow &amp; Security Architecture

## Table of Contents

1. [High-Level Architecture](#high-level-architecture)
2. [Database Tables &amp; RPC Functions](#database-tables--rpc-functions)
3. [Login Flow](#login-flow)
4. [Session Initialization Flow](#session-initialization-flow)
5. [Middleware (Every Request)](#middleware-every-request)
6. [Logout Flow](#logout-flow)
7. [Admin User Management Flow](#admin-user-management-flow)
8. [Where Are Passwords Stored?](#where-are-passwords-stored)
9. [Security Assessment](#security-assessment)
10. [File Reference](#file-reference)

---

## High-Level Architecture

```
+---------------------------+         +-------------------+        +--------------------+
|   BROWSER (Client)        |         |   NEXT.JS SERVER  |        |   SUPABASE         |
|                           |         |                   |        |                    |
| Zustand Auth Store        |  HTTP   | Middleware         | JWT   | auth.users         |
|   user, isAuthenticated,  | ------> |   (proxy.ts)      | ----> |   (encrypted_pwd)  |
|   isLoading               |         |                   |        |                    |
|                           |         | API Routes         |        | public.profiles    |
| AuthInit (session init)   |         |   /api/auth/login  |        |   (role, active)   |
| useAuth() hook            |         |   /api/auth/me     |        |                    |
|                           |         |   /api/admin/users |        | RPC Functions      |
| Supabase Browser Client   |         |                   |        |   (SECURITY DEFINER)|
|   (anon key + cookies)    |         | Supabase Server    |        |                    |
+---------------------------+         |   Client (cookies) |        +--------------------+
                                      | Supabase Admin     |
                                      |   Client (svc key) |
                                      +-------------------+
```

---

## Database Tables &amp; RPC Functions

### `auth.users` (Supabase-managed)

| Column             | Type      | Notes                                              |
|--------------------|-----------|------------------------------------------------------|
| id                 | uuid PK   | User identity                                        |
| email              | varchar   | Login email                                          |
| encrypted_password | varchar   | **bcrypt hash** - never stored in plaintext          |
| email_confirmed_at | timestamptz | Set on confirmation                                |
| last_sign_in_at    | timestamptz | Updated on each login                              |
| raw_app_meta_data  | jsonb     | `{ "provider": "email", "providers": ["email"] }`   |
| raw_user_meta_data | jsonb     | Can store arbitrary user metadata                    |
| is_anonymous       | boolean   | false for all ERP users                              |

Currently **9 users** in the system. RLS is enabled on this table (managed by Supabase).

### `public.profiles`

| Column     | Type        | Notes                                            |
|------------|-------------|--------------------------------------------------|
| id         | uuid PK FK  | References `auth.users.id`                       |
| full_name  | text        | Display name                                     |
| email      | text UNIQUE | Mirrors auth.users.email                         |
| role       | role_type   | One of 8 roles (see below)                       |
| active     | boolean     | Soft-delete flag; inactive users are signed out  |
| created_at | timestamptz | Default `now()`                                  |
| updated_at | timestamptz | Default `now()`                                  |

**9 rows**, one per auth user. This table extends auth.users with app-specific data.

### Roles (`role_type` enum)

```
super_admin | admin | operations_consigner | operations_vehicles
sales_vehicles | sales_consigner | accounts | support
```

### RPC Functions (all `SECURITY DEFINER`, owned by `postgres`)

#### `auth_get_my_profile_v1()`
```
Checks: auth.uid() IS NOT NULL
Returns: id, full_name, email, role, active from profiles WHERE id = auth.uid()
Used by: GET /api/auth/me
```

#### `admin_list_users_v1()`
```
Checks: auth.uid() IS NOT NULL
         actor profile exists AND active
         actor role IN ('super_admin', 'admin')
Returns: all profiles ordered by created_at DESC
Used by: GET /api/admin/users
```

#### `admin_upsert_profile_v1(p_user_id, p_full_name, p_email, p_role, p_active, p_actor_user_id)`
```
Checks: auth.uid() IS NOT NULL
         p_actor_user_id = auth.uid()  (prevents spoofing)
         p_role != 'super_admin'       (cannot create super admins)
         actor profile exists AND active
         actor role IN ('super_admin', 'admin')
Does:   INSERT ... ON CONFLICT (PK) DO UPDATE on profiles
Used by: POST /api/admin/users
```

All three functions are `SECURITY DEFINER` — they execute with the `postgres` role's privileges, bypassing RLS. Authorization is enforced inside the function body via explicit role checks.

---

## Login Flow

```
 User                Browser                     Next.js Server              Supabase
  |                    |                              |                         |
  |  Enter email/pwd   |                              |                         |
  |------------------->|                              |                         |
  |                    |                              |                         |
  |                    |  supabase.auth               |                         |
  |                    |  .signInWithPassword()  -----|------- GoTrue API ----->|
  |                    |                              |                         |
  |                    |                              |         Validate pwd    |
  |                    |                              |         (bcrypt compare)|
  |                    |                              |                         |
  |                    |  <--- JWT access_token ------|----- + refresh_token ---|
  |                    |       (set in cookies)       |                         |
  |                    |                              |                         |
  |                    |  GET /api/auth/me             |                         |
  |                    |  (cookie: access_token) ---->|                         |
  |                    |                              |  supabase.auth.getUser()|
  |                    |                              |------------------------>|
  |                    |                              |                         |
  |                    |                              |  RPC auth_get_my_       |
  |                    |                              |  profile_v1()           |
  |                    |                              |------------------------>|
  |                    |                              |                         |
  |                    |                              |<-- {id, full_name,      |
  |                    |                              |     email, role, active} |
  |                    |                              |                         |
  |                    |<-- { ok:true, data: User } --|                         |
  |                    |                              |                         |
  |                    |  Zustand store.set({         |                         |
  |                    |    user: profile,            |                         |
  |                    |    isAuthenticated: true     |                         |
  |                    |  })                          |                         |
  |                    |                              |                         |
  |                    |  router.push('/dashboard')   |                         |
  |<-- Dashboard ------|                              |                         |
```

**Step by step:**

1. User enters email + password on `/login` page
2. Zustand `login()` calls `supabase.auth.signInWithPassword()` (browser client)
3. Supabase GoTrue validates the password (bcrypt compare against `auth.users.encrypted_password`)
4. On success, Supabase returns a JWT `access_token` + `refresh_token`, both stored in **httpOnly cookies** by `@supabase/ssr`
5. `login()` then calls `getCurrentUserProfile()` which hits `GET /api/auth/me`
6. The API route calls `supabase.auth.getUser()` (validates JWT with Supabase) then calls RPC `auth_get_my_profile_v1()` to fetch the profile
7. If `profile.active === false`, the user is forcibly signed out
8. Otherwise, the profile is set in the Zustand store and the user is redirected to `/dashboard`

---

## Session Initialization Flow

```
 Page Load           AuthInit              Zustand Store           /api/auth/me        Supabase
    |                   |                      |                       |                  |
    |   mount           |                      |                       |                  |
    |------------------>|                      |                       |                  |
    |                   |  _initSession()      |                       |                  |
    |                   |--------------------->|                       |                  |
    |                   |                      |                       |                  |
    |                   |  Start 8s fallback   |                       |                  |
    |                   |  timer               |                       |                  |
    |                   |                      |                       |                  |
    |                   |                      | supabase.auth          |                  |
    |                   |                      | .getSession()          |                  |
    |                   |                      | (reads cookies only,   |                  |
    |                   |                      |  NO network call)      |                  |
    |                   |                      |                       |                  |
    |                   |                      |-- if session exists -->|                  |
    |                   |                      |   GET /api/auth/me     |                  |
    |                   |                      |                       | getUser() + RPC  |
    |                   |                      |                       |----------------->|
    |                   |                      |                       |<-- profile -------|
    |                   |                      |<-- User or null ------|                  |
    |                   |                      |                       |                  |
    |                   |                      | if !profile.active:   |                  |
    |                   |                      |   signOut()            |                  |
    |                   |                      |   set user=null        |                  |
    |                   |                      |                       |                  |
    |                   |                      | else:                  |                  |
    |                   |                      |   set user=profile     |                  |
    |                   |                      |   isAuthenticated=true |                  |
    |                   |                      |                       |                  |
    |                   |                      | Subscribe to           |                  |
    |                   |                      | onAuthStateChange      |                  |
    |                   |                      | (handles token refresh,|                  |
    |                   |                      |  sign out events)      |                  |
    |                   |                      |                       |                  |
    |                   |  cleanup on unmount  |                       |                  |
    |                   |  (unsubscribe +      |                       |                  |
    |                   |   clear timer)       |                       |                  |
```

**Key detail:** `getSession()` reads the JWT from cookies locally (no network). The actual Supabase validation happens in the `/api/auth/me` call via `getUser()`. The 8-second fallback timer prevents the UI from being stuck in a loading state if the network is slow.

---

## Middleware (Every Request)

```
 Browser Request          proxy.ts / middleware.ts              Supabase
      |                          |                                |
      |  ANY route               |                                |
      |------------------------->|                                |
      |                          |                                |
      |                          |  getSession()                  |
      |                          |  (reads cookies, no network)   |
      |                          |                                |
      |                          |  getUser()                     |
      |                          |  (background, non-blocking)  ->|
      |                          |                                |
      |                          |  if /api/* route:              |
      |                          |    pass through (API handles   |
      |                          |    its own auth)               |
      |                          |                                |
      |                          |  if !session && path != /login:|
      |                          |    REDIRECT -> /login          |
      |                          |                                |
      |                          |  if session && path == /login: |
      |                          |    REDIRECT -> /dashboard      |
      |                          |                                |
      |<--- Response / Redirect -|                                |
```

The middleware uses `getSession()` (cookie-only) for routing decisions so navigation is never blocked by network latency. `getUser()` is called in background to refresh the token silently.

---

## Logout Flow

```
 User              Zustand Store          Supabase           Browser
  |                    |                      |                  |
  |  Click logout      |                      |                  |
  |------ logout() --->|                      |                  |
  |                    |                      |                  |
  |                    | Immediately:          |                  |
  |                    |   user = null          |                  |
  |                    |   isAuthenticated=false|                  |
  |                    |   isLoading = false    |                  |
  |                    |                      |                  |
  |                    | Fire-and-forget:       |                  |
  |                    |   supabase.auth        |                  |
  |                    |   .signOut() -------->|                  |
  |                    |                      | Revoke session   |
  |                    |                      | Clear cookies    |
  |                    |                      |                  |
  |                    | window.location.href  |                  |
  |                    |   = '/login' ---------|---------------->|
  |                    |                      |                  |
  |<-- /login page ----|                      |                  |
```

**Key design:** Local state is cleared immediately so the user is never stuck with stale auth state even if the network is down. The server sign-out is fire-and-forget.

---

## Admin User Management Flow

```
 Admin              POST /api/admin/users            Supabase
   |                        |                            |
   |  Create user form      |                            |
   |  {email, password,     |                            |
   |   fullName, role}      |                            |
   |----------------------->|                            |
   |                        |                            |
   |                        |  1. getUser() to verify    |
   |                        |     admin JWT              |
   |                        |------ validate JWT ------->|
   |                        |                            |
   |                        |  2. Check actor is         |
   |                        |     admin/super_admin      |
   |                        |     via profiles table     |
   |                        |                            |
   |                        |  3. supabaseAdmin          |
   |                        |     .auth.admin            |
   |                        |     .createUser()          |
   |                        |     (SERVICE ROLE KEY)     |
   |                        |------ create auth user --->|
   |                        |                            |
   |                        |     Password is bcrypt     |
   |                        |     hashed by GoTrue       |
   |                        |     before storage         |
   |                        |                            |
   |                        |  4. RPC admin_upsert_      |
   |                        |     profile_v1()           |
   |                        |     (creates profile row)  |
   |                        |------ insert profile ----->|
   |                        |                            |
   |                        |<---- { ok: true, user } ---|
   |<----- success ---------|                            |
```

User creation is a two-step process: create the auth identity (via Supabase Admin client with service role key), then create the profile row (via RPC with permission checks).

---

## Where Are Passwords Stored?

```
+------------------------------------------------------------------+
|                        PASSWORD LIFECYCLE                          |
+------------------------------------------------------------------+
|                                                                    |
|  1. User enters password in /login form                           |
|     -> Sent over HTTPS to Supabase GoTrue API                    |
|     -> NEVER touches our Next.js server                          |
|                                                                    |
|  2. Admin creates user via /api/admin/users                       |
|     -> Password sent to Next.js API route                        |
|     -> Forwarded to Supabase Admin API (createUser)              |
|     -> NEVER stored by our code                                  |
|                                                                    |
|  3. Supabase GoTrue hashes the password                           |
|     -> Algorithm: bcrypt (with salt)                              |
|     -> Stored in: auth.users.encrypted_password                   |
|     -> Example: $2a$10$abcdef... (bcrypt hash)                   |
|                                                                    |
|  4. On login, GoTrue compares:                                    |
|     -> bcrypt(submitted_password) vs encrypted_password           |
|     -> If match: issues JWT access_token + refresh_token          |
|     -> Tokens stored in httpOnly cookies via @supabase/ssr        |
|                                                                    |
|  5. Our app NEVER sees or stores plaintext passwords              |
|     -> Not in profiles table                                      |
|     -> Not in any application log                                 |
|     -> Not in localStorage/sessionStorage                         |
|                                                                    |
+------------------------------------------------------------------+
```

**Answer: Passwords are bcrypt-hashed and stored exclusively in `auth.users.encrypted_password` by Supabase GoTrue. Our application code never handles, stores, or logs passwords.**

---

## Security Assessment

### What's Secure

| Area | Status | Detail |
|------|--------|--------|
| Password storage | Secure | bcrypt hash in `auth.users.encrypted_password`, managed by Supabase GoTrue |
| Password transmission | Secure | HTTPS only, sent directly to GoTrue (login) or via service role API (user creation) |
| Session tokens | Secure | JWT `access_token` + `refresh_token` in httpOnly cookies via `@supabase/ssr` |
| Token refresh | Secure | Middleware calls `getUser()` in background; `onAuthStateChange` handles refresh client-side |
| RPC authorization | Secure | All 3 RPCs are `SECURITY DEFINER` with internal role checks (`auth.uid()`, admin verification) |
| Inactive user enforcement | Secure | Both login and session init check `profile.active`; inactive users are forcibly signed out |
| Admin operations | Secure | Service role key only on server; admin RPCs verify actor is `super_admin` or `admin` |
| Actor spoofing | Secure | `admin_upsert_profile_v1` validates `p_actor_user_id = auth.uid()` |
| Super admin creation | Secure | Blocked in RPC (`p_role = 'super_admin'` raises exception) and in API route validation |

### Security Issues Found

| # | Severity | Issue | Detail |
|---|----------|-------|--------|
| 1 | **CRITICAL** | RLS disabled on `public.profiles` | All 23 public tables have RLS disabled. Anyone with the anon key can read/write all profiles directly via PostgREST. The RPCs use `SECURITY DEFINER` to bypass RLS, but direct table access is unprotected. |
| 2 | **WARN** | Leaked password protection disabled | Supabase can check passwords against HaveIBeenPwned.org to prevent use of compromised passwords. Currently disabled. |
| 3 | **LOW** | No rate limiting on login | The `/login` form and `signInWithPassword` rely on Supabase's built-in rate limiting only. No app-level throttle. |

### Recommended Fixes

**1. Enable RLS on all public tables (CRITICAL)**
```sql
-- For each table:
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Then add policies, e.g.:
CREATE POLICY "Users can read own profile"
  ON public.profiles FOR SELECT
  USING (auth.uid() = id);
```

**2. Enable leaked password protection**
Supabase Dashboard > Authentication > Settings > Enable "Leaked password protection"

**3. Consider app-level rate limiting**
Add rate limiting middleware or use Supabase's built-in auth rate limits configuration.

---

## File Reference

| File | Role |
|------|------|
| `src/lib/stores/auth-store.ts` | Zustand store — single source of truth for auth state |
| `src/lib/auth/auth-context.tsx` | `AuthInit` component + `useAuth()` hook (thin wrapper) |
| `src/lib/supabase/client.ts` | Browser-side Supabase client (singleton, anon key) |
| `src/lib/supabase/server.ts` | Server-side Supabase client (cookie-based, anon key) |
| `src/lib/supabase/admin.ts` | Admin Supabase client (service role key, server only) |
| `src/lib/supabase/middleware.ts` | Session refresh + route protection |
| `src/lib/supabase/rpc.ts` | Helper to detect missing RPC functions |
| `src/lib/api/auth.ts` | `getCurrentUserProfile()` — calls GET /api/auth/me |
| `src/lib/api/http.ts` | Generic `apiRequest<T>()` for all API calls |
| `src/app/api/auth/login/route.ts` | POST /api/auth/login — server-side login |
| `src/app/api/auth/me/route.ts` | GET /api/auth/me — fetch current user profile |
| `src/app/api/admin/users/route.ts` | GET/POST /api/admin/users — list/create users |
| `src/app/api/admin/users/[userId]/route.ts` | GET/PATCH/DELETE single user |
| `src/proxy.ts` | Next.js middleware entry point |
| `src/app/(app)/layout.tsx` | App layout with `AuthInit` + `AuthGuard` |
| `src/app/(auth)/layout.tsx` | Auth layout with `AuthInit` |
| `src/app/(auth)/login/page.tsx` | Login form UI |
| `src/lib/auth/roles.ts` | Role definitions and labels |
| `src/lib/types/index.ts` | `User` interface and `Role` type |

### Supabase Migrations (auth-related)

| Version | Name |
|---------|------|
| 20260222164147 | `create_profiles` |
| 20260222174442 | `create_rpc_auth_admin_user_management_v1` |
| 20260222175858 | `fix_admin_upsert_profile_v1_constraints` |
