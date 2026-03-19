import { apiRequest } from "@/lib/api/http";
import type { VehicleMasterCatalog, VehicleMasterVehicle, VehicleMasterSegment, VehicleMasterTypeOption } from "@/lib/types";

/* ---------- List ---------- */

export async function listVehicleMasterCatalog(includeInactive = false): Promise<VehicleMasterCatalog> {
  const qs = includeInactive ? "?includeInactive=true" : "";
  const raw = await apiRequest<{ vehicles: Record<string, unknown>[]; segments: Record<string, unknown>[] }>(
    `/api/admin/vehicle-master${qs}`,
    { method: "GET", cache: "no-store" },
  );
  return {
    vehicles: raw.vehicles.map(normalizeVehicle),
    segments: raw.segments.map(normalizeSegment),
  };
}

export async function listVehicleMasterOptions(): Promise<VehicleMasterTypeOption[]> {
  const raw = await apiRequest<{ vehicles: Record<string, unknown>[]; segments: Record<string, unknown>[] }>(
    "/api/vehicle-master/options",
    { method: "GET", cache: "no-store" },
  );
  // Return backward-compatible VehicleMasterTypeOption[] shape for existing callers
  return raw.vehicles.map((v) => ({
    id: String(v.id ?? ""),
    name: String(v.name ?? ""),
    active: Boolean(v.active),
    lengths: [],
  }));
}

/* ---------- Vehicle CRUD ---------- */

export interface UpsertVehicleInput {
  capacityTons: number;
  lengthFeet?: number | null;
  bodyType: string;
  wheelCount?: number | null;
  active?: boolean;
}

export async function createVehicle(input: UpsertVehicleInput): Promise<VehicleMasterVehicle> {
  const raw = await apiRequest<Record<string, unknown>>("/api/admin/vehicle-master/vehicles", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  return normalizeVehicle(raw);
}

export async function updateVehicle(vehicleId: string, input: UpsertVehicleInput): Promise<VehicleMasterVehicle> {
  const raw = await apiRequest<Record<string, unknown>>(`/api/admin/vehicle-master/vehicles/${vehicleId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  return normalizeVehicle(raw);
}

export async function deleteVehicle(vehicleId: string): Promise<void> {
  await apiRequest<null>(`/api/admin/vehicle-master/vehicles/${vehicleId}`, { method: "DELETE" });
}

/* ---------- Segment CRUD ---------- */

export interface UpsertSegmentInput {
  bodyType: string;
  label: string;
  weightMinKg: number;
  weightMaxKg?: number | null;
  active?: boolean;
}

export async function createSegment(input: UpsertSegmentInput): Promise<VehicleMasterSegment> {
  const raw = await apiRequest<Record<string, unknown>>("/api/admin/vehicle-master/segments", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  return normalizeSegment(raw);
}

export async function updateSegment(segmentId: string, input: UpsertSegmentInput): Promise<VehicleMasterSegment> {
  const raw = await apiRequest<Record<string, unknown>>(`/api/admin/vehicle-master/segments/${segmentId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  return normalizeSegment(raw);
}

export async function deleteSegment(segmentId: string): Promise<void> {
  await apiRequest<null>(`/api/admin/vehicle-master/segments/${segmentId}`, { method: "DELETE" });
}

/* ---------- Normalizers ---------- */

function toNum(v: unknown): number {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function normalizeVehicle(raw: Record<string, unknown>): VehicleMasterVehicle {
  return {
    id: String(raw.id ?? ""),
    capacityTons: toNum(raw.capacity_tons),
    lengthFeet: raw.length_feet != null ? toNum(raw.length_feet) : null,
    bodyType: String(raw.body_type ?? "open"),
    wheelCount: raw.wheel_count != null ? toNum(raw.wheel_count) : null,
    name: String(raw.name ?? ""),
    code: String(raw.code ?? ""),
    active: Boolean(raw.active),
    displayOrder: toNum(raw.display_order),
  };
}

function normalizeSegment(raw: Record<string, unknown>): VehicleMasterSegment {
  return {
    id: String(raw.id ?? ""),
    bodyType: String(raw.body_type ?? "open"),
    label: String(raw.label ?? ""),
    weightMinKg: toNum(raw.weight_min_kg),
    weightMaxKg: raw.weight_max_kg != null ? toNum(raw.weight_max_kg) : null,
    active: Boolean(raw.active),
    displayOrder: toNum(raw.display_order),
  };
}
