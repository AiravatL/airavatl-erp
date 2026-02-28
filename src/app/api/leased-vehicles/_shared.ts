import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import type { Role, RouteTerrain } from "@/lib/types";

export const dynamic = "force-dynamic";

export const LEASED_VEHICLE_READ_ROLES: Role[] = [
  "admin",
  "super_admin",
  "operations_vehicles",
  "operations_consigner",
];

export const LEASED_VEHICLE_WRITE_ROLES: Role[] = ["admin", "super_admin"];

export interface LeasedVehicleActor {
  id: string;
  role: Role;
  full_name: string;
  active: boolean;
}

export interface LeasedVehicleRow {
  id: string;
  number: string;
  type: string;
  vehicle_length: string | null;
  status: string;
  vendor_id: string | null;
  vendor_name: string | null;
  leased_driver_name: string | null;
  leased_driver_phone: string | null;
  policy_id: string | null;
  driver_da_per_day: number | string;
  vehicle_rent_per_day: number | string;
  mileage_min: number | string;
  mileage_max: number | string;
  default_terrain: string;
  fuel_variance_threshold_percent: number | string;
  unofficial_gate_cap: number | string | null;
  dala_kharcha_cap: number | string | null;
  parking_cap: number | string | null;
  created_at: string;
  updated_at: string;
}

export interface LeasedVehicle {
  id: string;
  number: string;
  type: string;
  vehicleLength: string | null;
  status: "available" | "on_trip" | "maintenance";
  vendorId: string | null;
  vendorName: string | null;
  leasedDriverName: string | null;
  leasedDriverPhone: string | null;
  policyId: string | null;
  driverDaPerDay: number;
  vehicleRentPerDay: number;
  mileageMin: number;
  mileageMax: number;
  defaultTerrain: RouteTerrain;
  fuelVarianceThresholdPercent: number;
  unofficialGateCap: number | null;
  dalaKharchaCap: number | null;
  parkingCap: number | null;
  createdAt: string;
  updatedAt: string;
}

function toNumber(value: number | string | null | undefined): number {
  if (typeof value === "number") return value;
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function toNullableNumber(value: number | string | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function normalizeLeasedVehicleRow(row: LeasedVehicleRow): LeasedVehicle {
  return {
    id: row.id,
    number: row.number,
    type: row.type,
    vehicleLength: row.vehicle_length ?? null,
    status: row.status as LeasedVehicle["status"],
    vendorId: row.vendor_id,
    vendorName: row.vendor_name,
    leasedDriverName: row.leased_driver_name ?? null,
    leasedDriverPhone: row.leased_driver_phone ?? null,
    policyId: row.policy_id,
    driverDaPerDay: toNumber(row.driver_da_per_day),
    vehicleRentPerDay: toNumber(row.vehicle_rent_per_day),
    mileageMin: toNumber(row.mileage_min),
    mileageMax: toNumber(row.mileage_max),
    defaultTerrain: (row.default_terrain || "plain") as RouteTerrain,
    fuelVarianceThresholdPercent: toNumber(row.fuel_variance_threshold_percent),
    unofficialGateCap: toNullableNumber(row.unofficial_gate_cap),
    dalaKharchaCap: toNullableNumber(row.dala_kharcha_cap),
    parkingCap: toNullableNumber(row.parking_cap),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function requireLeasedVehicleActor(mode: "read" | "write") {
  const supabase = await getSupabaseServerClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return { error: NextResponse.json({ ok: false, message: "Unauthorized" }, { status: 401 }) };
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("id, role, active, full_name")
    .eq("id", user.id)
    .single();

  if (profileError || !profile || !profile.active) {
    return { error: NextResponse.json({ ok: false, message: "Unauthorized" }, { status: 401 }) };
  }

  const actor = profile as LeasedVehicleActor;
  const allowedRoles = mode === "write" ? LEASED_VEHICLE_WRITE_ROLES : LEASED_VEHICLE_READ_ROLES;

  if (!allowedRoles.includes(actor.role)) {
    return { error: NextResponse.json({ ok: false, message: "Forbidden" }, { status: 403 }) };
  }

  return { supabase, actor };
}

export function mapRpcError(message: string, code?: string) {
  if (message?.includes("forbidden")) return NextResponse.json({ ok: false, message: "Forbidden" }, { status: 403 });
  if (message?.includes("not_found")) return NextResponse.json({ ok: false, message: "Not found" }, { status: 404 });
  if (message?.includes("invalid_mileage")) return NextResponse.json({ ok: false, message: "Mileage min must be <= mileage max" }, { status: 400 });
  if (message?.includes("number_required")) return NextResponse.json({ ok: false, message: "Vehicle number is required" }, { status: 400 });
  if (message?.includes("type_required")) return NextResponse.json({ ok: false, message: "Vehicle type is required" }, { status: 400 });
  if (message?.includes("leased_driver_name_required")) return NextResponse.json({ ok: false, message: "Leased driver name is required" }, { status: 400 });
  if (message?.includes("leased_driver_phone_required")) return NextResponse.json({ ok: false, message: "Leased driver phone is required" }, { status: 400 });
  if (code === "23505") return NextResponse.json({ ok: false, message: "A vehicle with this number already exists" }, { status: 409 });
  if (code === "P0002") return NextResponse.json({ ok: false, message }, { status: 404 });
  if (code === "42501") return NextResponse.json({ ok: false, message }, { status: 403 });
  return NextResponse.json({ ok: false, message }, { status: 500 });
}
