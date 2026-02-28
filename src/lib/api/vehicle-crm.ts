import { apiRequest } from "@/lib/api/http";
import type { VehicleLead, VehicleLeadActivity, VehicleLeadActivityType, VehicleLeadStage } from "@/lib/types";

export interface ListVehicleLeadsFilters {
  search?: string;
  stage?: VehicleLeadStage | "all";
  vehicleType?: string;
  limit?: number;
  offset?: number;
}

export interface CreateVehicleLeadInput {
  driverName: string;
  mobile: string;
  alternateContact?: string;
  ownerName?: string;
  ownerContact?: string;
  isOwnerCumDriver: boolean;
  currentAddress?: string;
  permanentAddress?: string;
  preferredRoute?: string;
  vehicleType: string;
  vehicleLength?: string;
  vehicleCapacity?: string;
  vehicleRegistration?: string;
  marketRate?: number | null;
  remarks?: string;
  nextFollowUp?: string | null;
  stage?: VehicleLeadStage;
}

export interface UpdateVehicleLeadInput extends Partial<CreateVehicleLeadInput> {
  stage?: VehicleLeadStage;
}

export interface MoveVehicleLeadStageInput {
  toStage: VehicleLeadStage;
  note?: string;
}

export interface AddVehicleLeadActivityInput {
  type: VehicleLeadActivityType;
  description: string;
}

export interface OnboardVehicleLeadInput {
  onboardMode?: "create_new_vendor" | "attach_to_existing_vendor";
  existingVendorId?: string;
  vendorName?: string;
  vendorPhone?: string;
  vendorNotes?: string;
}

function buildQuery(filters: ListVehicleLeadsFilters = {}) {
  const params = new URLSearchParams();
  if (filters.search) params.set("search", filters.search);
  if (filters.stage) params.set("stage", filters.stage);
  if (filters.vehicleType) params.set("vehicleType", filters.vehicleType);
  if (typeof filters.limit === "number") params.set("limit", String(filters.limit));
  if (typeof filters.offset === "number") params.set("offset", String(filters.offset));
  const query = params.toString();
  return query ? `?${query}` : "";
}

export async function listVehicleLeads(filters: ListVehicleLeadsFilters = {}): Promise<VehicleLead[]> {
  return apiRequest<VehicleLead[]>(`/api/vehicle-crm/leads${buildQuery(filters)}`, {
    method: "GET",
    cache: "no-store",
  });
}

export async function getVehicleLeadById(leadId: string): Promise<VehicleLead> {
  return apiRequest<VehicleLead>(`/api/vehicle-crm/leads/${leadId}`, {
    method: "GET",
    cache: "no-store",
  });
}

export async function createVehicleLead(input: CreateVehicleLeadInput): Promise<VehicleLead> {
  return apiRequest<VehicleLead>("/api/vehicle-crm/leads", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(input),
  });
}

export async function updateVehicleLead(leadId: string, input: UpdateVehicleLeadInput): Promise<VehicleLead> {
  return apiRequest<VehicleLead>(`/api/vehicle-crm/leads/${leadId}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(input),
  });
}

export async function moveVehicleLeadStage(
  leadId: string,
  input: MoveVehicleLeadStageInput,
): Promise<VehicleLead> {
  return apiRequest<VehicleLead>(`/api/vehicle-crm/leads/${leadId}/stage`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(input),
  });
}

export async function onboardVehicleLead(
  leadId: string,
  input: OnboardVehicleLeadInput,
): Promise<{ leadId: string; vendorId: string; vehicleId: string }> {
  return apiRequest<{ leadId: string; vendorId: string; vehicleId: string }>(
    `/api/vehicle-crm/leads/${leadId}/onboard`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    },
  );
}

export async function listVehicleLeadActivities(leadId: string): Promise<VehicleLeadActivity[]> {
  return apiRequest<VehicleLeadActivity[]>(`/api/vehicle-crm/leads/${leadId}/activities`, {
    method: "GET",
    cache: "no-store",
  });
}

export async function addVehicleLeadActivity(
  leadId: string,
  input: AddVehicleLeadActivityInput,
): Promise<VehicleLeadActivity> {
  return apiRequest<VehicleLeadActivity>(`/api/vehicle-crm/leads/${leadId}/activities`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(input),
  });
}
