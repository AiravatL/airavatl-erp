# Trip History Screen Plan

## Goal
1. Keep `/trips` focused on active/in-progress work.
2. Move completed trips to a separate `/trips/history` screen.
3. Ensure completed trips are not shown on `/trips` by default.

## Completion Definition
1. A trip is considered completed when `current_stage = 'closed'`.
2. Backend should also populate `completed_at` and `completed_by_id` (already present in schema) when closing.
3. List APIs should use a single definition to avoid drift between screens.

## UX Plan
1. Keep existing `/trips` page for active trips only.
2. Add a new `/trips/history` page for completed trips.
3. Add a top-level navigation entry or secondary tab switch: `Active Trips | Trip History`.
4. In history list, include completion-specific columns:
   - Trip code
   - Customer
   - Route
   - Closed date (`completed_at`)
   - Trip amount
   - Vehicle / driver
5. Keep row/card click behavior same as active list and route to `/trips/[tripId]`.

## Backend (RPC/API) Plan
1. Introduce an RPC for active list:
   - `trip_list_active_v1(p_actor_user_id, p_search, p_stage, p_limit, p_offset)`
   - Enforce same role/owner visibility as `trip_list_v1`.
   - Exclude `current_stage = 'closed'`.
2. Introduce an RPC for history list:
   - `trip_list_history_v1(p_actor_user_id, p_search, p_limit, p_offset, p_from_date, p_to_date)`
   - Include only `current_stage = 'closed'`.
3. Keep existing `trip_get_v1` unchanged for trip details.
4. Add API routes:
   - `GET /api/trips` -> calls `trip_list_active_v1`
   - `GET /api/trips/history` -> calls `trip_list_history_v1`
5. Keep everything RPC-only (no direct table reads in route handlers).

## Frontend Plan
1. Update `src/lib/api/trips.ts`:
   - `listTrips()` becomes active trips list.
   - Add `listTripHistory()` for completed trips.
2. Add query keys in `src/lib/query/keys.ts`:
   - `tripHistory(filters)`
3. New screen:
   - `src/app/(app)/trips/history/page.tsx`
   - Search + date range + export.
4. Update main trips page subtitle and empty states to indicate "active trips".

## Performance and Indexing
1. Add/verify index for history queries:
   - `(current_stage, completed_at desc)`
2. Add/verify index for active queries:
   - `(current_stage, updated_at desc)` or existing stage index.
3. Keep pagination required on both screens.

## Access Rules
1. Same visibility rules as current trip module:
   - `sales_consigner` only own trips.
   - `operations_consigner`, `operations_vehicles`, `admin`, `super_admin` per existing RPC policy.
2. History does not widen access scope.

## Rollout Steps
1. Add new RPCs and indexes via migration.
2. Add `/api/trips/history` route.
3. Build history UI and query wiring.
4. Switch `/api/trips` to active-only RPC.
5. QA with role-wise test matrix.

## Acceptance Criteria
1. Completed trips never appear on `/trips`.
2. Completed trips appear on `/trips/history`.
3. Trip details page still opens from both lists.
4. Role-based visibility remains unchanged.
5. Pagination/search works on both pages.
