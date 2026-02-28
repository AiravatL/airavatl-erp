# AiravatL ERP — Consigner CRM Plan

Version: 1.0
Date: February 24, 2026

---

## 1. Scope

Connect the existing **Consigner CRM frontend** (currently at `/sales`, using mock data) to Supabase. The module tracks prospective consigner (customer) companies through a 6-stage pipeline and converts won leads into the `customers` master.

Work items:
1. Rename route from `/sales` → `/consigner-crm` (align with Vehicle CRM naming).
2. Remove tab-strip layout; adopt Board/List toggle + Add CTA in header (match Vehicle CRM UX).
3. Add role-based visibility (`sales_consigner` sees own leads only).
4. Create RPC functions, API routes, and wire frontend to live data via TanStack Query.
5. Implement lead → customer conversion.
6. Add RLS policies on `consigner_leads` and `consigner_lead_activities`.

---

## 2. Current State

### 2.1 Database (already exists)

**`consigner_leads`** — 16 columns

| Column | Type | Notes |
|---|---|---|
| id | uuid PK | `gen_random_uuid()` |
| company_name | text NOT NULL | |
| contact_person | text NOT NULL | |
| phone | text NOT NULL | |
| email | text | nullable |
| source | lead_source | `referral \| website \| cold_call \| existing_customer` |
| estimated_value | numeric | nullable |
| route | text | nullable |
| vehicle_type | text | nullable |
| stage | lead_stage | `new_enquiry → contacted → quote_sent → negotiation → won → lost` |
| priority | lead_priority | `low \| medium \| high`, default `medium` |
| notes | text | nullable |
| sales_consigner_owner_id | uuid FK → profiles | nullable |
| next_follow_up | date | nullable |
| created_at | timestamptz | `now()` |
| updated_at | timestamptz | `now()` |

**`consigner_lead_activities`** — 6 columns

| Column | Type | Notes |
|---|---|---|
| id | uuid PK | `gen_random_uuid()` |
| lead_id | uuid FK → consigner_leads | NOT NULL |
| type | lead_activity_type | `call \| email \| meeting \| note \| stage_change` |
| description | text NOT NULL | |
| created_by_id | uuid FK → profiles | NOT NULL |
| created_at | timestamptz | `now()` |

**`customers`** (conversion target) — 10 columns

| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| name | text NOT NULL | |
| address | text | |
| gstin | text | |
| credit_days | int | default `0` |
| credit_limit | numeric | default `0` |
| sales_consigner_owner_id | uuid FK → profiles | |
| active | boolean | default `true` |
| created_at / updated_at | timestamptz | |

### 2.2 Frontend (already exists, mock data)

```
src/app/(app)/sales/
├── layout.tsx          ← tab-strip nav (Pipeline / All Leads / Add Lead)
├── page.tsx            ← Kanban board (6 columns)
├── leads/page.tsx      ← Table list with search + filters
├── new/page.tsx        ← Add lead form
└── [leadId]/page.tsx   ← Lead detail + activity timeline
```

### 2.3 Types (already in `src/lib/types/index.ts`)

`Lead`, `LeadActivity`, `LeadStage`, `LeadSource`, `LeadPriority`, `LeadActivityType` — all defined.

### 2.4 Mock data (in `src/lib/mock-data/index.ts`)

`LEADS: Lead[]` and `LEAD_ACTIVITIES: LeadActivity[]` — populated with sample data.

### 2.5 Sidebar entry

Currently: `{ label: "Sales CRM", href: "/sales", ... }` — needs rename.

---

## 3. Role & Access Model

| Action | sales_consigner | admin / super_admin | Others |
|---|---|---|---|
| View pipeline / list | Own leads only | All leads | No access |
| View lead detail | Own leads only | All leads | No access |
| Create lead | Yes | Yes | No |
| Edit lead | Own leads only | Any lead | No |
| Stage change | Own leads only | Any lead | No |
| Add activity | Own leads only | Any lead | No |
| Convert to customer | Own leads only | Any lead | No |

Ownership = `sales_consigner_owner_id = auth.uid()`

---

## 4. Data Model Changes

### 4.1 New column on `consigner_leads`

```sql
ALTER TABLE consigner_leads
  ADD COLUMN converted_customer_id uuid REFERENCES customers(id);
```

Populated when a lead reaches `won` and is converted. Prevents double-conversion.

### 4.2 New indexes

```sql
CREATE INDEX idx_consigner_leads_owner_stage
  ON consigner_leads (sales_consigner_owner_id, stage, created_at DESC);

CREATE INDEX idx_consigner_lead_activities_lead
  ON consigner_lead_activities (lead_id, created_at DESC);
```

### 4.3 Updated_at trigger

```sql
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_consigner_leads_updated_at
  BEFORE UPDATE ON consigner_leads
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
```

---

## 5. RPC Contracts

All RPCs: `SECURITY DEFINER`, role-checked inside body, return normalized rows.

### 5.1 `consigner_lead_list_v1`

```
(p_actor_user_id uuid, p_stage lead_stage DEFAULT NULL, p_priority lead_priority DEFAULT NULL,
 p_search text DEFAULT NULL, p_limit int DEFAULT 100, p_offset int DEFAULT 0)
→ SETOF (id, company_name, contact_person, phone, email, source, estimated_value, route,
         vehicle_type, stage, priority, notes, sales_consigner_owner_id, next_follow_up,
         converted_customer_id, created_at, updated_at)
```

- Role check: `sales_consigner`, `admin`, `super_admin`
- `sales_consigner` filter: `sales_consigner_owner_id = p_actor_user_id`
- Optional filters: stage, priority, ILIKE search on company_name / contact_person
- Order: `created_at DESC`

### 5.2 `consigner_lead_get_v1`

```
(p_actor_user_id uuid, p_lead_id uuid)
→ ROW (all lead columns + activities as JSON array)
```

- Same role + ownership check.

### 5.3 `consigner_lead_create_v1`

```
(p_actor_user_id uuid, p_company_name text, p_contact_person text, p_phone text,
 p_email text DEFAULT NULL, p_source lead_source, p_estimated_value numeric DEFAULT NULL,
 p_route text DEFAULT NULL, p_vehicle_type text DEFAULT NULL, p_priority lead_priority DEFAULT 'medium',
 p_notes text DEFAULT NULL, p_next_follow_up date DEFAULT NULL)
→ ROW (created lead)
```

- Role check: `sales_consigner`, `admin`, `super_admin`
- Sets `sales_consigner_owner_id = p_actor_user_id`
- Sets `stage = 'new_enquiry'`
- Writes `audit_logs`

### 5.4 `consigner_lead_update_v1`

```
(p_actor_user_id uuid, p_lead_id uuid,
 p_company_name text DEFAULT NULL, p_contact_person text DEFAULT NULL, p_phone text DEFAULT NULL,
 p_email text DEFAULT NULL, p_estimated_value numeric DEFAULT NULL, p_route text DEFAULT NULL,
 p_vehicle_type text DEFAULT NULL, p_priority lead_priority DEFAULT NULL,
 p_notes text DEFAULT NULL, p_next_follow_up date DEFAULT NULL)
→ ROW (updated lead)
```

- Ownership or admin check.
- Only non-null params are applied (COALESCE pattern).
- Writes `audit_logs`

### 5.5 `consigner_lead_move_stage_v1`

```
(p_actor_user_id uuid, p_lead_id uuid, p_to_stage lead_stage, p_note text DEFAULT NULL)
→ ROW (updated lead)
```

- Ownership or admin check.
- Enforce valid transitions:
  - `new_enquiry → contacted`
  - `contacted → quote_sent`
  - `quote_sent → negotiation`
  - `negotiation → won | lost`
  - `contacted → lost` (early drop)
  - `quote_sent → lost` (early drop)
- Auto-creates `stage_change` activity with `p_note`.
- Writes `audit_logs`

### 5.6 `consigner_lead_add_activity_v1`

```
(p_actor_user_id uuid, p_lead_id uuid, p_type lead_activity_type, p_description text)
→ ROW (created activity)
```

- Ownership or admin check.
- `p_type` must not be `stage_change` (those are auto-created by move_stage).

### 5.7 `consigner_lead_convert_v1`

```
(p_actor_user_id uuid, p_lead_id uuid, p_credit_days int DEFAULT 0,
 p_credit_limit numeric DEFAULT 0, p_address text DEFAULT NULL, p_gstin text DEFAULT NULL)
→ ROW (created customer)
```

- Lead must be in `won` stage.
- `converted_customer_id` must be NULL (no double conversion).
- Creates `customers` row from lead data:
  - `name = company_name`
  - `sales_consigner_owner_id = lead.sales_consigner_owner_id`
  - `active = true`
- Sets `consigner_leads.converted_customer_id = new customer id`
- Auto-creates `stage_change` activity: "Converted to customer"
- Writes `audit_logs`

---

## 6. Next.js API Routes

All routes follow the project `{ ok, data } | { ok: false, message }` envelope.

| Method | Route | RPC Called |
|---|---|---|
| GET | `/api/consigner-crm/leads` | `consigner_lead_list_v1` |
| POST | `/api/consigner-crm/leads` | `consigner_lead_create_v1` |
| GET | `/api/consigner-crm/leads/[leadId]` | `consigner_lead_get_v1` |
| PATCH | `/api/consigner-crm/leads/[leadId]` | `consigner_lead_update_v1` |
| POST | `/api/consigner-crm/leads/[leadId]/stage` | `consigner_lead_move_stage_v1` |
| POST | `/api/consigner-crm/leads/[leadId]/activities` | `consigner_lead_add_activity_v1` |
| POST | `/api/consigner-crm/leads/[leadId]/convert` | `consigner_lead_convert_v1` |

Each route:
1. Calls `getSupabaseServerClient()` to get the authenticated user.
2. Validates request body with Zod.
3. Calls the corresponding RPC.
4. Returns result envelope.

---

## 7. UI/UX Changes

### 7.1 Route rename

Move `src/app/(app)/sales/` → `src/app/(app)/consigner-crm/`

New URL structure:
```
/consigner-crm            → Board view (default)
/consigner-crm/leads      → List view
/consigner-crm/new        → Add lead form
/consigner-crm/[leadId]   → Lead detail + timeline
```

Update sidebar: `"Sales CRM"` → `"Consigner CRM"`, `href: "/consigner-crm"`.

### 7.2 Remove tab-strip layout, adopt header toggle

Replace the current `layout.tsx` tab strip (`Pipeline | All Leads | Add Lead`) with the Vehicle CRM pattern:

- **Page header** with title + description.
- **Two view buttons** in header: `Board` | `List` (toggle, not tabs).
- **`Add Lead` CTA button** in header (primary action, always visible).
- No separate tab navigation.

### 7.3 Role-based visibility

```tsx
const CONSIGNER_CRM_ALLOWED_ROLES: Role[] = ["sales_consigner", "admin", "super_admin"];

// Filter leads for sales_consigner (own only)
const visibleLeads = leads.filter((lead) => {
  if (user.role === "sales_consigner") return lead.salesOwnerId === user.id;
  return true;
});
```

### 7.4 Board view (refactor existing `page.tsx`)

- Keep 6-column Kanban: New Enquiry → Contacted → Quote Sent → Negotiation → Won → Lost.
- Stats bar: Total Leads | Pipeline Value | Won This Month (keep as-is).
- Card shows: company name, contact, value, route, priority badge, follow-up date.
- Click card → navigate to detail.
- Data source: API via TanStack Query (replace `LEADS` mock import).

### 7.5 List view (refactor existing `leads/page.tsx`)

- Keep table with columns: Company, Contact, Route, Value, Stage, Priority, Follow-up.
- Filters: search, stage, priority (keep as-is).
- Add owner filter for admin/super_admin.
- Data source: same API query as board (shared query key with view param).

### 7.6 Add lead form (refactor existing `new/page.tsx`)

- Keep all fields: company name, contact, phone, email, source, priority, value, route, vehicle type, notes.
- Add **next follow-up date** picker (currently missing from form but exists in schema).
- Submit calls `POST /api/consigner-crm/leads`.
- Cancel returns to `/consigner-crm`.

### 7.7 Lead detail (refactor existing `[leadId]/page.tsx`)

Keep existing layout:
- **Left**: Lead details card (phone, email, route, value, vehicle type, follow-up, notes, owner, dates).
- **Right**: Activity timeline + add activity form.
- **Header actions**: Stage move buttons, Mark Won / Mark Lost.

Add:
- **Convert to Customer** button (visible only when stage = `won` and `convertedCustomerId` is null).
  - Opens a small dialog/section for credit_days, credit_limit, address, GSTIN.
  - On submit calls `POST /api/consigner-crm/leads/[leadId]/convert`.
  - Shows link to created customer after conversion.
- **Inline edit** for lead fields (click to edit pattern or edit button → form mode).
- Activity add calls `POST /api/consigner-crm/leads/[leadId]/activities`.
- Stage change calls `POST /api/consigner-crm/leads/[leadId]/stage`.

---

## 8. TanStack Query Plan

### Query Keys

```ts
const consignerCrmKeys = {
  all:       ["consigner-crm"] as const,
  leads:     (filters: LeadFilters) => [...consignerCrmKeys.all, "leads", filters] as const,
  lead:      (id: string) => [...consignerCrmKeys.all, "lead", id] as const,
  activities:(id: string) => [...consignerCrmKeys.all, "activities", id] as const,
};
```

### Queries

| Hook | Endpoint | Stale Time |
|---|---|---|
| `useConsignerLeads(filters)` | `GET /api/consigner-crm/leads` | 30s |
| `useConsignerLead(id)` | `GET /api/consigner-crm/leads/[id]` | 30s |

### Mutations

| Hook | Endpoint | Invalidates |
|---|---|---|
| `useCreateConsignerLead()` | `POST /api/consigner-crm/leads` | `leads` |
| `useUpdateConsignerLead()` | `PATCH /api/consigner-crm/leads/[id]` | `leads`, `lead(id)` |
| `useMoveConsignerLeadStage()` | `POST .../stage` | `leads`, `lead(id)` |
| `useAddConsignerLeadActivity()` | `POST .../activities` | `activities(id)`, `lead(id)` |
| `useConvertConsignerLead()` | `POST .../convert` | `leads`, `lead(id)` |

Board drag-and-drop stage changes use optimistic updates on the `leads` query.

---

## 9. RLS & Security Plan

### 9.1 Enable RLS

```sql
ALTER TABLE consigner_leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE consigner_lead_activities ENABLE ROW LEVEL SECURITY;
```

### 9.2 Policies for `consigner_leads`

```sql
-- sales_consigner: own rows only
CREATE POLICY "sales_consigner_own_leads" ON consigner_leads
  FOR ALL USING (
    (SELECT role FROM profiles WHERE id = auth.uid()) = 'sales_consigner'
    AND sales_consigner_owner_id = auth.uid()
  );

-- admin / super_admin: full access
CREATE POLICY "admin_all_leads" ON consigner_leads
  FOR ALL USING (
    (SELECT role FROM profiles WHERE id = auth.uid()) IN ('admin', 'super_admin')
  );
```

### 9.3 Policies for `consigner_lead_activities`

```sql
-- sales_consigner: activities on own leads only
CREATE POLICY "sales_consigner_own_activities" ON consigner_lead_activities
  FOR ALL USING (
    (SELECT role FROM profiles WHERE id = auth.uid()) = 'sales_consigner'
    AND lead_id IN (SELECT id FROM consigner_leads WHERE sales_consigner_owner_id = auth.uid())
  );

-- admin / super_admin: full access
CREATE POLICY "admin_all_activities" ON consigner_lead_activities
  FOR ALL USING (
    (SELECT role FROM profiles WHERE id = auth.uid()) IN ('admin', 'super_admin')
  );
```

### 9.4 Audit logging

Every RPC writes to `audit_logs`:
```sql
INSERT INTO audit_logs (actor_id, action, entity_type, entity_id, details)
VALUES (p_actor_user_id, 'consigner_lead.create', 'consigner_lead', v_lead_id, jsonb_build_object(...));
```

---

## 10. Files to Create

| File | Purpose |
|---|---|
| `supabase/migrations/YYYYMMDD_consigner_crm_indexes.sql` | Indexes + converted_customer_id column + trigger |
| `supabase/migrations/YYYYMMDD_consigner_crm_rls.sql` | RLS enable + policies |
| `supabase/migrations/YYYYMMDD_consigner_crm_rpcs.sql` | All 7 RPC functions |
| `src/app/api/consigner-crm/leads/route.ts` | GET list + POST create |
| `src/app/api/consigner-crm/leads/[leadId]/route.ts` | GET detail + PATCH update |
| `src/app/api/consigner-crm/leads/[leadId]/stage/route.ts` | POST move stage |
| `src/app/api/consigner-crm/leads/[leadId]/activities/route.ts` | POST add activity |
| `src/app/api/consigner-crm/leads/[leadId]/convert/route.ts` | POST convert to customer |
| `src/lib/api/consigner-crm.ts` | Client-side API helpers |
| `src/lib/hooks/use-consigner-crm.ts` | TanStack Query hooks |

## 11. Files to Modify

| File | Change |
|---|---|
| `src/app/(app)/sales/` → `src/app/(app)/consigner-crm/` | Rename entire directory |
| `src/app/(app)/consigner-crm/layout.tsx` | Remove tab strip; simple pass-through layout |
| `src/app/(app)/consigner-crm/page.tsx` | Board view — replace mock data with query hook, add role filter, Board/List toggle + Add CTA in header |
| `src/app/(app)/consigner-crm/leads/page.tsx` | List view — replace mock data with query hook, add owner filter |
| `src/app/(app)/consigner-crm/new/page.tsx` | Add form — submit via mutation, add next_follow_up field, fix redirect to `/consigner-crm` |
| `src/app/(app)/consigner-crm/[leadId]/page.tsx` | Detail — replace mock data, wire activity add + stage move + convert actions |
| `src/components/layout/sidebar.tsx` | `"Sales CRM"` → `"Consigner CRM"`, `href: "/consigner-crm"` |
| `src/lib/types/index.ts` | Add `convertedCustomerId` to `Lead` interface |

## 12. Files NOT Changed

| File | Reason |
|---|---|
| `src/lib/types/index.ts` (enums) | `LeadStage`, `LeadSource`, `LeadPriority`, `LeadActivityType` — already correct |
| `src/lib/mock-data/index.ts` | Keep mock data for reference; pages will stop importing it |
| `src/app/(app)/customers/` | Existing customer pages stay as-is; conversion creates customer rows they already display |

---

## 13. Rollout Order

### Phase A — Database (migration via Supabase MCP)
1. Add `converted_customer_id` column + indexes + updated_at trigger.
2. Enable RLS on `consigner_leads` and `consigner_lead_activities`.
3. Create RLS policies.
4. Create all 7 RPC functions.
5. Test RPCs manually via `execute_sql`.

### Phase B — API Routes
6. Create Zod schemas for each request body.
7. Implement all 7 API routes.
8. Test API routes via curl / Postman.

### Phase C — Frontend Wiring
9. Rename `/sales` → `/consigner-crm` directory.
10. Update sidebar label and href.
11. Rewrite layout: remove tabs, add Board/List toggle in header.
12. Create TanStack Query hooks (`use-consigner-crm.ts`).
13. Create API client helpers (`consigner-crm.ts`).
14. Wire Board view → `useConsignerLeads()`.
15. Wire List view → same hook.
16. Wire Add form → `useCreateConsignerLead()` mutation.
17. Wire Detail page:
    - Lead data → `useConsignerLead(id)`.
    - Activity add → `useAddConsignerLeadActivity()`.
    - Stage move → `useMoveConsignerLeadStage()`.
    - Convert button → `useConvertConsignerLead()`.
18. Add role-based access guard + visibility filter.

### Phase D — QA
19. Test role matrix: `sales_consigner` sees own leads only; admin sees all; others get no access.
20. Test stage transitions: only valid moves succeed; invalid moves return error.
21. Test conversion: won lead → customer created → link displayed → double convert blocked.
22. Test audit logs: every mutation writes to `audit_logs`.
23. `pnpm build` — zero errors.
