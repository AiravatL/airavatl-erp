import { apiRequest } from "@/lib/api/http";
import type { VerificationUploadSummary } from "@/lib/types";
import type {
  PendingVerificationItem,
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
  individualDriverCount: number;
  transporterCount: number;
  employeeDriverCount: number;
  vehicleCount: number;
  items: PendingVerificationItem[];
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

// ------------------------------------------------------------------
// Transporter fleet + employee driver + vehicle verification
// ------------------------------------------------------------------

export interface TransporterFleetVehicle {
  id: string;
  registration_number: string;
  is_verified: boolean;
  verified_at: string | null;
  verification_notes: string | null;
  status: string;
  vehicle_master_type_id: string | null;
  vehicle_type_label: string | null;
  body_type: "open" | "container" | null;
  capacity_tons: number | null;
  length_feet: number | null;
  wheel_count: number | null;
  model: string | null;
  registration_certificate_url: string | null;
  fleet_active: boolean;
  created_at: string;
}

export interface TransporterFleetEmployeeDriver {
  id: string;
  user_id: string;
  full_name: string;
  phone: string | null;
  employee_id: string | null;
  license_number: string | null;
  license_expiry_date: string | null;
  aadhar_number: string | null;
  employment_status: string;
  is_documents_verified: boolean;
  verified_at: string | null;
  verification_notes: string | null;
  total_trips_completed: number;
  average_rating: number | null;
}

export interface TransporterFleet {
  transporter_id: string;
  vehicles: TransporterFleetVehicle[];
  employee_drivers: TransporterFleetEmployeeDriver[];
}

export async function getTransporterFleet(
  transporterUserId: string,
): Promise<TransporterFleet> {
  return apiRequest<TransporterFleet>(
    `/api/verification/transporter/${transporterUserId}/fleet`,
    { method: "GET", cache: "no-store" },
  );
}

export interface VehicleVerificationDetail {
  id: string;
  registration_number: string;
  is_verified: boolean;
  verified_at: string | null;
  verified_by: string | null;
  verification_notes: string | null;
  status: string | null;
  registration_certificate_url: string | null;
  length_feet: number | null;
  capacity_tons: number | null;
  wheel_count: number | null;
  body_type: "open" | "container" | null;
  vehicle_master_type_id: string | null;
  vehicle_type_label: string | null;
  owner_type: "transporter" | "individual_driver" | null;
  owner_id: string | null;
  owner: {
    user_id: string;
    full_name: string;
    phone: string | null;
    organization_name?: string | null;
  } | null;
  created_at: string;
  updated_at: string;
}

export async function getVehicleVerification(
  vehicleId: string,
): Promise<VehicleVerificationDetail> {
  return apiRequest<VehicleVerificationDetail>(
    `/api/verification/vehicle/${vehicleId}`,
    { method: "GET", cache: "no-store" },
  );
}

export async function verifyVehicle(
  vehicleId: string,
  input: { verificationNotes?: string },
): Promise<{ vehicle_id: string; verified_at: string }> {
  return apiRequest(`/api/verification/vehicle/${vehicleId}/verify`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

export async function prepareVehicleRcUpload(
  vehicleId: string,
  input: { fileName: string; mimeType: string },
): Promise<{ uploadUrl: string; objectKey: string; expiresIn: number | null }> {
  return apiRequest(`/api/verification/vehicle/${vehicleId}/upload/prepare`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

export async function confirmVehicleRcUpload(
  vehicleId: string,
  input: {
    objectKey: string;
    fileName: string;
    mimeType: string;
    fileSizeBytes: number;
  },
): Promise<{ vehicle_id: string; object_key: string }> {
  return apiRequest(`/api/verification/vehicle/${vehicleId}/upload/confirm`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

export async function revokeVehicle(
  vehicleId: string,
  input: { reason: string },
): Promise<void> {
  return apiRequest(`/api/verification/vehicle/${vehicleId}/verify`, {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

export interface EmployeeDriverVerificationDetail {
  id: string;
  user_id: string;
  employee_id: string | null;
  full_name: string;
  phone: string | null;
  license_number: string | null;
  license_expiry_date: string | null;
  license_photo_url: string | null;
  aadhar_number: string | null;
  aadhar_photo_url: string | null;
  emergency_contact_name: string | null;
  emergency_contact_phone: string | null;
  employment_start_date: string | null;
  employment_status: string;
  total_trips_completed: number;
  average_rating: number | null;
  is_documents_verified: boolean;
  verified_at: string | null;
  verification_notes: string | null;
  uploads?: {
    dl?: VerificationUploadSummary | null;
    aadhaar?: VerificationUploadSummary | null;
  };
  transporter: {
    id: string;
    user_id: string;
    full_name: string;
    organization_name: string | null;
    phone: string | null;
  };
}

export async function getEmployeeDriverVerification(
  driverId: string,
): Promise<EmployeeDriverVerificationDetail> {
  return apiRequest<EmployeeDriverVerificationDetail>(
    `/api/verification/employee-driver/${driverId}`,
    { method: "GET", cache: "no-store" },
  );
}

export async function updateEmployeeDriver(
  driverId: string,
  input: {
    licenseNumber?: string;
    licenseExpiryDate?: string;
    aadharNumber?: string;
    employeeId?: string;
    emergencyContactName?: string;
    emergencyContactPhone?: string;
  },
): Promise<void> {
  return apiRequest(`/api/verification/employee-driver/${driverId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

export async function verifyEmployeeDriver(
  driverId: string,
  input: { verificationNotes?: string },
): Promise<{ employee_driver_id: string; verified_at: string }> {
  return apiRequest(`/api/verification/employee-driver/${driverId}/verify`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

export async function revokeEmployeeDriver(
  driverId: string,
  input: { reason: string },
): Promise<void> {
  return apiRequest(`/api/verification/employee-driver/${driverId}/verify`, {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}
