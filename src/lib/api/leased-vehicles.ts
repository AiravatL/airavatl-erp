import { apiRequest } from "@/lib/api/http";
import type { LeasedVehicle } from "@/app/api/leased-vehicles/_shared";
import type { RouteTerrain } from "@/lib/types";

export type { LeasedVehicle } from "@/app/api/leased-vehicles/_shared";

export interface ListLeasedVehiclesFilters {
  search?: string;
  status?: string;
  limit?: number;
  offset?: number;
}

export interface CreateLeasedVehicleInput {
  number: string;
  type: string;
  vehicleLength?: string | null;
  vendorId?: string | null;
  leasedDriverName: string;
  leasedDriverPhone: string;
  driverDaPerDay: number;
  vehicleRentPerDay: number;
  mileageMin: number;
  mileageMax: number;
  defaultTerrain: RouteTerrain;
  fuelVarianceThresholdPercent: number;
  unofficialGateCap?: number | null;
  dalaKharchaCap?: number | null;
  parkingCap?: number | null;
}

export interface UpdateLeasedVehiclePolicyInput {
  driverDaPerDay?: number;
  vehicleRentPerDay?: number;
  mileageMin?: number;
  mileageMax?: number;
  defaultTerrain?: RouteTerrain;
  fuelVarianceThresholdPercent?: number;
  unofficialGateCap?: number | null;
  dalaKharchaCap?: number | null;
  parkingCap?: number | null;
}

export interface UpdateLeasedVehicleInput {
  number?: string;
  type?: string;
  vehicleLength?: string | null;
  vendorId?: string | null;
  leasedDriverName?: string | null;
  leasedDriverPhone?: string | null;
}

export interface VendorOption {
  id: string;
  name: string;
  contactPhone: string | null;
  kycStatus: string;
}

function buildQuery(filters: ListLeasedVehiclesFilters = {}) {
  const params = new URLSearchParams();
  if (filters.search) params.set("search", filters.search);
  if (filters.status) params.set("status", filters.status);
  if (typeof filters.limit === "number") params.set("limit", String(filters.limit));
  if (typeof filters.offset === "number") params.set("offset", String(filters.offset));
  const query = params.toString();
  return query ? `?${query}` : "";
}

export async function listLeasedVehicles(filters: ListLeasedVehiclesFilters = {}): Promise<LeasedVehicle[]> {
  return apiRequest<LeasedVehicle[]>(`/api/leased-vehicles${buildQuery(filters)}`, {
    method: "GET",
    cache: "no-store",
  });
}

export async function getLeasedVehicleById(id: string): Promise<LeasedVehicle> {
  return apiRequest<LeasedVehicle>(`/api/leased-vehicles/${id}`, {
    method: "GET",
    cache: "no-store",
  });
}

export async function createLeasedVehicle(input: CreateLeasedVehicleInput): Promise<LeasedVehicle> {
  return apiRequest<LeasedVehicle>("/api/leased-vehicles", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

export async function updateLeasedVehicle(id: string, input: UpdateLeasedVehicleInput): Promise<LeasedVehicle> {
  return apiRequest<LeasedVehicle>(`/api/leased-vehicles/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

export async function updateLeasedVehiclePolicy(id: string, input: UpdateLeasedVehiclePolicyInput): Promise<LeasedVehicle> {
  return apiRequest<LeasedVehicle>(`/api/leased-vehicles/${id}/policy`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

export async function listVendors(search?: string): Promise<VendorOption[]> {
  const params = new URLSearchParams();
  if (search) params.set("search", search);
  const query = params.toString();
  return apiRequest<VendorOption[]>(`/api/vendors${query ? `?${query}` : ""}`, {
    method: "GET",
    cache: "no-store",
  });
}
