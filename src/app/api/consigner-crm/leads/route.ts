import { NextResponse } from "next/server";
import { isMissingRpcError } from "@/lib/supabase/rpc";
import {
  mapRpcError,
  normalizeConsignerLeadRow,
  requireConsignerCrmActor,
  type ConsignerLeadRow,
} from "@/app/api/consigner-crm/_shared";

function toOptionalTrimmedString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function toNullableNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

const COMPANY_NAME_MAX_LENGTH = 120;
const CONTACT_PERSON_MAX_LENGTH = 100;
const PHONE_MIN_DIGITS = 10;
const PHONE_MAX_DIGITS = 15;
const EMAIL_MAX_LENGTH = 254;
const ROUTE_MAX_LENGTH = 120;
const VEHICLE_TYPE_MAX_LENGTH = 120;
const NOTES_MAX_LENGTH = 500;
const ESTIMATED_VALUE_MAX = 1_000_000_000_000;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function isPhoneValid(value: string): boolean {
  const digits = value.replace(/\D/g, "");
  return digits.length >= PHONE_MIN_DIGITS && digits.length <= PHONE_MAX_DIGITS;
}

interface VehicleMasterValidationRow {
  is_valid: boolean;
  normalized_vehicle_type: string | null;
  normalized_vehicle_length: string | null;
  message: string | null;
}

function getValidationMessage(code: string | null | undefined): string {
  if (code === "unknown_vehicle_type") return "Invalid vehicle type selected";
  if (code === "missing_vehicle_type") return "vehicleType is required";
  return "Invalid vehicle type selected";
}

export async function GET(request: Request) {
  const actorResult = await requireConsignerCrmActor();
  if ("error" in actorResult) return actorResult.error;

  const { searchParams } = new URL(request.url);
  const search = searchParams.get("search")?.trim() || null;
  const stage = searchParams.get("stage")?.trim() || null;
  const priority = searchParams.get("priority")?.trim() || null;
  const limit = Number(searchParams.get("limit") ?? 200);
  const offset = Number(searchParams.get("offset") ?? 0);
  const safeLimit = Number.isFinite(limit) ? Math.max(1, Math.min(limit, 500)) : 200;
  const safeOffset = Number.isFinite(offset) ? Math.max(0, offset) : 0;

  const { data: rpcData, error: rpcError } = await actorResult.supabase.rpc("consigner_lead_list_v1", {
    p_actor: actorResult.actor.id,
    p_stage: stage === "all" ? null : stage,
    p_priority: priority === "all" ? null : priority,
    p_search: search,
    p_limit: safeLimit,
    p_offset: safeOffset,
  } as never);

  if (rpcError) {
    if (isMissingRpcError(rpcError)) {
      return NextResponse.json({ ok: false, message: "Missing RPC: consigner_lead_list_v1" }, { status: 500 });
    }
    return mapRpcError(rpcError.message ?? "Unable to fetch consigner leads", rpcError.code);
  }

  const rows = (Array.isArray(rpcData) ? rpcData : []) as ConsignerLeadRow[];
  return NextResponse.json({
    ok: true,
    data: rows.map(normalizeConsignerLeadRow),
  });
}

interface CreateConsignerLeadBody {
  companyName?: unknown;
  contactPerson?: unknown;
  phone?: unknown;
  email?: unknown;
  source?: unknown;
  estimatedValue?: unknown;
  route?: unknown;
  vehicleType?: unknown;
  priority?: unknown;
  notes?: unknown;
  nextFollowUp?: unknown;
}

export async function POST(request: Request) {
  const actorResult = await requireConsignerCrmActor();
  if ("error" in actorResult) return actorResult.error;

  const body = (await request.json().catch(() => null)) as CreateConsignerLeadBody | null;

  const companyName = toOptionalTrimmedString(body?.companyName);
  const contactPerson = toOptionalTrimmedString(body?.contactPerson);
  const phone = toOptionalTrimmedString(body?.phone);

  if (!companyName || !contactPerson || !phone) {
    return NextResponse.json(
      { ok: false, message: "companyName, contactPerson and phone are required" },
      { status: 400 },
    );
  }
  if (companyName.length > COMPANY_NAME_MAX_LENGTH) {
    return NextResponse.json(
      { ok: false, message: `companyName must be at most ${COMPANY_NAME_MAX_LENGTH} characters` },
      { status: 400 },
    );
  }
  if (contactPerson.length > CONTACT_PERSON_MAX_LENGTH) {
    return NextResponse.json(
      { ok: false, message: `contactPerson must be at most ${CONTACT_PERSON_MAX_LENGTH} characters` },
      { status: 400 },
    );
  }
  if (!isPhoneValid(phone)) {
    return NextResponse.json(
      { ok: false, message: `phone must have ${PHONE_MIN_DIGITS}-${PHONE_MAX_DIGITS} digits` },
      { status: 400 },
    );
  }

  const email = toOptionalTrimmedString(body?.email);
  if (email && (email.length > EMAIL_MAX_LENGTH || !EMAIL_REGEX.test(email))) {
    return NextResponse.json({ ok: false, message: "Invalid email" }, { status: 400 });
  }
  const route = toOptionalTrimmedString(body?.route);
  if (route && route.length > ROUTE_MAX_LENGTH) {
    return NextResponse.json(
      { ok: false, message: `route must be at most ${ROUTE_MAX_LENGTH} characters` },
      { status: 400 },
    );
  }

  const vehicleType = toOptionalTrimmedString(body?.vehicleType);
  if (vehicleType && vehicleType.length > VEHICLE_TYPE_MAX_LENGTH) {
    return NextResponse.json(
      { ok: false, message: `vehicleType must be at most ${VEHICLE_TYPE_MAX_LENGTH} characters` },
      { status: 400 },
    );
  }
  if (vehicleType) {
    const { data: validationData, error: validationError } = await actorResult.supabase.rpc(
      "vehicle_master_validate_selection_v1",
      {
        p_vehicle_type: vehicleType,
        p_vehicle_length: null,
        p_allow_inactive: false,
      } as never,
    );

    if (validationError && !isMissingRpcError(validationError)) {
      return mapRpcError(validationError.message ?? "Unable to validate vehicle type", validationError.code);
    }

    if (!validationError) {
      const validation = Array.isArray(validationData)
        ? ((validationData[0] ?? null) as VehicleMasterValidationRow | null)
        : ((validationData ?? null) as VehicleMasterValidationRow | null);
      if (validation && !validation.is_valid) {
        return NextResponse.json(
          { ok: false, message: getValidationMessage(validation.message) },
          { status: 400 },
        );
      }
    }
  }

  const estimatedValue = toNullableNumber(body?.estimatedValue);
  if (estimatedValue !== null && (estimatedValue < 0 || estimatedValue > ESTIMATED_VALUE_MAX)) {
    return NextResponse.json({ ok: false, message: "estimatedValue is out of range" }, { status: 400 });
  }
  const notes = toOptionalTrimmedString(body?.notes);
  if (notes && notes.length > NOTES_MAX_LENGTH) {
    return NextResponse.json(
      { ok: false, message: `notes must be at most ${NOTES_MAX_LENGTH} characters` },
      { status: 400 },
    );
  }

  const { data: rpcData, error: rpcError } = await actorResult.supabase.rpc("consigner_lead_create_v1", {
    p_actor: actorResult.actor.id,
    p_company_name: companyName,
    p_contact_person: contactPerson,
    p_phone: phone,
    p_email: email,
    p_source: toOptionalTrimmedString(body?.source) ?? "cold_call",
    p_estimated_value: estimatedValue,
    p_route: route,
    p_vehicle_type: vehicleType,
    p_priority: toOptionalTrimmedString(body?.priority) ?? "medium",
    p_notes: notes,
    p_next_follow_up: toOptionalTrimmedString(body?.nextFollowUp),
  } as never);

  if (rpcError) {
    if (isMissingRpcError(rpcError)) {
      return NextResponse.json({ ok: false, message: "Missing RPC: consigner_lead_create_v1" }, { status: 500 });
    }
    return mapRpcError(rpcError.message ?? "Unable to create consigner lead", rpcError.code);
  }

  const row = Array.isArray(rpcData)
    ? ((rpcData[0] ?? null) as ConsignerLeadRow | null)
    : ((rpcData ?? null) as ConsignerLeadRow | null);

  if (!row) {
    return NextResponse.json({ ok: false, message: "Unable to create consigner lead" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, data: normalizeConsignerLeadRow(row) }, { status: 201 });
}
