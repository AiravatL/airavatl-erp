# ERP Migration Plan: Move to App Database

Version: 2.0
Date: March 15, 2026

## 1. Context & Goal

AiravatL has two separate projects, each with its own Supabase instance:

| Project | Type | Supabase Project ID | Purpose |
|---------|------|---------------------|---------|
| **ERP** | Next.js (web dashboard) | `ueelrgqvgoogpmudculd` | Internal operations, CRM, trip management, rate library, vehicle master |
| **App** | Expo (mobile apps) | `nztujesupgmiclezsosg` | Consigner & Partner mobile apps (auctions, bidding, trips, payments) |

**Goal:** Consolidate the ERP to use the **App's Supabase database** as the single source of truth. The ERP becomes a central dashboard/admin panel operating on the same database as the mobile apps.

**What stays the same in the ERP:**
- Role-based auth system (simplified to 6 roles)
- Vehicle Master feature (redesigned as a unified catalog)
- Next.js frontend + RPC-first architecture

**What changes:**
- ERP connects to the App's Supabase project instead of its own
- ERP tables/RPCs are created as migrations in the App database
- Vehicle master becomes a single unified catalog shared by ERP and App
- Role enum simplified (merge ops roles, remove support)

---

## 2. Current State Analysis

### 2.1 Authentication

| Aspect | ERP (Current) | App (Current) |
|--------|---------------|---------------|
| Auth method | Email + Password | Phone + OTP |
| User table | `profiles` (id, full_name, email, role, active) | `user_profiles` (id, user_type, full_name, phone, email, ...) |
| Roles | 8 roles: super_admin, admin, operations_consigner, operations_vehicles, sales_vehicles, sales_consigner, accounts, support | 4 user types: consigner, individual_driver, transporter, employee_driver |
| Session | Cookie-based JWT via `@supabase/ssr` | AsyncStorage-based JWT |
| User creation | Admin creates users via service role key | Self-registration via OTP |

**Key insight:** ERP roles and App user types are completely different role spaces. ERP staff are internal employees; App users are external customers/drivers. They coexist in the same `auth.users` table but need separate profile tables.

### 2.2 Vehicle Catalog - Current State in Both Systems

**ERP: Minimal, 2-table design (3 types total)**

| Name | Lengths |
|------|---------|
| 3 Wheeler | — |
| 20ft SXL | — |
| 32ft MXL | 20ft, 25 |

**App: 4-table normalized design (21 models)**

| vehicle_categories (2) | vehicle_weight_segments (10) | vehicle_models (21) | vehicle_segment_models (23) |
|------------------------|-----------------------------|--------------------|----------------------------|
| Open Truck | Up to 500kg, 0.5-1.3T, 1.3-2.5T, 2.5-5T, 5-10T, 10-12T, 12+T | 3 Wheeler, Tata Ace 0.7T 8ft, Bolero Pickup 1.3T 8ft, Tata 407 2.5T 12ft, 6W 19ft, 10W 24ft, 12W 32ft, 14W 32ft, ... | Segment-to-model mappings |
| Container | 1.5-2T, 2-8T, 7-12T | Container 4W 14ft, Container 6W 20ft, Container 10W 32ft | Segment-to-model mappings |

**App `vehicle_models` columns:** name, short_name, capacity_tons, length_feet, wheel_count, body_type, vehicle_type, make, is_active, sort_order

**Problems with current state:**
1. ERP catalog is too sparse — only type name + length, no weight/wheels/body specs
2. App catalog is over-normalized — 4 tables for what is conceptually one thing
3. They're in separate databases — no shared source of truth
4. Neither is admin-manageable with full specs

---

## 3. Key Design Decisions

### 3.1 Simplified ERP Roles (8 → 6)

**Old roles (8):**
```
super_admin, admin, operations_consigner, operations_vehicles,
sales_vehicles, sales_consigner, accounts, support
```

**New roles (6):**
```
super_admin, admin, operations, sales_vehicles, sales_consigner, accounts
```

| Change | Reason |
|--------|--------|
| `operations_consigner` + `operations_vehicles` → `operations` | Single ops role handles both sides; no need for split |
| `support` removed | Support functionality absorbed by operations/admin |

**Impact on ERP code:**
- `erp_role_type` enum has 6 values
- `ROLE_LABELS`, `ROLE_OPTIONS` in `src/lib/auth/roles.ts` updated
- `trip_owners` concept simplified (one `operations_owner_id` instead of two)
- Permission checks using `operations_consigner` or `operations_vehicles` become `operations`

### 3.2 Unified Vehicle Master (Flat Catalog)

Replace both ERP's `vehicle_master_types` + `vehicle_master_type_lengths` AND App's `vehicle_categories` + `vehicle_weight_segments` + `vehicle_models` + `vehicle_segment_models` with a **single flat table**: `vehicle_master`.

**Design principle:** Each row = one specific, bookable vehicle configuration with all specs. If "32ft MXL" comes in Open and Container variants, those are two separate rows.

**Why flat over normalized:**
- Admin manages complete vehicle specs in one form — no jumping between related tables
- Queries are simple — no JOINs needed for dropdown population
- Both ERP and App read the same table with the same shape
- Indian logistics has ~25-40 common vehicle configurations — not a scale problem

---

## 4. Phase 1 Detailed Plan

### 4.1 New `vehicle_master` Table Schema

Designed for the Indian logistics sector with all relevant specifications:

```sql
-- ============================================================
-- ENUMS
-- ============================================================

-- Vehicle category by Gross Vehicle Weight (Indian GVW classification)
CREATE TYPE vehicle_category AS ENUM (
  'scv',   -- Small Commercial Vehicle (GVW < 3.5T) — Ace, Dost
  'lcv',   -- Light Commercial Vehicle (GVW 3.5-7.5T) — 407, Eicher 10.75
  'icv',   -- Intermediate Commercial Vehicle (GVW 7.5-12T) — Eicher 14ft/17ft
  'mcv',   -- Medium Commercial Vehicle (GVW 12-16T) — 6 Wheeler 19ft-24ft
  'hcv',   -- Heavy Commercial Vehicle (GVW 16-40T) — 10W, 12W, 14W
  'mav'    -- Multi-Axle Vehicle (GVW > 40T) — Trailers, 18W+
);

-- Body type
CREATE TYPE vehicle_body_type AS ENUM (
  'open',          -- Open/platform body (most common in India)
  'container',     -- Closed container
  'half_body',     -- Half-body/side-open
  'trailer',       -- Flatbed trailer
  'tanker',        -- Liquid/gas tanker
  'refrigerated',  -- Reefer/temperature controlled
  'tipper',        -- Tipper/dump truck
  'bulker'         -- Bulk carrier (cement, grain etc.)
);

-- ERP roles (simplified from 8 to 6)
CREATE TYPE erp_role_type AS ENUM (
  'super_admin',
  'admin',
  'operations',
  'sales_vehicles',
  'sales_consigner',
  'accounts'
);

-- ============================================================
-- ERP PROFILES TABLE
-- ============================================================

CREATE TABLE public.erp_profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  role erp_role_type NOT NULL,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.erp_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "erp_profiles_self_read"
  ON public.erp_profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "erp_profiles_admin_read"
  ON public.erp_profiles FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.erp_profiles ep
      WHERE ep.id = auth.uid()
        AND ep.role IN ('super_admin', 'admin')
        AND ep.active = true
    )
  );

-- ============================================================
-- VEHICLE MASTER TABLE (Unified catalog)
-- ============================================================

CREATE TABLE public.vehicle_master (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Display
  name TEXT NOT NULL UNIQUE
    CHECK (char_length(btrim(name)) > 0),     -- e.g. "Tata Ace 0.7T 8ft Open"
  short_name TEXT NOT NULL
    CHECK (char_length(btrim(short_name)) > 0), -- e.g. "Ace 0.7T"
  description TEXT,                              -- optional notes

  -- Classification
  category vehicle_category NOT NULL,            -- scv, lcv, icv, mcv, hcv, mav
  body_type vehicle_body_type NOT NULL,           -- open, container, etc.

  -- Specifications
  wheel_count INTEGER NOT NULL CHECK (wheel_count > 0),  -- 3, 4, 6, 10, 12, 14, 18, 22
  length_feet NUMERIC,                           -- nullable: some SCVs don't specify
  capacity_tons NUMERIC NOT NULL
    CHECK (capacity_tons > 0),                   -- weight capacity in metric tons
  capacity_kg NUMERIC GENERATED ALWAYS AS (capacity_tons * 1000) STORED,

  -- Make/model (optional, for specific branded entries)
  make TEXT,                                     -- "Tata", "Ashok Leyland", "Mahindra", "Eicher"
  model TEXT,                                    -- "Ace", "407", "1109", "Bada Dost"

  -- Status & ordering
  active BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER NOT NULL DEFAULT 0,

  -- Audit
  created_by_id UUID REFERENCES public.erp_profiles(id),
  updated_by_id UUID REFERENCES public.erp_profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.vehicle_master ENABLE ROW LEVEL SECURITY;

-- All authenticated users can read active entries (App + ERP)
CREATE POLICY "vehicle_master_read_active"
  ON public.vehicle_master FOR SELECT
  USING (active = true);

-- ERP admins can read all (including inactive)
CREATE POLICY "vehicle_master_admin_read"
  ON public.vehicle_master FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.erp_profiles ep
      WHERE ep.id = auth.uid()
        AND ep.role IN ('super_admin', 'admin')
        AND ep.active = true
    )
  );

-- Indexes
CREATE INDEX idx_vehicle_master_active_sort
  ON public.vehicle_master (active, sort_order, name);

CREATE INDEX idx_vehicle_master_category
  ON public.vehicle_master (category, active);

CREATE INDEX idx_vehicle_master_body_type
  ON public.vehicle_master (body_type, active);
```

### 4.2 Seed Data (Indian Logistics Vehicles)

Based on App's existing 21 models + additional common Indian variants:

```sql
INSERT INTO public.vehicle_master
  (name, short_name, category, body_type, wheel_count, length_feet, capacity_tons, make, model, sort_order)
VALUES
  -- SCV (Small Commercial Vehicles)
  ('3 Wheeler',                     '3 Wheeler',     'scv', 'open',      3,  NULL, 0.50, NULL,            NULL,         1),
  ('Tata Ace 0.7T 8ft',            'Ace 0.7T',      'scv', 'open',      4,  8,    0.70, 'Tata',          'Ace',        2),
  ('Tata Ace Container 0.7T 8ft',  'Ace Container', 'scv', 'container', 4,  8,    0.70, 'Tata',          'Ace',        3),

  -- LCV (Light Commercial Vehicles)
  ('Bolero Pickup 1.3T 8ft',       'Bolero 1.3T',   'lcv', 'open',      4,  8,    1.30, 'Mahindra',      'Bolero',     4),
  ('Bolero Pickup 1.5T 8ft',       'Bolero 1.5T',   'lcv', 'open',      4,  8,    1.50, 'Mahindra',      'Bolero',     5),
  ('Bolero Maxx 1.7T 10ft',        'Bolero Maxx',   'lcv', 'open',      4,  10,   1.70, 'Mahindra',      'Bolero Maxx',6),
  ('Tata Yodha 2T 10ft',           'Yodha 2T',      'lcv', 'open',      4,  10,   2.00, 'Tata',          'Yodha',      7),
  ('Ashok Leyland Bada Dost 2.5T', 'Bada Dost',     'lcv', 'open',      4,  10,   2.50, 'Ashok Leyland', 'Bada Dost',  8),
  ('Tata 407 2.5T 12ft',           '407 2.5T',      'lcv', 'open',      4,  12,   2.50, 'Tata',          '407',        9),
  ('Container 4W 1.75T 14ft',      '4W Container',  'lcv', 'container', 4,  14,   1.75, NULL,            NULL,         10),

  -- ICV (Intermediate Commercial Vehicles)
  ('Tata 407 4T 12ft',             '407 4T 12ft',   'icv', 'open',      4,  12,   4.00, 'Tata',          '407',        11),
  ('Tata 407 4T 14ft',             '407 4T 14ft',   'icv', 'open',      4,  14,   4.00, 'Tata',          '407',        12),
  ('Tata 710 4.6T 14ft',           '710 4.6T',      'icv', 'open',      4,  14,   4.60, 'Tata',          '710',        13),
  ('Container 6W 5T 20ft',         '6W Container',  'icv', 'container', 6,  20,   5.00, NULL,            NULL,         14),

  -- MCV (Medium Commercial Vehicles)
  ('6 Wheeler 19ft Open',          '6W 19ft',       'mcv', 'open',      6,  19,   7.00, NULL,            NULL,         15),
  ('6 Wheeler 20ft Open',          '6W 20ft',       'mcv', 'open',      6,  20,   8.00, NULL,            NULL,         16),
  ('6 Wheeler 22ft Open',          '6W 22ft',       'mcv', 'open',      6,  22,   9.00, NULL,            NULL,         17),
  ('6 Wheeler 24ft Open',          '6W 24ft',       'mcv', 'open',      6,  24,  11.00, NULL,            NULL,         18),

  -- HCV (Heavy Commercial Vehicles)
  ('10 Wheeler 24ft Open',         '10W 24ft',      'hcv', 'open',     10,  24,  15.00, NULL,            NULL,         19),
  ('Container 10W 10T 32ft',       '10W Container', 'hcv', 'container',10,  32,  10.00, NULL,            NULL,         20),
  ('12 Wheeler 32ft Open',         '12W 32ft',      'hcv', 'open',     12,  32,  20.00, NULL,            NULL,         21),
  ('14 Wheeler 32ft Open',         '14W 32ft',      'hcv', 'open',     14,  32,  25.00, NULL,            NULL,         22),
  ('32ft MXL Container',           '32ft MXL',      'hcv', 'container',14,  32,  15.00, NULL,            NULL,         23),
  ('32ft SXL Container',           '32ft SXL',      'hcv', 'container',14,  32,  21.00, NULL,            NULL,         24),
  ('20ft SXL Container',           '20ft SXL',      'hcv', 'container',10,  20,  10.00, NULL,            NULL,         25);
```

This seed covers all 21 existing App models + the 3 ERP types, deduplicated into a unified catalog. Admin can add more (trailer, tanker, tipper, reefer, etc.) via the ERP dashboard.

### 4.3 RPC Functions

#### 4.3.1 Auth Helper RPCs

```sql
-- Assert caller is an active ERP user
CREATE OR REPLACE FUNCTION erp_assert_active_actor_v1(p_actor_user_id UUID)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE v_profile RECORD;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;
  IF p_actor_user_id != auth.uid() THEN
    RAISE EXCEPTION 'Actor mismatch' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_profile FROM public.erp_profiles WHERE id = p_actor_user_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ERP profile not found' USING ERRCODE = '42501';
  END IF;
  IF NOT v_profile.active THEN
    RAISE EXCEPTION 'ERP account is inactive' USING ERRCODE = '42501';
  END IF;
END;
$$;

-- Assert caller is an active ERP admin
CREATE OR REPLACE FUNCTION erp_assert_admin_actor_v1(p_actor_user_id UUID)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE v_profile RECORD;
BEGIN
  PERFORM erp_assert_active_actor_v1(p_actor_user_id);
  SELECT * INTO v_profile FROM public.erp_profiles WHERE id = p_actor_user_id;
  IF v_profile.role NOT IN ('super_admin', 'admin') THEN
    RAISE EXCEPTION 'Admin access required' USING ERRCODE = '42501';
  END IF;
END;
$$;
```

#### 4.3.2 Auth RPCs

```sql
-- Get current ERP user profile
CREATE OR REPLACE FUNCTION erp_auth_get_my_profile_v1()
RETURNS TABLE (id UUID, full_name TEXT, email TEXT, role erp_role_type, active BOOLEAN)
LANGUAGE plpgsql SECURITY DEFINER
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
    SELECT p.id, p.full_name, p.email, p.role, p.active
    FROM public.erp_profiles p WHERE p.id = auth.uid();
END;
$$;

-- List all ERP users (admin only)
CREATE OR REPLACE FUNCTION erp_admin_list_users_v1()
RETURNS TABLE (id UUID, full_name TEXT, email TEXT, role erp_role_type, active BOOLEAN, created_at TIMESTAMPTZ)
LANGUAGE plpgsql SECURITY DEFINER
AS $$
BEGIN
  PERFORM erp_assert_admin_actor_v1(auth.uid());
  RETURN QUERY
    SELECT p.id, p.full_name, p.email, p.role, p.active, p.created_at
    FROM public.erp_profiles p ORDER BY p.created_at DESC;
END;
$$;

-- Create/update ERP user profile (admin only)
CREATE OR REPLACE FUNCTION erp_admin_upsert_profile_v1(
  p_user_id UUID, p_full_name TEXT, p_email TEXT,
  p_role erp_role_type, p_active BOOLEAN, p_actor_user_id UUID
)
RETURNS TABLE (id UUID, full_name TEXT, email TEXT, role erp_role_type, active BOOLEAN, created_at TIMESTAMPTZ)
LANGUAGE plpgsql SECURITY DEFINER
AS $$
BEGIN
  PERFORM erp_assert_admin_actor_v1(p_actor_user_id);
  IF p_role = 'super_admin' THEN
    RAISE EXCEPTION 'Cannot create super_admin via API' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
    INSERT INTO public.erp_profiles (id, full_name, email, role, active)
    VALUES (p_user_id, btrim(p_full_name), lower(btrim(p_email)), p_role, p_active)
    ON CONFLICT (id) DO UPDATE
      SET full_name = EXCLUDED.full_name, email = EXCLUDED.email,
          role = EXCLUDED.role, active = EXCLUDED.active, updated_at = now()
    RETURNING erp_profiles.id, erp_profiles.full_name, erp_profiles.email,
              erp_profiles.role, erp_profiles.active, erp_profiles.created_at;
END;
$$;
```

#### 4.3.3 Vehicle Master RPCs

```sql
-- List vehicle master entries
CREATE OR REPLACE FUNCTION vehicle_master_list_v2(
  p_actor_user_id UUID,
  p_include_inactive BOOLEAN DEFAULT false
)
RETURNS TABLE (
  id UUID, name TEXT, short_name TEXT, description TEXT,
  category vehicle_category, body_type vehicle_body_type,
  wheel_count INTEGER, length_feet NUMERIC, capacity_tons NUMERIC, capacity_kg NUMERIC,
  make TEXT, model TEXT,
  active BOOLEAN, sort_order INTEGER
)
LANGUAGE plpgsql SECURITY DEFINER
AS $$
BEGIN
  PERFORM erp_assert_active_actor_v1(p_actor_user_id);
  RETURN QUERY
    SELECT vm.id, vm.name, vm.short_name, vm.description,
           vm.category, vm.body_type,
           vm.wheel_count, vm.length_feet, vm.capacity_tons, vm.capacity_kg,
           vm.make, vm.model,
           vm.active, vm.sort_order
    FROM public.vehicle_master vm
    WHERE (p_include_inactive OR vm.active = true)
    ORDER BY vm.sort_order, vm.name;
END;
$$;

-- Create a vehicle master entry (admin only)
CREATE OR REPLACE FUNCTION vehicle_master_create_v2(
  p_actor_user_id UUID,
  p_name TEXT,
  p_short_name TEXT,
  p_description TEXT,
  p_category vehicle_category,
  p_body_type vehicle_body_type,
  p_wheel_count INTEGER,
  p_length_feet NUMERIC,
  p_capacity_tons NUMERIC,
  p_make TEXT,
  p_model TEXT,
  p_active BOOLEAN DEFAULT true,
  p_sort_order INTEGER DEFAULT 0
)
RETURNS TABLE (
  id UUID, name TEXT, short_name TEXT, description TEXT,
  category vehicle_category, body_type vehicle_body_type,
  wheel_count INTEGER, length_feet NUMERIC, capacity_tons NUMERIC, capacity_kg NUMERIC,
  make TEXT, model TEXT,
  active BOOLEAN, sort_order INTEGER
)
LANGUAGE plpgsql SECURITY DEFINER
AS $$
BEGIN
  PERFORM erp_assert_admin_actor_v1(p_actor_user_id);
  RETURN QUERY
    INSERT INTO public.vehicle_master
      (name, short_name, description, category, body_type,
       wheel_count, length_feet, capacity_tons, make, model,
       active, sort_order, created_by_id, updated_by_id)
    VALUES
      (btrim(p_name), btrim(p_short_name), btrim(p_description), p_category, p_body_type,
       p_wheel_count, p_length_feet, p_capacity_tons, btrim(p_make), btrim(p_model),
       p_active, p_sort_order, p_actor_user_id, p_actor_user_id)
    RETURNING
      vehicle_master.id, vehicle_master.name, vehicle_master.short_name, vehicle_master.description,
      vehicle_master.category, vehicle_master.body_type,
      vehicle_master.wheel_count, vehicle_master.length_feet, vehicle_master.capacity_tons,
      vehicle_master.capacity_kg,
      vehicle_master.make, vehicle_master.model,
      vehicle_master.active, vehicle_master.sort_order;
END;
$$;

-- Update a vehicle master entry (admin only)
CREATE OR REPLACE FUNCTION vehicle_master_update_v2(
  p_actor_user_id UUID,
  p_id UUID,
  p_name TEXT DEFAULT NULL,
  p_short_name TEXT DEFAULT NULL,
  p_description TEXT DEFAULT NULL,
  p_category vehicle_category DEFAULT NULL,
  p_body_type vehicle_body_type DEFAULT NULL,
  p_wheel_count INTEGER DEFAULT NULL,
  p_length_feet NUMERIC DEFAULT NULL,
  p_capacity_tons NUMERIC DEFAULT NULL,
  p_make TEXT DEFAULT NULL,
  p_model TEXT DEFAULT NULL,
  p_active BOOLEAN DEFAULT NULL,
  p_sort_order INTEGER DEFAULT NULL
)
RETURNS TABLE (
  id UUID, name TEXT, short_name TEXT, description TEXT,
  category vehicle_category, body_type vehicle_body_type,
  wheel_count INTEGER, length_feet NUMERIC, capacity_tons NUMERIC, capacity_kg NUMERIC,
  make TEXT, model TEXT,
  active BOOLEAN, sort_order INTEGER
)
LANGUAGE plpgsql SECURITY DEFINER
AS $$
BEGIN
  PERFORM erp_assert_admin_actor_v1(p_actor_user_id);
  RETURN QUERY
    UPDATE public.vehicle_master vm
    SET
      name = COALESCE(btrim(p_name), vm.name),
      short_name = COALESCE(btrim(p_short_name), vm.short_name),
      description = COALESCE(btrim(p_description), vm.description),
      category = COALESCE(p_category, vm.category),
      body_type = COALESCE(p_body_type, vm.body_type),
      wheel_count = COALESCE(p_wheel_count, vm.wheel_count),
      length_feet = COALESCE(p_length_feet, vm.length_feet),
      capacity_tons = COALESCE(p_capacity_tons, vm.capacity_tons),
      make = COALESCE(btrim(p_make), vm.make),
      model = COALESCE(btrim(p_model), vm.model),
      active = COALESCE(p_active, vm.active),
      sort_order = COALESCE(p_sort_order, vm.sort_order),
      updated_by_id = p_actor_user_id,
      updated_at = now()
    WHERE vm.id = p_id
    RETURNING
      vm.id, vm.name, vm.short_name, vm.description,
      vm.category, vm.body_type,
      vm.wheel_count, vm.length_feet, vm.capacity_tons, vm.capacity_kg,
      vm.make, vm.model,
      vm.active, vm.sort_order;
END;
$$;

-- Validate a vehicle selection against master (used by trip/rate creation)
CREATE OR REPLACE FUNCTION vehicle_master_validate_v2(
  p_vehicle_name TEXT,
  p_allow_inactive BOOLEAN DEFAULT false
)
RETURNS TABLE (is_valid BOOLEAN, vehicle_id UUID, normalized_name TEXT)
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE v_record RECORD;
BEGIN
  SELECT * INTO v_record
  FROM public.vehicle_master
  WHERE lower(btrim(name)) = lower(btrim(p_vehicle_name))
    AND (p_allow_inactive OR active = true);

  IF NOT FOUND THEN
    -- Try short_name match as fallback
    SELECT * INTO v_record
    FROM public.vehicle_master
    WHERE lower(btrim(short_name)) = lower(btrim(p_vehicle_name))
      AND (p_allow_inactive OR active = true);
  END IF;

  IF NOT FOUND THEN
    RETURN QUERY SELECT false, NULL::UUID, NULL::TEXT;
  ELSE
    RETURN QUERY SELECT true, v_record.id, v_record.name;
  END IF;
END;
$$;

-- List distinct filter values (for admin UI filter dropdowns)
CREATE OR REPLACE FUNCTION vehicle_master_filters_v2()
RETURNS TABLE (
  categories vehicle_category[],
  body_types vehicle_body_type[],
  wheel_counts INTEGER[],
  makes TEXT[]
)
LANGUAGE plpgsql SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
    SELECT
      array_agg(DISTINCT vm.category ORDER BY vm.category),
      array_agg(DISTINCT vm.body_type ORDER BY vm.body_type),
      array_agg(DISTINCT vm.wheel_count ORDER BY vm.wheel_count),
      array_agg(DISTINCT vm.make ORDER BY vm.make) FILTER (WHERE vm.make IS NOT NULL)
    FROM public.vehicle_master vm
    WHERE vm.active = true;
END;
$$;
```

### 4.4 App-Side: Read-Only Access for Mobile Apps

The App's mobile code can read from `vehicle_master` directly via RLS (active entries are readable by all authenticated users). No RPC needed for basic reads.

```typescript
// In App's @airavatl/api package — future addition
const { data } = await supabase
  .from('vehicle_master')
  .select('id, name, short_name, category, body_type, wheel_count, length_feet, capacity_tons, make')
  .eq('active', true)
  .order('sort_order');
```

The existing App tables (`vehicle_categories`, `vehicle_weight_segments`, `vehicle_models`, `vehicle_segment_models`) remain untouched. The App continues using them until a future phase migrates App code to read from `vehicle_master`.

---

## 5. ERP Code Changes

### 5.1 Update Supabase Connection

```env
# erp/.env.local — CHANGE THESE
NEXT_PUBLIC_SUPABASE_URL=https://nztujesupgmiclezsosg.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<app_anon_key>
SUPABASE_SERVICE_ROLE_KEY=<app_service_role_key>
```

### 5.2 Update Role Definitions

**File: `src/lib/auth/roles.ts`**

```typescript
// Old
export type Role = 'super_admin' | 'admin' | 'operations_consigner' | 'operations_vehicles' | 'sales_vehicles' | 'sales_consigner' | 'accounts' | 'support';

// New
export type Role = 'super_admin' | 'admin' | 'operations' | 'sales_vehicles' | 'sales_consigner' | 'accounts';

export const ROLE_LABELS: Record<Role, string> = {
  super_admin: 'Super Admin',
  admin: 'Admin',
  operations: 'Operations',
  sales_vehicles: 'Sales (Vehicles)',
  sales_consigner: 'Sales (Consigner)',
  accounts: 'Accounts',
};
```

### 5.3 Update RPC Names

| Current RPC | New RPC | Files to Update |
|-------------|---------|-----------------|
| `auth_get_my_profile_v1` | `erp_auth_get_my_profile_v1` | `src/app/api/auth/me/route.ts`, `src/app/api/auth/login/route.ts` |
| `admin_list_users_v1` | `erp_admin_list_users_v1` | `src/app/api/admin/users/route.ts` |
| `admin_upsert_profile_v1` | `erp_admin_upsert_profile_v1` | `src/app/api/admin/users/route.ts`, `src/app/api/admin/users/[userId]/route.ts` |
| `vehicle_master_list_v1` | `vehicle_master_list_v2` | `src/app/api/vehicle-master/options/route.ts`, `src/app/api/admin/vehicle-master/route.ts` |
| `vehicle_master_upsert_type_v1` | `vehicle_master_create_v2` / `vehicle_master_update_v2` | `src/app/api/admin/vehicle-master/types/route.ts`, `src/app/api/admin/vehicle-master/types/[typeId]/route.ts` |
| `vehicle_master_upsert_length_v1` | REMOVED (no separate lengths table) | Delete length API routes |
| `vehicle_master_validate_selection_v1` | `vehicle_master_validate_v2` | Rate/trip creation RPCs |

### 5.4 Update Vehicle Master Types & API Client

**File: `src/lib/types/index.ts`**

```typescript
// Old
export interface VehicleMasterTypeOption {
  id: string;
  name: string;
  active: boolean;
  lengths: VehicleMasterLengthOption[];
}

// New — flat, rich entry
export interface VehicleMasterEntry {
  id: string;
  name: string;
  shortName: string;
  description: string | null;
  category: VehicleCategory;
  bodyType: VehicleBodyType;
  wheelCount: number;
  lengthFeet: number | null;
  capacityTons: number;
  capacityKg: number;
  make: string | null;
  model: string | null;
  active: boolean;
  sortOrder: number;
}

export type VehicleCategory = 'scv' | 'lcv' | 'icv' | 'mcv' | 'hcv' | 'mav';
export type VehicleBodyType = 'open' | 'container' | 'half_body' | 'trailer' | 'tanker' | 'refrigerated' | 'tipper' | 'bulker';
```

### 5.5 Update Vehicle Master Admin UI

The admin page (`src/app/(app)/admin/vehicle-master/page.tsx`) changes from a type+length card grid to a table/grid showing all specs per entry with:
- Filterable table with columns: Name, Category, Body Type, Wheels, Length, Capacity, Make, Active
- "Add Vehicle" button opening a form with all fields
- Edit/toggle active on each row
- Filter dropdowns for category, body type, wheel count

### 5.6 Files to Modify (Complete List)

| File | Change |
|------|--------|
| `erp/.env.local` | Point to App Supabase |
| `erp/src/lib/auth/roles.ts` | 6 roles, remove operations_consigner/operations_vehicles/support |
| `erp/src/lib/types/index.ts` | `VehicleMasterEntry` replaces `VehicleMasterTypeOption`, update `Role` type |
| `erp/src/app/api/auth/me/route.ts` | RPC → `erp_auth_get_my_profile_v1` |
| `erp/src/app/api/auth/login/route.ts` | RPC → `erp_auth_get_my_profile_v1` |
| `erp/src/app/api/admin/users/route.ts` | RPCs → `erp_admin_list_users_v1`, `erp_admin_upsert_profile_v1` |
| `erp/src/app/api/admin/users/[userId]/route.ts` | RPC → `erp_admin_upsert_profile_v1` |
| `erp/src/app/api/admin/vehicle-master/route.ts` | RPC → `vehicle_master_list_v2`, new response shape |
| `erp/src/app/api/admin/vehicle-master/types/route.ts` | RPC → `vehicle_master_create_v2` |
| `erp/src/app/api/admin/vehicle-master/types/[typeId]/route.ts` | RPC → `vehicle_master_update_v2` |
| `erp/src/app/api/vehicle-master/options/route.ts` | RPC → `vehicle_master_list_v2`, new response shape |
| `erp/src/lib/api/vehicle-master.ts` | Update API client functions, new types |
| `erp/src/app/(app)/admin/vehicle-master/page.tsx` | Complete rewrite: table UI with full specs |
| `erp/src/lib/query/keys.ts` | Update query keys if needed |

**Delete (no longer needed):**
| File | Reason |
|------|--------|
| `erp/src/app/api/admin/vehicle-master/lengths/route.ts` | No separate lengths |
| `erp/src/app/api/admin/vehicle-master/lengths/[lengthId]/route.ts` | No separate lengths |

---

## 6. Migration Execution Order

```
1. Create migration SQL file in App project
   └── airavatl-expo-app/supabase/migrations/YYYYMMDDHHMMSS_erp_phase1.sql
   └── Contains: enums, erp_profiles, vehicle_master, all RPCs, seed data

2. Apply migration to App database

3. Create initial ERP auth user(s) in App Supabase
   └── Via supabase.auth.admin.createUser() or dashboard

4. Insert erp_profiles row for super_admin

5. Verify seed data loaded correctly

6. Update ERP .env.local to point to App Supabase

7. Update ERP code:
   a. Role definitions (6 roles)
   b. RPC name changes (auth + vehicle master)
   c. Vehicle master types & API client
   d. Vehicle master admin UI (rewrite)
   e. Delete length-specific routes

8. Test ERP:
   - Login + session
   - Admin user management
   - Vehicle master CRUD (full specs)

9. Verify App mobile apps still work unchanged

10. Keep old ERP database as backup until fully verified
```

---

## 7. Risk Assessment

| Risk | Impact | Mitigation |
|------|--------|------------|
| App mobile apps break | HIGH | Purely additive — no existing App tables/RPCs modified |
| Old ERP features reference removed roles | MEDIUM | Search-and-replace `operations_consigner`/`operations_vehicles` → `operations`; remove `support` references |
| Vehicle master UI rewrite bugs | MEDIUM | The admin UI is the only page being rewritten; test thoroughly |
| Existing trips/rates reference old vehicle_master_types | LOW | Old ERP DB stays intact; new schema is fresh start in App DB |
| App `vehicle_models` data drift vs `vehicle_master` | LOW | Both exist independently initially; unify in future phase |

---

## 8. Verification Checklist

- [ ] ERP login works with email/password via App Supabase
- [ ] `erp_auth_get_my_profile_v1` returns correct profile with new role enum
- [ ] Admin can list/create/edit ERP users with new 6-role enum
- [ ] Cannot create `super_admin` via API
- [ ] Vehicle master admin page shows full specs table
- [ ] Can create vehicle with all fields (name, category, body_type, wheels, length, capacity, make, model)
- [ ] Can edit any field on existing vehicle
- [ ] Can toggle active status
- [ ] Can filter by category, body type, wheel count
- [ ] `vehicle_master_validate_v2` works for trip/rate creation
- [ ] App mobile login still works (phone OTP)
- [ ] App auctions/bidding/trips unaffected
- [ ] App `vehicle_categories/models/segments` still work
- [ ] RLS: App users can read active `vehicle_master` entries
- [ ] RLS: App users cannot read `erp_profiles`

---

## 9. Future Phases

### Phase 2: App Reads from vehicle_master
- Migrate App's vehicle selection UI to read from `vehicle_master` instead of `vehicle_models`
- Add App-facing RPC for filtered vehicle search (by category, capacity range, body type)
- Eventually deprecate `vehicle_categories`, `vehicle_weight_segments`, `vehicle_models`, `vehicle_segment_models`

### Phase 3: Trip Management Unification
- ERP can view/manage App-created trips
- Shared trip table with RLS separating App vs ERP access patterns

### Phase 4: Rate Library + CRM Migration
- Move rate library, consigner CRM, vehicle CRM to App DB
- Unified vendor/customer records

### Phase 5: Full ERP on App DB
- All remaining ERP features migrated
- Decommission old ERP Supabase project
