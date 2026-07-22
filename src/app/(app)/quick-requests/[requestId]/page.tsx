// Quick (instant) request detail reuses the shared request detail page; it
// renders the acceptances table (with distance from pickup) instead of bids
// for instant requests, and back links resolve to /quick-requests here.
export { default } from "../../delivery-requests/[requestId]/page";
