import { apiRequest } from "@/lib/api/http";
import type { SelectWinnerResult } from "@/lib/types";

// -- Types --

export interface LocationInput {
  placeId?: string;
  formattedAddress: string;
  latitude: number;
  longitude: number;
  city: string;
  state?: string;
  primaryText?: string;
  secondaryText?: string;
  addressComponents?: unknown;
  contactName?: string;
  contactPhone?: string;
}

export interface CreateDeliveryRequestInput {
  consignerProfileId?: string;
  pickup: LocationInput;
  delivery: LocationInput;
  route?: {
    distanceKm?: number;
    durationMinutes?: number;
    polyline?: string;
  };
  vehicleType: string;
  cargoWeightKg?: number;
  cargoDescription?: string;
  cargoType?: string;
  specialInstructions?: string;
  consignmentDate: string;
  auctionDurationMinutes?: number;
  internalNotes?: string;
}

export interface CreateDeliveryRequestResult {
  requestId: string;
  requestNumber: string;
  auctionEndTime: string;
}

export interface AuctionConsigner {
  consignerId: string;
  displayName: string;
  phone: string;
  contactName: string;
  businessName: string;
  salesOwnerId: string;
  salesOwnerName: string;
}

export interface PlacePrediction {
  placeId: string;
  primaryText: string;
  secondaryText: string;
  fullText: string;
}

export interface PlaceDetails {
  placeId: string;
  formattedAddress: string;
  latitude: number;
  longitude: number;
  city: string;
  state: string | null;
  primaryText: string;
  secondaryText: string;
  addressComponents: Array<{ longName: string; shortName: string; types: string[] }> | null;
}

export interface RouteResult {
  distanceKm: number;
  durationMinutes: number | null;
  polyline: string | null;
}

// -- Auction List/Detail types --

export interface AuctionListItem {
  id: string;
  request_number: string;
  status: string;
  pickup_city: string;
  pickup_state: string | null;
  delivery_city: string;
  delivery_state: string | null;
  pickup_formatted_address: string;
  delivery_formatted_address: string;
  vehicle_type: string;
  cargo_weight_kg: number | null;
  consignment_date: string;
  auction_start_time: string | null;
  auction_end_time: string | null;
  auction_duration_minutes: number | null;
  total_bids_count: number;
  lowest_bid_amount: number | null;
  winner_bid_id: string | null;
  estimated_distance_km: number | null;
  consigner_name: string;
  consigner_business_name: string | null;
  erp_created_by_id: string | null;
  erp_created_by_name: string | null;
  source: "erp" | "app";
  created_at: string;
  updated_at: string;
}

export interface AuctionListResponse {
  total: number;
  limit: number;
  offset: number;
  items: AuctionListItem[];
}

export interface AuctionBidRow {
  id: string;
  bid_amount: number;
  bidder_id: string;
  bidder_type: string;
  bidder_name: string;
  bidder_phone: string;
  vehicle_id: string | null;
  status: string;
  is_shortlisted: boolean;
  shortlist_rank: number | null;
  estimated_pickup_time: string | null;
  estimated_delivery_time: string | null;
  bid_notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface AuctionDetailResponse {
  request: Record<string, unknown>;
  bids: AuctionBidRow[];
  winner_selection: Record<string, unknown> | null;
  erp_metadata: {
    created_by_admin_id: string;
    created_by_name: string;
    consigner_profile_id: string | null;
    consigner_profile_name: string | null;
    internal_notes: string | null;
    created_at: string;
  } | null;
  trip_metadata: {
    consigner_trip_amount: number;
    selected_by_admin_id: string;
    selected_by_name: string | null;
  } | null;
}

// -- Delivery Request API --

export async function listDeliveryRequests(filters: {
  search?: string;
  status?: string;
  source?: string;
  limit?: number;
  offset?: number;
}): Promise<AuctionListResponse> {
  const params = new URLSearchParams();
  if (filters.search) params.set("search", filters.search);
  if (filters.status) params.set("status", filters.status);
  if (filters.source) params.set("source", filters.source);
  if (filters.limit) params.set("limit", String(filters.limit));
  if (filters.offset) params.set("offset", String(filters.offset));
  const query = params.toString();
  return apiRequest<AuctionListResponse>(
    `/api/delivery-requests${query ? `?${query}` : ""}`,
    { method: "GET", cache: "no-store" },
  );
}

export async function getDeliveryRequest(
  requestId: string,
): Promise<AuctionDetailResponse> {
  return apiRequest<AuctionDetailResponse>(
    `/api/delivery-requests/${encodeURIComponent(requestId)}`,
    { method: "GET", cache: "no-store" },
  );
}

export async function cancelDeliveryRequest(
  requestId: string,
  reason?: string,
): Promise<{ requestId: string; status: string }> {
  return apiRequest<{ requestId: string; status: string }>(
    `/api/delivery-requests/${encodeURIComponent(requestId)}/cancel`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason }),
    },
  );
}

export async function selectAuctionWinner(
  requestId: string,
  bidId: string,
  consignerTripAmount: number,
): Promise<SelectWinnerResult> {
  return apiRequest<SelectWinnerResult>(
    `/api/delivery-requests/${encodeURIComponent(requestId)}/select-winner`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bid_id: bidId, consigner_trip_amount: consignerTripAmount }),
    },
  );
}

export async function createDeliveryRequest(
  input: CreateDeliveryRequestInput,
): Promise<CreateDeliveryRequestResult> {
  return apiRequest<CreateDeliveryRequestResult>("/api/delivery-requests", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

export async function listAuctionConsigners(
  search?: string,
): Promise<{ items: AuctionConsigner[] }> {
  const params = new URLSearchParams();
  if (search) params.set("search", search);
  const query = params.toString();
  return apiRequest<{ items: AuctionConsigner[] }>(
    `/api/delivery-requests/consigners${query ? `?${query}` : ""}`,
    { method: "GET", cache: "no-store" },
  );
}

// -- Google Maps Proxy API --

export async function searchPlaces(
  input: string,
  sessionToken?: string,
): Promise<{ predictions: PlacePrediction[] }> {
  const params = new URLSearchParams({ input });
  if (sessionToken) params.set("sessionToken", sessionToken);
  return apiRequest<{ predictions: PlacePrediction[] }>(
    `/api/maps/places?${params.toString()}`,
    { method: "GET", cache: "no-store" },
  );
}

export async function getPlaceDetails(placeId: string): Promise<PlaceDetails> {
  return apiRequest<PlaceDetails>(
    `/api/maps/place-details?placeId=${encodeURIComponent(placeId)}`,
    { method: "GET", cache: "no-store" },
  );
}

export async function getDirections(
  origin: { latitude: number; longitude: number },
  destination: { latitude: number; longitude: number },
): Promise<RouteResult> {
  const params = new URLSearchParams({
    originLat: String(origin.latitude),
    originLng: String(origin.longitude),
    destLat: String(destination.latitude),
    destLng: String(destination.longitude),
  });
  return apiRequest<RouteResult>(
    `/api/maps/directions?${params.toString()}`,
    { method: "GET", cache: "no-store" },
  );
}
