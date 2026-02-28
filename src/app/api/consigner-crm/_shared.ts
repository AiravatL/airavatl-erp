import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import type { Role, Lead, LeadActivity, LeadStage, LeadActivityType } from "@/lib/types";

export const dynamic = "force-dynamic";

export const CONSIGNER_CRM_ALLOWED_ROLES: Role[] = ["sales_consigner", "admin", "super_admin"];

export const CONSIGNER_LEAD_STAGES: LeadStage[] = [
  "new_enquiry",
  "contacted",
  "quote_sent",
  "negotiation",
  "won",
  "lost",
];

export const CONSIGNER_LEAD_ACTIVITY_TYPES: LeadActivityType[] = [
  "call",
  "email",
  "meeting",
  "note",
  "stage_change",
];

export interface ConsignerCrmActor {
  id: string;
  role: Role;
  full_name: string;
  active: boolean;
}

export interface ConsignerLeadRow {
  id: string;
  company_name: string;
  contact_person: string;
  phone: string;
  email: string | null;
  source: string;
  estimated_value: number | string | null;
  route: string | null;
  vehicle_type: string | null;
  stage: LeadStage;
  priority: string;
  notes: string | null;
  sales_consigner_owner_id: string;
  next_follow_up: string | null;
  converted_customer_id: string | null;
  created_at: string;
  updated_at: string;
  owner_name?: string | null;
}

export interface ConsignerLeadActivityRow {
  id: string;
  lead_id: string;
  type: LeadActivityType;
  description: string;
  created_by_id: string;
  created_at: string;
  created_by_name?: string | null;
}

function toNumber(value: number | string | null | undefined): number {
  if (typeof value === "number") return value;
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function normalizeConsignerLeadRow(row: ConsignerLeadRow): Lead {
  return {
    id: row.id,
    companyName: row.company_name,
    contactPerson: row.contact_person,
    phone: row.phone,
    email: row.email ?? "",
    source: row.source as Lead["source"],
    estimatedValue: toNumber(row.estimated_value),
    route: row.route ?? "",
    vehicleType: row.vehicle_type ?? "",
    stage: row.stage,
    priority: row.priority as Lead["priority"],
    notes: row.notes ?? "",
    salesOwnerId: row.sales_consigner_owner_id,
    salesOwnerName: row.owner_name ?? "Unknown",
    nextFollowUp: row.next_follow_up,
    convertedCustomerId: row.converted_customer_id ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function normalizeConsignerLeadActivityRow(row: ConsignerLeadActivityRow): LeadActivity {
  return {
    id: row.id,
    leadId: row.lead_id,
    type: row.type,
    description: row.description,
    createdBy: row.created_by_name ?? "Unknown",
    createdAt: row.created_at,
  };
}

export function isLeadStage(value: string): value is LeadStage {
  return CONSIGNER_LEAD_STAGES.includes(value as LeadStage);
}

export function isLeadActivityType(value: string): value is LeadActivityType {
  return CONSIGNER_LEAD_ACTIVITY_TYPES.includes(value as LeadActivityType);
}

export async function requireConsignerCrmActor() {
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

  const actor = profile as ConsignerCrmActor;
  if (!CONSIGNER_CRM_ALLOWED_ROLES.includes(actor.role)) {
    return { error: NextResponse.json({ ok: false, message: "Forbidden" }, { status: 403 }) };
  }

  return { supabase, actor };
}

export function mapRpcError(message: string, code?: string) {
  if (message?.includes("forbidden")) return NextResponse.json({ ok: false, message: "Forbidden" }, { status: 403 });
  if (message?.includes("not_found")) return NextResponse.json({ ok: false, message: "Not found" }, { status: 404 });
  if (message?.includes("already_in_stage")) return NextResponse.json({ ok: false, message: "Lead is already in this stage" }, { status: 400 });
  if (message?.includes("invalid_transition")) return NextResponse.json({ ok: false, message: "Invalid stage transition" }, { status: 400 });
  if (message?.includes("lead_not_won")) return NextResponse.json({ ok: false, message: "Lead must be in Won stage to convert" }, { status: 400 });
  if (message?.includes("already_converted")) return NextResponse.json({ ok: false, message: "Lead has already been converted" }, { status: 400 });
  if (message?.includes("lead_already_converted")) return NextResponse.json({ ok: false, message: "Lead has already been converted" }, { status: 400 });
  if (message?.includes("use_conversion_flow")) return NextResponse.json({ ok: false, message: "Use the win-convert endpoint to move to Won" }, { status: 400 });
  if (code === "P0002") return NextResponse.json({ ok: false, message }, { status: 404 });
  if (code === "42501") return NextResponse.json({ ok: false, message }, { status: 403 });
  return NextResponse.json({ ok: false, message }, { status: 500 });
}
