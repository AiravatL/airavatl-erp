import { apiRequest } from "@/lib/api/http";

export type TripRequestStatus = "pending_review" | "converted" | "rejected" | "cancelled";
export type TripRequestSource = "enterprise_portal" | "erp_sales";

export interface TripRequestListItem {
  id: string;
  request_number: string;
  status: TripRequestStatus;
  source: TripRequestSource;
  consigner_id: string;
  consigner_display: string | null;
  consigner_phone: string | null;
  pickup_address: string;
  pickup_city: string | null;
  pickup_state: string | null;
  delivery_address: string;
  delivery_city: string | null;
  delivery_state: string | null;
  cargo_description: string;
  preferred_pickup_at: string | null;
  created_by: string;
  delivery_request_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface TripRequestListResponse {
  total: number;
  limit: number;
  offset: number;
  items: TripRequestListItem[];
}

export interface TripRequestDetail extends TripRequestListItem {
  pickup_latitude: number | null;
  pickup_longitude: number | null;
  pickup_place_id: string | null;
  pickup_contact_name: string | null;
  pickup_contact_phone: string | null;
  delivery_latitude: number | null;
  delivery_longitude: number | null;
  delivery_place_id: string | null;
  delivery_contact_name: string | null;
  delivery_contact_phone: string | null;
  cargo_weight_kg: number | null;
  cargo_type: string | null;
  special_instructions: string | null;
  notes: string | null;
  accepted_by: string | null;
  accepted_at: string | null;
  rejected_by: string | null;
  rejected_at: string | null;
  rejection_reason: string | null;
  cancelled_by: string | null;
  cancelled_at: string | null;
  cancelled_reason: string | null;
  consigner_business_name: string | null;
  linked_delivery_request_number: string | null;
  created_by_full_name: string | null;
  created_by_role: string | null;
}

export interface ListTripRequestsParams {
  status?: TripRequestStatus;
  search?: string;
  source?: TripRequestSource;
  consignerId?: string;
  limit?: number;
  offset?: number;
}

export interface CreateTripRequestInput {
  consignerId: string;
  pickupAddress: string;
  pickupCity?: string;
  pickupState?: string;
  pickupLatitude?: number;
  pickupLongitude?: number;
  pickupPlaceId?: string;
  deliveryAddress: string;
  deliveryCity?: string;
  deliveryState?: string;
  deliveryLatitude?: number;
  deliveryLongitude?: number;
  deliveryPlaceId?: string;
  cargoDescription: string;
  cargoWeightKg?: number;
  cargoType?: string;
  specialInstructions?: string;
  preferredPickupAt?: string;
  notes?: string;
}

export interface CreateTripRequestResult {
  id: string;
  requestNumber: string;
  status: TripRequestStatus;
}

export async function listTripRequests(
  params: ListTripRequestsParams = {},
): Promise<TripRequestListResponse> {
  const sp = new URLSearchParams();
  if (params.status) sp.set("status", params.status);
  if (params.search) sp.set("search", params.search);
  if (params.source) sp.set("source", params.source);
  if (params.consignerId) sp.set("consignerId", params.consignerId);
  if (params.limit != null) sp.set("limit", String(params.limit));
  if (params.offset != null) sp.set("offset", String(params.offset));
  const qs = sp.toString();
  return apiRequest<TripRequestListResponse>(
    `/api/trip-requests${qs ? `?${qs}` : ""}`,
    { method: "GET", cache: "no-store" },
  );
}

export async function getTripRequest(id: string): Promise<TripRequestDetail> {
  return apiRequest<TripRequestDetail>(`/api/trip-requests/${id}`, {
    method: "GET",
    cache: "no-store",
  });
}

export async function createTripRequest(
  input: CreateTripRequestInput,
): Promise<CreateTripRequestResult> {
  return apiRequest<CreateTripRequestResult>("/api/trip-requests", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

export async function rejectTripRequest(id: string, reason: string): Promise<void> {
  await apiRequest<{ id: string; status: TripRequestStatus }>(
    `/api/trip-requests/${id}/reject`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason }),
    },
  );
}

export async function cancelTripRequest(id: string, reason?: string): Promise<void> {
  await apiRequest<{ id: string; status: TripRequestStatus }>(
    `/api/trip-requests/${id}/cancel`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason: reason ?? null }),
    },
  );
}

export async function linkTripRequestToAuction(
  id: string,
  deliveryRequestId: string,
): Promise<{ id: string; status: TripRequestStatus; deliveryRequestId: string }> {
  return apiRequest<{ id: string; status: TripRequestStatus; deliveryRequestId: string }>(
    `/api/trip-requests/${id}/link`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ deliveryRequestId }),
    },
  );
}
