// Quick (instant) request creation reuses the shared request form; the form
// detects the /quick-requests path and switches to fixed-price mode (driver
// payout + consigner amount + accept window, no bidding fields).
export { default } from "../../delivery-requests/new/page";
