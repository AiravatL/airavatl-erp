# AiravatL ERP - Frontend Security and Input Hardening Plan

Version: 1.0  
Date: February 26, 2026

## 1) Goal
Harden frontend input handling across login and forms so UI-level abuse is reduced and data quality is consistently enforced.

## 2) Important Security Clarification
- SQL injection is primarily prevented by server-side parameterized queries/RPC calls.
- Frontend validation improves hygiene and UX but is not a security boundary by itself.
- Brute-force protection cannot be solved by frontend alone; frontend can add friction, but real defense must be server-side (rate limit/challenge/lockout).

## 3) Scope
This plan covers frontend changes for:
1. Login form (`/login`)
2. Comment/suggestion inputs (Rate Library `all` and `review` screens)
3. Numeric fields across CRM, rates, trips, leased vehicle, admin forms
4. Text fields requiring max-length limits

## 4) Current Findings
- Login currently accepts unrestricted input length from UI.
- Login/auth flow still contains debug logs with user-identifying values.
- Comment textareas do not enforce consistent max character limits.
- Many numeric fields are plain `type="number"` without unified min/max/decimal rules.
- Input constraints are repeated ad-hoc in many files (87 `Input/Textarea` usages), no central policy.

## 5) Target Input Policy (Frontend Standard)

### 5.1 Global Text Rules
- Trim leading/trailing whitespace on submit.
- Normalize repeated spaces for single-line fields.
- Remove control characters except newline/tab in multiline fields.
- Set explicit `maxLength` on all user-editable text fields.

### 5.2 Proposed Field Limits
- `email`: max `254`
- `password`: min `8`, max `72`
- `fullName`: max `100`
- `phone/mobile`: max `15` digits (E.164 compatible)
- `vehicleNumber`: max `20`
- `companyName`: max `120`
- `location/route`: max `120`
- `source`: max `100`
- `notes/remarks/comments/reviewRemarks`: max `500`
- `address`: max `250`
- `search inputs`: max `100`

### 5.3 Numeric Rules
- Use a shared numeric-input rule set per field type:
  - integer-only (no decimals)
  - decimal with fixed precision (e.g. 2 decimals for amount/rates)
  - min/max bounds
- Prevent invalid characters (`e`, `E`, `+`, `-`) where not allowed.
- Enforce range validation before enabling submit.

## 6) Login Hardening Plan

### 6.1 UI Validation
- Add strict client-side checks before submit:
  - email format + max length `254`
  - password min `8`, max `72`
- Reject obviously invalid payloads before network call.

### 6.2 Brute-force Friction (Frontend)
- Track failed attempts per browser session.
- Add progressive client cooldown (example: 2s, 4s, 8s) after consecutive failures.
- Disable submit button while cooldown is active and show remaining time.

### 6.3 Error/Logging Hardening
- Use generic error text for login failures to avoid user-enumeration hints.
- Remove console logs that expose auth flow details and user identifiers in production paths.

### 6.4 Backend Dependency (Required)
- Add server-side IP + email rate limiting on `/api/auth/login`.
- Optional: CAPTCHA/challenge after threshold.
- Without this backend part, brute-force protection remains incomplete.

## 7) Comment Input Hardening Plan

### 7.1 Affected Areas
- `src/app/(app)/rates/page.tsx`
- `src/app/(app)/rates/review/page.tsx`

### 7.2 Behavior Changes
- Enforce `commentText` max `500` at input level.
- Disable submit for empty/whitespace-only comments.
- Show live character counter (`0/500`).
- Apply same limit and validation for edit-comment flow.
- Show consistent validation messages in add/edit forms.

### 7.3 UX Safety
- Keep optimistic updates, but validate before mutation starts.
- Prevent duplicate submit while mutation is in progress.

## 8) Reusable Frontend Validation Layer
Create shared client utilities to avoid duplicate logic:
- `src/lib/validation/client/field-limits.ts`
- `src/lib/validation/client/sanitizers.ts`
- `src/lib/validation/client/validators.ts`

Optional shared components:
- `ValidatedInput`
- `ValidatedTextarea`
- `NumericInput`

## 9) Rollout Plan

### Phase 1 (Immediate)
1. Login field hardening (length, format, cooldown, generic errors).
2. Rate comment field hardening (max length + counters + edit/add parity).
3. Remove debug logs from auth/login UI flow.

### Phase 2 (Core Forms)
1. Admin user upsert form constraints (email/fullName/password/notes).
2. Vehicle CRM + Consigner CRM create/edit forms.
3. Trips create/edit + leased vehicle forms.

### Phase 3 (Consistency Pass)
1. Add search-field max lengths.
2. Replace scattered numeric handlers with shared numeric utilities.
3. Ensure all forms surface field-level and submit-level validation consistently.

## 10) QA Checklist
- Login blocks invalid email/password lengths before API call.
- Repeated failed login attempts trigger frontend cooldown.
- Comments cannot exceed max length or submit empty text.
- Numeric fields accept only valid number format per field rules.
- Field limits are consistent between create and edit screens.
- No sensitive auth logs remain in browser console for production flow.

## 11) Acceptance Criteria
- All login and comment inputs have explicit constraints and validation UX.
- Critical numeric/text fields enforce defined min/max/format rules.
- Shared validation policy exists and is reused across forms.
- Frontend brute-force friction is present, and backend rate-limit dependency is tracked.

## 12) Implementation Status (February 26, 2026)
- Completed: shared client validation layer (`field-limits`, `sanitizers`, `validators`).
- Completed: login form hardening, cooldown UX, and guarded API input validation.
- Completed: login API rate limiting (in-memory per IP+email window; suitable for non-production/dev).
- Completed: rate comments and rate create/edit payload limits (frontend + API).
- Completed: admin user create/edit limits (frontend + API).
- Completed: consigner CRM, vehicle CRM, trips, leased vehicle create/edit/policy input hardening.
- Completed: search input max-length consistency across major list pages.
- Note: production-grade brute-force protection still should use centralized edge/gateway rate-limiting (Redis/WAF), not only in-process memory.
