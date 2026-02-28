import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import type { VehicleLead, VehicleLeadActivity, VehicleLeadActivityType, VehicleLeadStage } from "@/lib/types";

export const dynamic = "force-dynamic";

export interface VehicleCrmActor {
  id: string;
}

export interface VehicleLeadRow {
  id: string;
  driver_name: string;
  mobile: string;
  alternate_contact: string | null;
  owner_name: string | null;
  owner_contact: string | null;
  is_owner_cum_driver: boolean;
  current_address: string | null;
  permanent_address: string | null;
  preferred_route: string | null;
  vehicle_type: string | null;
  vehicle_length: string | null;
  vehicle_capacity: string | null;
  vehicle_registration: string | null;
  market_rate: number | string | null;
  stage: VehicleLeadStage;
  remarks: string | null;
  added_by_id: string;
  next_follow_up: string | null;
  converted_vendor_id: string | null;
  created_at: string;
  updated_at: string;
  added_by_name?: string | null;
}

export interface VehicleLeadActivityRow {
  id: string;
  vehicle_lead_id: string;
  type: VehicleLeadActivityType;
  description: string;
  created_by_id: string;
  created_at: string;
  created_by_name?: string | null;
}

export const VEHICLE_LEAD_STAGES: VehicleLeadStage[] = [
  "new_entry",
  "contacted",
  "docs_pending",
  "onboarded",
  "rejected",
];
export const VEHICLE_LEAD_ACTIVITY_TYPES: VehicleLeadActivityType[] = [
  "call",
  "whatsapp",
  "meeting",
  "note",
  "stage_change",
  "doc_upload",
];

export const VEHICLE_LEAD_STAGE_LABELS: Record<VehicleLeadStage, string> = {
  new_entry: "New Entry",
  contacted: "Contacted",
  docs_pending: "Docs",
  onboarded: "Onboarded",
  rejected: "Rejected",
};

function toNumber(value: number | string | null | undefined): number {
  if (typeof value === "number") return value;
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function normalizeVehicleLeadRow(row: VehicleLeadRow): VehicleLead {
  return {
    id: row.id,
    driverName: row.driver_name,
    mobile: row.mobile,
    alternateContact: row.alternate_contact ?? "",
    ownerName: row.owner_name ?? "",
    ownerContact: row.owner_contact ?? "",
    isOwnerCumDriver: row.is_owner_cum_driver,
    currentAddress: row.current_address ?? "",
    permanentAddress: row.permanent_address ?? "",
    preferredRoute: row.preferred_route ?? "",
    vehicleType: row.vehicle_type ?? "",
    vehicleLength: row.vehicle_length ?? "",
    vehicleCapacity: row.vehicle_capacity ?? "",
    vehicleRegistration: row.vehicle_registration ?? "",
    marketRate: toNumber(row.market_rate),
    stage: row.stage,
    remarks: row.remarks ?? "",
    addedById: row.added_by_id,
    addedByName: row.added_by_name ?? "Unknown",
    nextFollowUp: row.next_follow_up,
    convertedVendorId: row.converted_vendor_id ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function normalizeVehicleLeadActivityRow(row: VehicleLeadActivityRow): VehicleLeadActivity {
  return {
    id: row.id,
    vehicleLeadId: row.vehicle_lead_id,
    type: row.type,
    description: row.description,
    createdBy: row.created_by_name ?? "Unknown",
    createdAt: row.created_at,
  };
}

export function isVehicleLeadStage(value: string): value is VehicleLeadStage {
  return VEHICLE_LEAD_STAGES.includes(value as VehicleLeadStage);
}

export function isVehicleLeadActivityType(value: string): value is VehicleLeadActivityType {
  return VEHICLE_LEAD_ACTIVITY_TYPES.includes(value as VehicleLeadActivityType);
}

export async function requireVehicleCrmActor() {
  const supabase = await getSupabaseServerClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return { error: NextResponse.json({ ok: false, message: "Unauthorized" }, { status: 401 }) };
  }

  return {
    supabase,
    actor: {
      id: user.id,
    } satisfies VehicleCrmActor,
  };
}
