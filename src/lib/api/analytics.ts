import { apiRequest } from "@/lib/api/http";

export interface AnalyticsFilters {
  from?: string;
  to?: string;
}

export interface AnalyticsStatusRow {
  status: string;
  value: number;
}

export interface AnalyticsDailyRow {
  date: string;
  total: number;
  converted?: number;
  completed?: number;
  cancelled: number;
}

export interface AnalyticsAuctions {
  total: number;
  active: number;
  ended: number;
  cancelled: number;
  incomplete: number;
  with_trip: number;
  converted_to_trip: number;
  erp: number;
  app: number;
  total_bids: number;
  auctions_with_bids: number;
  conversion_pct: number;
  cancellation_pct: number;
  avg_bids_per_auction: number;
}

export interface AnalyticsTrips {
  total: number;
  completed: number;
  cancelled: number;
  rejected: number;
  in_progress: number;
  erp: number;
  app: number;
  cancel_by: {
    driver: number;
    consigner: number;
    admin: number;
    system: number;
  };
  completion_pct: number;
  cancellation_pct: number;
}

export interface AnalyticsData {
  period: { from: string; to: string };
  auctions: AnalyticsAuctions;
  trips: AnalyticsTrips;
  auction_status_breakdown: AnalyticsStatusRow[];
  trip_status_breakdown: AnalyticsStatusRow[];
  daily_auctions: AnalyticsDailyRow[];
  daily_trips: AnalyticsDailyRow[];
}

function buildQuery(params: Record<string, string | number | boolean | null | undefined>): string {
  const entries = Object.entries(params).filter(
    ([, v]) => v !== undefined && v !== null && v !== "",
  );
  if (!entries.length) return "";
  const query = new URLSearchParams();
  for (const [k, v] of entries) query.set(k, String(v));
  return `?${query.toString()}`;
}

export async function getAnalytics(filters: AnalyticsFilters = {}): Promise<AnalyticsData> {
  return apiRequest<AnalyticsData>(
    `/api/reports/analytics${buildQuery({ from: filters.from, to: filters.to })}`,
    { method: "GET", cache: "no-store" },
  );
}
