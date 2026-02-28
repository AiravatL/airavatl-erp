import { apiRequest } from "@/lib/api/http";

export interface FleetVehicle {
  id: string;
  number: string;
  type: string;
  ownershipType: "leased" | "vendor";
  status: "available" | "on_trip" | "maintenance";
  vendorId: string | null;
  vendorName: string | null;
  isOwnerDriver: boolean;
  hasPolicy: boolean;
  currentTripId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface FleetVendor {
  id: string;
  name: string;
  contactPhone: string | null;
  kycStatus: "verified" | "pending" | "rejected";
  active: boolean;
  notes: string | null;
  vehiclesCount: number;
  driversCount: number;
  isOwnerDriver: boolean;
}

export interface FleetVendorDetail extends FleetVendor {
  driversCount: number;
}

export interface FleetVendorDriver {
  id: string;
  vendorId: string;
  fullName: string;
  phone: string;
  alternatePhone: string | null;
  isOwnerDriver: boolean;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface FleetVendorVehicle {
  id: string;
  number: string;
  type: string;
  vehicleLength: string | null;
  ownershipType: "leased" | "vendor";
  status: "available" | "on_trip" | "maintenance";
  vendorId: string;
  currentTripId: string | null;
  currentDriverId: string | null;
  currentDriverName: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ListFleetVehiclesFilters {
  search?: string;
  status?: string;
  ownershipKind?: "leased" | "vendor" | "owner_driver";
  vehicleType?: string;
  limit?: number;
  offset?: number;
}

export interface ListFleetVendorsFilters {
  search?: string;
  vendorKind?: "vendor" | "owner_driver";
  vehicleType?: string;
  limit?: number;
  offset?: number;
}

function buildQuery(paramsInput: Record<string, string | number | undefined | null>) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(paramsInput)) {
    if (value === undefined || value === null || value === "") continue;
    params.set(key, String(value));
  }
  const query = params.toString();
  return query ? `?${query}` : "";
}

export async function listFleetVehicles(
  filters: ListFleetVehiclesFilters = {},
): Promise<FleetVehicle[]> {
  return apiRequest<FleetVehicle[]>(
    `/api/fleet/vehicles${buildQuery({
      search: filters.search,
      status: filters.status,
      ownershipKind: filters.ownershipKind,
      vehicleType: filters.vehicleType,
      limit: filters.limit,
      offset: filters.offset,
    })}`,
    {
      method: "GET",
      cache: "no-store",
    },
  );
}

export async function listFleetVendors(
  filters: ListFleetVendorsFilters = {},
): Promise<FleetVendor[]> {
  return apiRequest<FleetVendor[]>(
    `/api/fleet/vendors${buildQuery({
      search: filters.search,
      vendorKind: filters.vendorKind,
      vehicleType: filters.vehicleType,
      limit: filters.limit,
      offset: filters.offset,
    })}`,
    {
      method: "GET",
      cache: "no-store",
    },
  );
}

export async function getFleetVendor(vendorId: string): Promise<FleetVendorDetail> {
  return apiRequest<FleetVendorDetail>(`/api/fleet/vendors/${vendorId}`, {
    method: "GET",
    cache: "no-store",
  });
}

export async function listFleetVendorDrivers(
  vendorId: string,
  filters: { search?: string } = {},
): Promise<FleetVendorDriver[]> {
  return apiRequest<FleetVendorDriver[]>(
    `/api/fleet/vendors/${vendorId}/drivers${buildQuery({
      search: filters.search,
    })}`,
    {
      method: "GET",
      cache: "no-store",
    },
  );
}

export async function createFleetVendorDriver(
  vendorId: string,
  input: {
    fullName: string;
    phone: string;
    alternatePhone?: string | null;
    isOwnerDriver?: boolean;
  },
): Promise<FleetVendorDriver> {
  return apiRequest<FleetVendorDriver>(`/api/fleet/vendors/${vendorId}/drivers`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

export async function updateFleetVendorDriver(
  driverId: string,
  input: {
    fullName?: string;
    phone?: string;
    alternatePhone?: string | null;
    isOwnerDriver?: boolean;
  },
): Promise<FleetVendorDriver> {
  return apiRequest<FleetVendorDriver>(`/api/fleet/drivers/${driverId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

export async function setFleetVendorDriverActive(
  driverId: string,
  active: boolean,
): Promise<FleetVendorDriver> {
  return apiRequest<FleetVendorDriver>(`/api/fleet/drivers/${driverId}/active`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ active }),
  });
}

export async function listFleetVendorVehicles(
  vendorId: string,
  filters: { search?: string } = {},
): Promise<FleetVendorVehicle[]> {
  return apiRequest<FleetVendorVehicle[]>(
    `/api/fleet/vendors/${vendorId}/vehicles${buildQuery({
      search: filters.search,
    })}`,
    {
      method: "GET",
      cache: "no-store",
    },
  );
}

export async function createFleetVendorVehicle(
  vendorId: string,
  input: {
    number: string;
    type: string;
    vehicleLength?: string | null;
  },
): Promise<FleetVendorVehicle> {
  return apiRequest<FleetVendorVehicle>(`/api/fleet/vendors/${vendorId}/vehicles`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

export async function updateFleetVendorVehicle(
  vehicleId: string,
  input: {
    number?: string;
    type?: string;
    vehicleLength?: string | null;
  },
): Promise<FleetVendorVehicle> {
  return apiRequest<FleetVendorVehicle>(`/api/fleet/vehicles/${vehicleId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

export async function assignFleetVehicleDriver(
  vehicleId: string,
  driverId: string,
): Promise<{ vehicleId: string; driverId: string; driverName: string }> {
  return apiRequest<{ vehicleId: string; driverId: string; driverName: string }>(
    `/api/fleet/vehicles/${vehicleId}/assign-driver`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ driverId }),
    },
  );
}
