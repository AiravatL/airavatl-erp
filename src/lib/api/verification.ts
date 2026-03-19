import { apiRequest } from "@/lib/api/http";
import type {
  PendingPartner,
  VerificationDetails,
  SubmitDriverVerificationInput,
  SubmitTransporterVerificationInput,
} from "@/lib/types";

export interface ListPendingFilters {
  userType?: string;
  search?: string;
  limit?: number;
  offset?: number;
}

export interface PendingListResponse {
  total: number;
  driverCount: number;
  transporterCount: number;
  items: PendingPartner[];
}

export interface CreatePartnerInput {
  fullName: string;
  phone: string;
  role: "individual_driver" | "transporter";
  organizationName?: string;
}

function buildQuery(filters: ListPendingFilters = {}) {
  const params = new URLSearchParams();
  if (filters.userType) params.set("userType", filters.userType);
  if (filters.search) params.set("search", filters.search);
  if (typeof filters.limit === "number") params.set("limit", String(filters.limit));
  if (typeof filters.offset === "number") params.set("offset", String(filters.offset));
  const query = params.toString();
  return query ? `?${query}` : "";
}

export async function listPendingVerifications(
  filters: ListPendingFilters = {},
): Promise<PendingListResponse> {
  return apiRequest<PendingListResponse>(
    `/api/verification/pending${buildQuery(filters)}`,
    { method: "GET", cache: "no-store" },
  );
}

export async function getVerificationDetails(
  userId: string,
): Promise<VerificationDetails> {
  return apiRequest<VerificationDetails>(`/api/verification/${userId}`, {
    method: "GET",
    cache: "no-store",
  });
}

export async function prepareVerificationUpload(
  userId: string,
  input: { docType: string; fileName: string; mimeType: string },
): Promise<{ uploadUrl: string; objectKey: string; expiresIn: number | null }> {
  return apiRequest(`/api/verification/${userId}/upload/prepare`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

export async function confirmVerificationUpload(
  userId: string,
  input: {
    docType: string;
    objectKey: string;
    fileName: string;
    mimeType: string;
    fileSizeBytes: number;
  },
): Promise<{ objectKey: string; uploadedAt: string | null; status: string | null }> {
  return apiRequest(`/api/verification/${userId}/upload/confirm`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

export async function submitVerification(
  userId: string,
  data: SubmitDriverVerificationInput | SubmitTransporterVerificationInput,
): Promise<{ userId: string; verifiedAt: string }> {
  return apiRequest(`/api/verification/${userId}/submit`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
}

export async function revokeVerification(
  userId: string,
  input: { reason: string },
): Promise<{ userId: string; revokedAt: string }> {
  return apiRequest(`/api/verification/${userId}/revoke`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

export async function createPartner(
  input: CreatePartnerInput,
): Promise<{ userId: string }> {
  return apiRequest("/api/verification/add", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}
