import type { MarketRate, RateCategory, RateComment, RateStatus } from "@/lib/types";
import { apiRequest } from "@/lib/api/http";

export interface SubmitRateInput {
  fromLocation: string;
  toLocation: string;
  vehicleType: string;
  rateCategory: RateCategory;
  freightRate: number;
  ratePerTon?: number | null;
  ratePerKg?: number | null;
  confidenceLevel?: "low" | "medium" | "high" | null;
  source?: string | null;
  remarks?: string | null;
}

export type UpdateRateInput = SubmitRateInput;

export interface ListRatesFilters {
  search?: string;
  vehicleType?: string;
  rateCategory?: RateCategory;
  status?: RateStatus;
  limit?: number;
  offset?: number;
}

export interface RateDecisionInput {
  action: "approve" | "reject";
  reviewRemarks?: string;
}

export interface AddRateCommentInput {
  commentText: string;
}

export interface UpdateRateCommentInput {
  commentText: string;
}
export interface DeleteRateCommentResult {
  id: string;
  deleted: boolean;
}

function buildQuery(filters: ListRatesFilters = {}) {
  const params = new URLSearchParams();
  if (filters.search) params.set("search", filters.search);
  if (filters.vehicleType) params.set("vehicleType", filters.vehicleType);
  if (filters.rateCategory) params.set("rateCategory", filters.rateCategory);
  if (filters.status) params.set("status", filters.status);
  if (typeof filters.limit === "number") params.set("limit", String(filters.limit));
  if (typeof filters.offset === "number") params.set("offset", String(filters.offset));
  const query = params.toString();
  return query ? `?${query}` : "";
}

export async function submitRate(input: SubmitRateInput): Promise<MarketRate> {
  return apiRequest<MarketRate>("/api/rates", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(input),
  });
}

export async function getRateById(rateId: string): Promise<MarketRate> {
  return apiRequest<MarketRate>(`/api/rates/${rateId}`, {
    method: "GET",
    cache: "no-store",
  });
}

export async function updateRate(rateId: string, input: UpdateRateInput): Promise<MarketRate> {
  return apiRequest<MarketRate>(`/api/rates/${rateId}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(input),
  });
}

export async function listApprovedRates(filters: ListRatesFilters = {}): Promise<MarketRate[]> {
  return apiRequest<MarketRate[]>(`/api/rates${buildQuery(filters)}`, {
    method: "GET",
    cache: "no-store",
  });
}

export async function listRatesForReview(filters: ListRatesFilters = {}): Promise<MarketRate[]> {
  return apiRequest<MarketRate[]>(`/api/rates/review${buildQuery(filters)}`, {
    method: "GET",
    cache: "no-store",
  });
}

export async function decideRate(rateId: string, input: RateDecisionInput): Promise<MarketRate> {
  return apiRequest<MarketRate>(`/api/rates/${rateId}/decision`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(input),
  });
}

export async function listRateComments(rateId: string): Promise<RateComment[]> {
  return apiRequest<RateComment[]>(`/api/rates/${rateId}/comments`, {
    method: "GET",
    cache: "no-store",
  });
}

export async function addRateComment(
  rateId: string,
  input: AddRateCommentInput,
): Promise<RateComment> {
  return apiRequest<RateComment>(`/api/rates/${rateId}/comments`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(input),
  });
}

export async function updateRateComment(
  rateId: string,
  commentId: string,
  input: UpdateRateCommentInput,
): Promise<RateComment> {
  return apiRequest<RateComment>(`/api/rates/${rateId}/comments/${commentId}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(input),
  });
}

export async function deleteRateComment(
  rateId: string,
  commentId: string,
): Promise<DeleteRateCommentResult> {
  return apiRequest<DeleteRateCommentResult>(`/api/rates/${rateId}/comments/${commentId}`, {
    method: "DELETE",
  });
}
