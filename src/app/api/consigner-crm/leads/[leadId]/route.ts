import { NextResponse } from "next/server";
import { isMissingRpcError } from "@/lib/supabase/rpc";
import {
  mapRpcError,
  normalizeConsignerLeadRow,
  requireConsignerCrmActor,
  type ConsignerLeadRow,
} from "@/app/api/consigner-crm/_shared";

interface RouteParams {
  params: Promise<{ leadId: string }>;
}

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

export async function GET(_: Request, context: RouteParams) {
  const actorResult = await requireConsignerCrmActor();
  if ("error" in actorResult) return actorResult.error;

  const { leadId } = await context.params;
  if (!leadId) {
    return NextResponse.json({ ok: false, message: "leadId is required" }, { status: 400 });
  }

  const { data: rpcData, error: rpcError } = await actorResult.supabase.rpc("consigner_lead_get_v1", {
    p_actor: actorResult.actor.id,
    p_lead_id: leadId,
  } as never);

  if (rpcError) {
    if (isMissingRpcError(rpcError)) {
      return NextResponse.json({ ok: false, message: "Missing RPC: consigner_lead_get_v1" }, { status: 500 });
    }
    return mapRpcError(rpcError.message ?? "Unable to fetch consigner lead", rpcError.code);
  }

  const row = Array.isArray(rpcData)
    ? ((rpcData[0] ?? null) as ConsignerLeadRow | null)
    : ((rpcData ?? null) as ConsignerLeadRow | null);

  if (!row) {
    return NextResponse.json({ ok: false, message: "Consigner lead not found" }, { status: 404 });
  }

  return NextResponse.json({ ok: true, data: normalizeConsignerLeadRow(row) });
}

interface UpdateBody {
  companyName?: unknown;
  contactPerson?: unknown;
  phone?: unknown;
  email?: unknown;
  estimatedValue?: unknown;
  route?: unknown;
  vehicleType?: unknown;
  priority?: unknown;
  notes?: unknown;
  nextFollowUp?: unknown;
}

export async function PATCH(request: Request, context: RouteParams) {
  const actorResult = await requireConsignerCrmActor();
  if ("error" in actorResult) return actorResult.error;

  const { leadId } = await context.params;
  if (!leadId) {
    return NextResponse.json({ ok: false, message: "leadId is required" }, { status: 400 });
  }

  const body = (await request.json().catch(() => null)) as UpdateBody | null;
  if (!body) {
    return NextResponse.json({ ok: false, message: "Invalid request body" }, { status: 400 });
  }

  const vehicleType = toOptionalTrimmedString(body.vehicleType);
  const companyName = toOptionalTrimmedString(body.companyName);
  const contactPerson = toOptionalTrimmedString(body.contactPerson);
  const phone = toOptionalTrimmedString(body.phone);
  const email = toOptionalTrimmedString(body.email);
  const route = toOptionalTrimmedString(body.route);
  const estimatedValue = toNullableNumber(body.estimatedValue);
  const notes = toOptionalTrimmedString(body.notes);

  if (companyName && companyName.length > COMPANY_NAME_MAX_LENGTH) {
    return NextResponse.json(
      { ok: false, message: `companyName must be at most ${COMPANY_NAME_MAX_LENGTH} characters` },
      { status: 400 },
    );
  }
  if (contactPerson && contactPerson.length > CONTACT_PERSON_MAX_LENGTH) {
    return NextResponse.json(
      { ok: false, message: `contactPerson must be at most ${CONTACT_PERSON_MAX_LENGTH} characters` },
      { status: 400 },
    );
  }
  if (phone && !isPhoneValid(phone)) {
    return NextResponse.json(
      { ok: false, message: `phone must have ${PHONE_MIN_DIGITS}-${PHONE_MAX_DIGITS} digits` },
      { status: 400 },
    );
  }
  if (email && (email.length > EMAIL_MAX_LENGTH || !EMAIL_REGEX.test(email))) {
    return NextResponse.json({ ok: false, message: "Invalid email" }, { status: 400 });
  }
  if (route && route.length > ROUTE_MAX_LENGTH) {
    return NextResponse.json(
      { ok: false, message: `route must be at most ${ROUTE_MAX_LENGTH} characters` },
      { status: 400 },
    );
  }
  if (vehicleType && vehicleType.length > VEHICLE_TYPE_MAX_LENGTH) {
    return NextResponse.json(
      { ok: false, message: `vehicleType must be at most ${VEHICLE_TYPE_MAX_LENGTH} characters` },
      { status: 400 },
    );
  }
  if (estimatedValue !== null && (estimatedValue < 0 || estimatedValue > ESTIMATED_VALUE_MAX)) {
    return NextResponse.json({ ok: false, message: "estimatedValue is out of range" }, { status: 400 });
  }
  if (notes && notes.length > NOTES_MAX_LENGTH) {
    return NextResponse.json(
      { ok: false, message: `notes must be at most ${NOTES_MAX_LENGTH} characters` },
      { status: 400 },
    );
  }

  if (vehicleType) {
    const { data: validationData, error: validationError } = await actorResult.supabase.rpc(
      "vehicle_master_validate_selection_v1",
      {
        p_vehicle_type: vehicleType,
        p_vehicle_length: null,
        p_allow_inactive: true,
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
        return NextResponse.json({ ok: false, message: "Invalid vehicle type selected" }, { status: 400 });
      }
    }
  }

  const updatePayload = {
    p_actor: actorResult.actor.id,
    p_lead_id: leadId,
    p_company_name: companyName,
    p_contact_person: contactPerson,
    p_phone: phone,
    p_email: email,
    p_estimated_value: estimatedValue,
    p_route: route,
    p_vehicle_type: vehicleType,
    p_priority: toOptionalTrimmedString(body.priority),
    p_notes: notes,
    p_next_follow_up: toOptionalTrimmedString(body.nextFollowUp),
  };

  const hasAnyChange = Object.entries(updatePayload).some(([key, value]) => {
    if (key === "p_actor" || key === "p_lead_id") return false;
    return value !== null && value !== undefined;
  });

  if (!hasAnyChange) {
    return NextResponse.json({ ok: false, message: "No changes provided" }, { status: 400 });
  }

  const { data: rpcData, error: rpcError } = await actorResult.supabase.rpc(
    "consigner_lead_update_v1",
    updatePayload as never,
  );

  if (rpcError) {
    if (isMissingRpcError(rpcError)) {
      return NextResponse.json({ ok: false, message: "Missing RPC: consigner_lead_update_v1" }, { status: 500 });
    }
    return mapRpcError(rpcError.message ?? "Unable to update consigner lead", rpcError.code);
  }

  const row = Array.isArray(rpcData)
    ? ((rpcData[0] ?? null) as ConsignerLeadRow | null)
    : ((rpcData ?? null) as ConsignerLeadRow | null);

  if (!row) {
    return NextResponse.json({ ok: false, message: "Unable to update consigner lead" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, data: normalizeConsignerLeadRow(row) });
}
