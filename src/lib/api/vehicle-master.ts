import { apiRequest } from "@/lib/api/http";
import type { VehicleMasterTypeOption } from "@/lib/types";

export interface CreateVehicleMasterTypeInput {
  name: string;
  active?: boolean;
}

export interface UpdateVehicleMasterTypeInput {
  name?: string;
  active?: boolean;
  applyToLengths?: boolean;
}

export interface CreateVehicleMasterLengthInput {
  vehicleTypeId: string;
  lengthValue: string;
  active?: boolean;
}

export interface UpdateVehicleMasterLengthInput {
  vehicleTypeId?: string;
  lengthValue?: string;
  active?: boolean;
}

export async function listVehicleMasterOptions(): Promise<VehicleMasterTypeOption[]> {
  return apiRequest<VehicleMasterTypeOption[]>("/api/vehicle-master/options", {
    method: "GET",
    cache: "no-store",
  });
}

export async function listAdminVehicleMaster(): Promise<VehicleMasterTypeOption[]> {
  return apiRequest<VehicleMasterTypeOption[]>("/api/admin/vehicle-master", {
    method: "GET",
    cache: "no-store",
  });
}

export async function createVehicleMasterType(
  input: CreateVehicleMasterTypeInput,
): Promise<{ id: string; name: string; active: boolean }> {
  return apiRequest<{ id: string; name: string; active: boolean }>("/api/admin/vehicle-master/types", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

export async function updateVehicleMasterType(
  typeId: string,
  input: UpdateVehicleMasterTypeInput,
): Promise<{ id: string; name: string; active: boolean }> {
  return apiRequest<{ id: string; name: string; active: boolean }>(
    `/api/admin/vehicle-master/types/${typeId}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    },
  );
}

export async function createVehicleMasterLength(
  input: CreateVehicleMasterLengthInput,
): Promise<{ id: string; vehicleTypeId: string; lengthValue: string; active: boolean }> {
  return apiRequest<{ id: string; vehicleTypeId: string; lengthValue: string; active: boolean }>(
    "/api/admin/vehicle-master/lengths",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    },
  );
}

export async function updateVehicleMasterLength(
  lengthId: string,
  input: UpdateVehicleMasterLengthInput,
): Promise<{ id: string; vehicleTypeId: string; lengthValue: string; active: boolean }> {
  return apiRequest<{ id: string; vehicleTypeId: string; lengthValue: string; active: boolean }>(
    `/api/admin/vehicle-master/lengths/${lengthId}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    },
  );
}
