import { apiRequest } from "@/lib/api/http";
import {
  getCachedObjectViewUrl,
  setCachedObjectViewUrl,
} from "@/lib/cache/object-view-url-cache";

export type PaymentRequestType = "advance" | "balance" | "other" | "vendor_settlement";
export type PaymentRequestStatus = "pending" | "approved" | "on_hold" | "rejected" | "paid";

export interface PaymentQueueItem {
  id: string;
  tripId: string;
  tripCode: string;
  tripCurrentStage: string;
  type: PaymentRequestType;
  status: PaymentRequestStatus;
  amount: number;
  paidAmount: number | null;
  tripAmount: number | null;
  beneficiary: string;
  paymentMethod: "bank" | "upi" | null;
  bankAccountHolder: string | null;
  bankAccountNumber: string | null;
  bankIfsc: string | null;
  bankName: string | null;
  upiId: string | null;
  upiQrObjectKey: string | null;
  paidProofObjectKey: string | null;
  paymentReference: string | null;
  notes: string;
  requestedById: string;
  requestedByName: string;
  reviewedById: string | null;
  reviewedByName: string;
  reviewedAt: string | null;
  createdAt: string;
}

export interface ListPaymentQueueFilters {
  search?: string;
  status?: PaymentRequestStatus;
  type?: PaymentRequestType;
  limit?: number;
  offset?: number;
}

export interface PreparedUpload {
  uploadUrl: string;
  objectKey: string;
  expiresIn: number | null;
}

function buildQuery(filters: ListPaymentQueueFilters = {}) {
  const params = new URLSearchParams();
  if (filters.search) params.set("search", filters.search);
  if (filters.status) params.set("status", filters.status);
  if (filters.type) params.set("type", filters.type);
  if (typeof filters.limit === "number") params.set("limit", String(filters.limit));
  if (typeof filters.offset === "number") params.set("offset", String(filters.offset));
  const query = params.toString();
  return query ? `?${query}` : "";
}

export async function listPaymentQueue(filters: ListPaymentQueueFilters = {}): Promise<PaymentQueueItem[]> {
  return apiRequest<PaymentQueueItem[]>(`/api/payments/queue${buildQuery(filters)}`, {
    method: "GET",
    cache: "no-store",
  });
}

export async function preparePaymentProofUpload(
  paymentRequestId: string,
  input: {
    fileName: string;
    mimeType: string;
    fileSizeBytes: number;
  },
): Promise<PreparedUpload> {
  return apiRequest<PreparedUpload>(`/api/payments/${paymentRequestId}/proof/prepare`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

export async function markPaymentRequestPaid(
  paymentRequestId: string,
  input: {
    objectKey: string;
    fileName: string;
    mimeType: string;
    fileSizeBytes: number;
    paymentReference?: string;
    paidAmount?: number;
    notes?: string;
  },
): Promise<{
  payment_request_id: string;
  trip_id: string;
  status: string;
  type: string;
}> {
  return apiRequest<{
    payment_request_id: string;
    trip_id: string;
    status: string;
    type: string;
  }>(`/api/payments/${paymentRequestId}/mark-paid`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

export async function getPaymentObjectViewUrl(objectKey: string): Promise<{ viewUrl: string; expiresIn: number | null }> {
  const cached = await getCachedObjectViewUrl(objectKey);
  if (cached) {
    return cached;
  }

  const fresh = await apiRequest<{ viewUrl: string; expiresIn: number | null }>("/api/payments/object-view-url", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ objectKey }),
  });

  await setCachedObjectViewUrl(objectKey, fresh);
  return fresh;
}
