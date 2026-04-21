import { apiRequest } from "@/lib/api/http";

export interface ConsignerReceivableGroup {
  consigner_profile_id: string;
  consigner_name: string;
  trip_count: number;
  total_invoiced: number;
  total_received: number;
  total_outstanding: number;
  /** Aggregate holding charges across this consigner's receivables. */
  total_holding: number;
  overdue_count: number;
  overdue_amount: number | null;
  receivables: {
    id: string;
    trip_number: string;
    invoice_amount: number;
    amount_received: number;
    amount_outstanding: number;
    /** Portion of invoice_amount that came from holding charges. */
    holding_amount: number;
    status: string;
    due_date: string;
    days_overdue: number;
    pickup_city: string;
    delivery_city: string;
  }[];
}

export async function listReceivablesByConsigner(filters?: { search?: string; status?: string }): Promise<ConsignerReceivableGroup[]> {
  const params = new URLSearchParams();
  if (filters?.search) params.set("search", filters.search);
  if (filters?.status) params.set("status", filters.status);
  const q = params.toString();
  return apiRequest(`/api/receivables/by-consigner${q ? `?${q}` : ""}`);
}

export interface ReceivableItem {
  id: string;
  trip_id: string;
  trip_number: string;
  consigner_profile_id: string;
  consigner_name: string;
  pickup_city: string;
  delivery_city: string;
  invoice_amount: number;
  amount_received: number;
  amount_outstanding: number;
  status: "pending" | "partial" | "collected" | "written_off";
  due_date: string;
  days_overdue: number;
  aging_bucket: "current" | "1-7" | "8-15" | "16-30" | "30+" | "settled";
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface ReceivableListResponse {
  total: number;
  limit: number;
  offset: number;
  items: ReceivableItem[];
}

export interface ReceivableSummary {
  total_outstanding: number;
  total_overdue: number;
  total_collected_this_month: number;
  receivables_count: number;
  overdue_count: number;
  aging_buckets: { bucket: string; count: number; amount: number }[];
  top_consigners: {
    consigner_profile_id: string;
    consigner_name: string;
    outstanding: number;
    overdue: number | null;
    trip_count: number;
  }[];
}

export interface CollectionItem {
  id: string;
  amount: number;
  payment_date: string;
  payment_method: string;
  payment_reference: string | null;
  proof_object_key: string | null;
  notes: string | null;
  recorded_by: string;
  recorded_by_name: string;
  created_at: string;
}

export type ReceivableCollectionProofStatus =
  | "prepared"
  | "uploaded"
  | "attached"
  | "expired"
  | "missing";

export type ReceivableCollectionProofSource = "draft" | "none";

export interface ReceivableCollectionProofSummary {
  status: ReceivableCollectionProofStatus;
  objectKey: string | null;
  fileName: string | null;
  mimeType: string | null;
  fileSizeBytes: number | null;
  uploadedAt: string | null;
  attachedAt: string | null;
  source: ReceivableCollectionProofSource;
}

export interface ListReceivablesFilters {
  search?: string;
  status?: string;
  consigner_id?: string;
  aging?: string;
  limit?: number;
  offset?: number;
}

function buildQuery(filters: ListReceivablesFilters = {}) {
  const params = new URLSearchParams();
  if (filters.search) params.set("search", filters.search);
  if (filters.status) params.set("status", filters.status);
  if (filters.consigner_id) params.set("consigner_id", filters.consigner_id);
  if (filters.aging) params.set("aging", filters.aging);
  if (typeof filters.limit === "number") params.set("limit", String(filters.limit));
  if (typeof filters.offset === "number") params.set("offset", String(filters.offset));
  const q = params.toString();
  return q ? `?${q}` : "";
}

export async function listReceivables(filters: ListReceivablesFilters = {}): Promise<ReceivableListResponse> {
  return apiRequest(`/api/receivables${buildQuery(filters)}`);
}

export async function getReceivablesSummary(): Promise<ReceivableSummary> {
  return apiRequest("/api/receivables/summary");
}

export async function recordCollection(
  receivableId: string,
  input: {
    amount: number;
    paymentDate: string;
    paymentMethod: string;
    paymentReference?: string;
    proofObjectKey?: string;
    notes?: string;
  },
) {
  return apiRequest(`/api/receivables/${receivableId}/collect`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

export async function getReceivableCollectionProofUpload(
  receivableId: string,
): Promise<ReceivableCollectionProofSummary> {
  return apiRequest(`/api/receivables/${receivableId}/proof`, {
    method: "GET",
    cache: "no-store",
  });
}

export async function prepareReceivableCollectionProofUpload(
  receivableId: string,
  input: {
    fileName: string;
    mimeType: string;
    fileSizeBytes: number;
  },
): Promise<{ uploadUrl: string; objectKey: string; expiresIn: number | null }> {
  return apiRequest(`/api/receivables/${receivableId}/proof/prepare`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

export async function confirmReceivableCollectionProofUpload(
  receivableId: string,
  input: {
    objectKey: string;
    fileName: string;
    mimeType: string;
    fileSizeBytes: number;
  },
): Promise<{ objectKey: string; uploadedAt: string | null; status: string | null }> {
  return apiRequest(`/api/receivables/${receivableId}/proof/confirm`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

export async function getCollectionHistory(receivableId: string): Promise<CollectionItem[]> {
  return apiRequest(`/api/receivables/${receivableId}/collections`);
}

export interface ConsignerOutstanding {
  consigner_name: string;
  total_outstanding: number;
  receivables: {
    id: string;
    trip_number: string;
    invoice_amount: number;
    amount_received: number;
    amount_outstanding: number;
    due_date: string;
    days_overdue: number;
  }[];
}

export interface BulkCollectionResult {
  success: boolean;
  total_amount: number;
  amount_allocated: number;
  amount_unallocated: number;
  collections_created: number;
  receivables_settled: number;
  allocations: { trip_number: string; allocated: number; was_outstanding: number }[];
}

export async function getConsignerOutstanding(consignerId: string): Promise<ConsignerOutstanding> {
  return apiRequest(`/api/receivables/consigner-outstanding?consigner_id=${consignerId}`);
}

export async function bulkCollect(input: {
  consignerProfileId: string;
  totalAmount: number;
  paymentDate: string;
  paymentMethod: string;
  paymentReference?: string;
  proofObjectKey?: string;
  notes?: string;
}): Promise<BulkCollectionResult> {
  return apiRequest("/api/receivables/bulk-collect", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

export async function getBulkReceivableCollectionProofUpload(
  consignerProfileId: string,
): Promise<ReceivableCollectionProofSummary> {
  return apiRequest(`/api/receivables/bulk-collect/proof?consignerProfileId=${encodeURIComponent(consignerProfileId)}`, {
    method: "GET",
    cache: "no-store",
  });
}

export async function prepareBulkReceivableCollectionProofUpload(
  consignerProfileId: string,
  input: {
    fileName: string;
    mimeType: string;
    fileSizeBytes: number;
  },
): Promise<{ uploadUrl: string; objectKey: string; expiresIn: number | null }> {
  return apiRequest("/api/receivables/bulk-collect/proof/prepare", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ consignerProfileId, ...input }),
  });
}

export async function confirmBulkReceivableCollectionProofUpload(
  consignerProfileId: string,
  input: {
    objectKey: string;
    fileName: string;
    mimeType: string;
    fileSizeBytes: number;
  },
): Promise<{ objectKey: string; uploadedAt: string | null; status: string | null }> {
  return apiRequest("/api/receivables/bulk-collect/proof/confirm", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ consignerProfileId, ...input }),
  });
}
