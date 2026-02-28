import type {
  RateCategory,
  RateRequest,
  RateRequestQuote,
  RateRequestStatus,
} from "@/lib/types";
import { apiRequest } from "@/lib/api/http";

export interface CreateRateRequestInput {
  fromLocation: string;
  toLocation: string;
  vehicleType: string;
  rateCategory: RateCategory;
  notes?: string | null;
}

export interface ListRateRequestsFilters {
  status?: RateRequestStatus;
  search?: string;
  limit?: number;
  offset?: number;
}

export interface SubmitRateRequestQuoteInput {
  freightRate: number;
  ratePerTon?: number | null;
  ratePerKg?: number | null;
  confidenceLevel?: "low" | "medium" | "high" | null;
  source?: string | null;
  remarks?: string | null;
}

export interface DecideRateRequestQuoteInput {
  action: "approve" | "reject";
  reviewRemarks?: string;
}

function buildQuery(filters: ListRateRequestsFilters = {}) {
  const params = new URLSearchParams();
  if (filters.status) params.set("status", filters.status);
  if (filters.search) params.set("search", filters.search);
  if (typeof filters.limit === "number") params.set("limit", String(filters.limit));
  if (typeof filters.offset === "number") params.set("offset", String(filters.offset));
  const query = params.toString();
  return query ? `?${query}` : "";
}

export async function createRateRequest(input: CreateRateRequestInput): Promise<RateRequest> {
  return apiRequest<RateRequest>("/api/rate-requests", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

export async function listRateRequests(filters: ListRateRequestsFilters = {}): Promise<RateRequest[]> {
  return apiRequest<RateRequest[]>(`/api/rate-requests${buildQuery(filters)}`, {
    method: "GET",
    cache: "no-store",
  });
}

export async function getRateRequest(requestId: string): Promise<RateRequest> {
  return apiRequest<RateRequest>(`/api/rate-requests/${requestId}`, {
    method: "GET",
    cache: "no-store",
  });
}

export async function listRateRequestQuotes(requestId: string): Promise<RateRequestQuote[]> {
  return apiRequest<RateRequestQuote[]>(`/api/rate-requests/${requestId}/quotes`, {
    method: "GET",
    cache: "no-store",
  });
}

export async function submitRateRequestQuote(
  requestId: string,
  input: SubmitRateRequestQuoteInput,
): Promise<RateRequestQuote> {
  return apiRequest<RateRequestQuote>(`/api/rate-requests/${requestId}/quotes`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

export async function decideRateRequestQuote(
  quoteId: string,
  input: DecideRateRequestQuoteInput,
): Promise<RateRequestQuote> {
  return apiRequest<RateRequestQuote>(`/api/rate-requests/quotes/${quoteId}/decision`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}
