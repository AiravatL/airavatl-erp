import { apiRequest } from "@/lib/api/http";
import type { AuditLogEntry, TripStage } from "@/lib/types";

export interface TripListItem {
  id: string;
  tripCode: string;
  customerId: string;
  customerName: string;
  pickupLocation: string;
  dropLocation: string;
  route: string;
  currentStage: TripStage;
  leasedFlag: boolean;
  vehicleType: string;
  vehicleLength: string;
  weightEstimate: number;
  plannedKm: number;
  scheduleDate: string;
  tripAmount: number | null;
  requestedById: string;
  requestedByName: string;
  salesOwnerId: string;
  salesOwnerName: string;
  opsOwnerId: string;
  opsOwnerName: string;
  opsVehiclesOwnerId: string;
  opsVehiclesOwnerName: string;
  accountsOwnerId: string;
  accountsOwnerName: string;
  vehicleId: string | null;
  vehicleNumber: string | null;
  driverName: string | null;
  driverPhone: string | null;
  vendorId: string | null;
  vendorName: string | null;
  vendorPhone: string | null;
  startedAt: string | null;
  startedById: string | null;
  completedAt: string | null;
  completedById: string | null;
  createdAt: string;
  updatedAt: string;
  internalNotes: string;
}

export interface ListTripsFilters {
  search?: string;
  stage?: TripStage | "all";
  limit?: number;
  offset?: number;
}

export interface ListTripHistoryFilters {
  search?: string;
  limit?: number;
  offset?: number;
  fromDate?: string;
  toDate?: string;
}

export interface CreateTripRequestInput {
  customerId: string;
  pickupLocation: string;
  dropLocation: string;
  vehicleType: string;
  vehicleLength?: string;
  weightEstimate?: number | null;
  plannedKm?: number | null;
  scheduleDate: string;
  tripAmount?: number | null;
  internalNotes?: string;
}

export interface UpdateTripRequestInput {
  pickupLocation?: string;
  dropLocation?: string;
  vehicleType?: string;
  vehicleLength?: string;
  weightEstimate?: number | null;
  plannedKm?: number | null;
  scheduleDate?: string;
  tripAmount?: number | null;
  internalNotes?: string;
}

export interface ConfirmTripInput {
  pickupLocation?: string;
  dropLocation?: string;
  vehicleType?: string;
  vehicleLength?: string;
  weightEstimate?: number | null;
  plannedKm?: number | null;
  scheduleDate?: string;
  tripAmount?: number | null;
  internalNotes?: string;
  opsVehiclesOwnerId?: string;
}

export interface OpsVehiclesUser {
  id: string;
  fullName: string;
}

export interface AvailableVehicle {
  id: string;
  number: string;
  type: string;
  vehicleLength: string;
  ownershipType: "leased" | "vendor";
  vendorId: string | null;
  vendorName: string;
  isOwnerDriver: boolean;
  currentDriverId: string | null;
  currentDriverName: string;
  leasedDriverName: string | null;
  leasedDriverPhone: string | null;
}

export type TripPaymentMethod = "bank" | "upi";

export interface TripPaymentRequestItem {
  id: string;
  tripId: string;
  type: string;
  amount: number;
  beneficiary: string;
  status: string;
  notes: string;
  requestedById: string;
  requestedByName: string;
  reviewedById: string | null;
  reviewedByName: string;
  reviewedAt: string | null;
  createdAt: string;
  paymentMethod: TripPaymentMethod | null;
  upiId: string | null;
  upiQrObjectKey: string | null;
}

export interface TripLoadingProofItem {
  id: string;
  tripId: string;
  proofType: string;
  objectKey: string;
  fileName: string;
  mimeType: string;
  fileSizeBytes: number;
  uploadedById: string;
  uploadedByName: string;
  createdAt: string;
}

export interface CreateAdvanceRequestInput {
  amount: number;
  beneficiary?: string;
  notes?: string;
  paymentMethod: TripPaymentMethod;
  bankAccountHolder?: string;
  bankAccountNumber?: string;
  bankIfsc?: string;
  bankName?: string;
  upiId?: string;
  upiQrObjectKey?: string;
  upiQrFileName?: string;
  upiQrMimeType?: string;
  upiQrSizeBytes?: number;
}

export interface CreateFinalPaymentRequestInput {
  amount?: number;
  beneficiary?: string;
  notes?: string;
  paymentMethod: TripPaymentMethod;
  bankAccountHolder?: string;
  bankAccountNumber?: string;
  bankIfsc?: string;
  bankName?: string;
  upiId?: string;
  upiQrObjectKey?: string;
  upiQrFileName?: string;
  upiQrMimeType?: string;
  upiQrSizeBytes?: number;
}

export interface PrepareUploadInput {
  fileName: string;
  mimeType: string;
  fileSizeBytes: number;
}

export interface PreparedUpload {
  uploadUrl: string;
  objectKey: string;
  expiresIn: number | null;
}

export interface TripPaymentSummary {
  tripId: string;
  tripCode: string;
  tripAmount: number;
  currentStage: string;
  paidAdvanceTotal: number;
  pendingAdvanceTotal: number;
  suggestedFinalAmount: number;
  paidBalanceTotal: number;
  isTripCompleted: boolean;
}

function buildQuery(filters: ListTripsFilters = {}) {
  const params = new URLSearchParams();
  if (filters.search) params.set("search", filters.search);
  if (filters.stage && filters.stage !== "all") params.set("stage", filters.stage);
  if (typeof filters.limit === "number") params.set("limit", String(filters.limit));
  if (typeof filters.offset === "number") params.set("offset", String(filters.offset));
  const query = params.toString();
  return query ? `?${query}` : "";
}

function buildHistoryQuery(filters: ListTripHistoryFilters = {}) {
  const params = new URLSearchParams();
  if (filters.search) params.set("search", filters.search);
  if (typeof filters.limit === "number") params.set("limit", String(filters.limit));
  if (typeof filters.offset === "number") params.set("offset", String(filters.offset));
  if (filters.fromDate) params.set("fromDate", filters.fromDate);
  if (filters.toDate) params.set("toDate", filters.toDate);
  const query = params.toString();
  return query ? `?${query}` : "";
}

export async function listTrips(filters: ListTripsFilters = {}): Promise<TripListItem[]> {
  return apiRequest<TripListItem[]>(`/api/trips${buildQuery(filters)}`, {
    method: "GET",
    cache: "no-store",
  });
}

export async function listTripHistory(filters: ListTripHistoryFilters = {}): Promise<TripListItem[]> {
  return apiRequest<TripListItem[]>(`/api/trips/history${buildHistoryQuery(filters)}`, {
    method: "GET",
    cache: "no-store",
  });
}

export async function getTripById(tripId: string): Promise<TripListItem> {
  return apiRequest<TripListItem>(`/api/trips/${tripId}`, {
    method: "GET",
    cache: "no-store",
  });
}

export async function createTripRequest(input: CreateTripRequestInput): Promise<{ tripId: string; tripCode: string }> {
  return apiRequest<{ tripId: string; tripCode: string }>("/api/trips", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

export async function updateTripRequest(
  tripId: string,
  input: UpdateTripRequestInput,
): Promise<{ tripId: string; tripCode: string }> {
  return apiRequest<{ tripId: string; tripCode: string }>(`/api/trips/${tripId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

export async function acceptTripRequest(tripId: string): Promise<{ tripId: string; tripCode: string; opsOwnerId: string }> {
  return apiRequest<{ tripId: string; tripCode: string; opsOwnerId: string }>(`/api/trips/${tripId}/accept`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });
}

export async function confirmTrip(
  tripId: string,
  input: ConfirmTripInput,
): Promise<{ tripId: string; tripCode: string }> {
  return apiRequest<{ tripId: string; tripCode: string }>(`/api/trips/${tripId}/confirm`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

export async function assignVehicle(
  tripId: string,
  vehicleId: string,
  driverId?: string | null,
): Promise<{ tripId: string; tripCode: string; vehicleNumber: string; opsVehiclesOwnerId: string }> {
  return apiRequest<{ tripId: string; tripCode: string; vehicleNumber: string; opsVehiclesOwnerId: string }>(
    `/api/trips/${tripId}/assign-vehicle`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ vehicleId, driverId: driverId ?? null }),
    },
  );
}

export async function listAvailableVehicles(filters: {
  vehicleType?: string;
  search?: string;
} = {}): Promise<AvailableVehicle[]> {
  const params = new URLSearchParams();
  if (filters.vehicleType) params.set("vehicleType", filters.vehicleType);
  if (filters.search) params.set("search", filters.search);
  const query = params.toString();
  return apiRequest<AvailableVehicle[]>(`/api/trips/available-vehicles${query ? `?${query}` : ""}`, {
    method: "GET",
    cache: "no-store",
  });
}

export async function listOpsVehiclesUsers(): Promise<OpsVehiclesUser[]> {
  return apiRequest<OpsVehiclesUser[]>("/api/trips/ops-vehicles-users", {
    method: "GET",
    cache: "no-store",
  });
}

export async function listTripPaymentRequests(tripId: string): Promise<TripPaymentRequestItem[]> {
  return apiRequest<TripPaymentRequestItem[]>(`/api/trips/${tripId}/payment-requests`, {
    method: "GET",
    cache: "no-store",
  });
}

export async function createTripAdvanceRequest(
  tripId: string,
  input: CreateAdvanceRequestInput,
): Promise<{
  id: string;
  trip_id: string;
  trip_code: string;
  amount: number;
  beneficiary: string;
  status: string;
  payment_method: string;
}> {
  return apiRequest<{
    id: string;
    trip_id: string;
    trip_code: string;
    amount: number;
    beneficiary: string;
    status: string;
    payment_method: string;
  }>(`/api/trips/${tripId}/advance-request`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

export async function listTripLoadingProofs(tripId: string): Promise<TripLoadingProofItem[]> {
  return apiRequest<TripLoadingProofItem[]>(`/api/trips/${tripId}/loading-proof`, {
    method: "GET",
    cache: "no-store",
  });
}

export async function listTripTimeline(tripId: string): Promise<AuditLogEntry[]> {
  return apiRequest<AuditLogEntry[]>(`/api/trips/${tripId}/timeline`, {
    method: "GET",
    cache: "no-store",
  });
}

export async function prepareTripLoadingProofUpload(
  tripId: string,
  input: PrepareUploadInput,
): Promise<PreparedUpload> {
  return apiRequest<PreparedUpload>(`/api/trips/${tripId}/loading-proof/prepare`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

export async function confirmTripLoadingProofUpload(
  tripId: string,
  input: {
    objectKey: string;
    fileName: string;
    mimeType: string;
    fileSizeBytes: number;
  },
): Promise<unknown> {
  return apiRequest<unknown>(`/api/trips/${tripId}/loading-proof/confirm`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

export async function prepareTripPodProofUpload(
  tripId: string,
  input: PrepareUploadInput,
): Promise<PreparedUpload> {
  return apiRequest<PreparedUpload>(`/api/trips/${tripId}/pod-proof/prepare`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

export async function confirmTripPodProofUpload(
  tripId: string,
  input: {
    objectKey: string;
    fileName: string;
    mimeType: string;
    fileSizeBytes: number;
  },
): Promise<unknown> {
  return apiRequest<unknown>(`/api/trips/${tripId}/pod-proof/confirm`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

export async function prepareTripAdvanceUpiQrUpload(
  tripId: string,
  input: PrepareUploadInput,
): Promise<PreparedUpload> {
  return apiRequest<PreparedUpload>(`/api/trips/${tripId}/advance-upi-qr/prepare`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

export async function getTripPaymentSummary(tripId: string): Promise<TripPaymentSummary> {
  return apiRequest<TripPaymentSummary>(`/api/trips/${tripId}/payment-summary`, {
    method: "GET",
    cache: "no-store",
  });
}

export async function createTripFinalPaymentRequest(
  tripId: string,
  input: CreateFinalPaymentRequestInput,
): Promise<{
  id: string;
  trip_id: string;
  trip_code: string;
  amount: number;
  suggested_amount: number;
  paid_advance_total: number;
  trip_amount: number;
  status: string;
  payment_method: string;
}> {
  return apiRequest<{
    id: string;
    trip_id: string;
    trip_code: string;
    amount: number;
    suggested_amount: number;
    paid_advance_total: number;
    trip_amount: number;
    status: string;
    payment_method: string;
  }>(`/api/trips/${tripId}/final-payment-request`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}
