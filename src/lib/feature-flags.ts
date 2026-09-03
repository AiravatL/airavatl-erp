/**
 * Build-time feature flags.
 *
 * These are plain constants, not env vars: they are read by both server and
 * client components, and a flipped constant is a one-line diff that shows up
 * in review. Anything that needs to differ per environment belongs in env
 * instead.
 */

/**
 * Trip Requests (`/trip-requests`) — the internal "consigner files a request,
 * ops converts it to an auction" workflow.
 *
 * Hidden for now: the route is gated in
 * `src/app/(app)/trip-requests/layout.tsx`, dropped from the sidebar, and its
 * dashboard panel and shortcuts are suppressed. The pages, API routes and RPCs
 * are all left intact — flip this back to `true` to restore the feature whole.
 *
 * Unrelated to `delivery_requests` (Auctions), which stays visible.
 */
export const TRIP_REQUESTS_ENABLED = false;
