import { notFound } from "next/navigation";
import { TRIP_REQUESTS_ENABLED } from "@/lib/feature-flags";

/**
 * Gates the whole Trip Requests section — list, /new and /[requestId] — behind
 * one flag, so hiding the feature does not mean touching each page.
 *
 * notFound() rather than a redirect: a hidden route should look like it was
 * never there, and a redirect would bounce anyone holding an old bookmark to
 * the dashboard with no explanation.
 */
export default function TripRequestsLayout({ children }: { children: React.ReactNode }) {
  if (!TRIP_REQUESTS_ENABLED) notFound();
  return children;
}
