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
const COMPANY_ADDRESS_MAX_LENGTH = 250;
const CONTACT_PERSON_MAX_LENGTH = 100;
const CONTACT_PERSON_DESIGNATION_MAX_LENGTH = 100;
const NATURE_OF_BUSINESS_MAX_LENGTH = 120;
const PHONE_MIN_DIGITS = 10;
const PHONE_MAX_DIGITS = 15;
const EMAIL_MAX_LENGTH = 254;
const ROUTE_MAX_LENGTH = 120;
const VEHICLE_TYPE_MAX_LENGTH = 120;
const MAX_VEHICLE_REQUIREMENTS = 8;
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

  const { data: rpcData, error: rpcError } = await actorResult.supabase.rpc("consigner_lead_get_v2", {
    p_actor: actorResult.actor.id,
    p_lead_id: leadId,
  } as never);

  if (rpcError) {
    if (isMissingRpcError(rpcError)) {
      return NextResponse.json({ ok: false, message: "Missing RPC: consigner_lead_get_v2" }, { status: 500 });
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
  companyAddress?: unknown;
  contactPerson?: unknown;
  contactPersonDesignation?: unknown;
  natureOfBusiness?: unknown;
  phone?: unknown;
  email?: unknown;
  estimatedValue?: unknown;
  route?: unknown;
  vehicleRequirements?: unknown;
  vehicleType?: unknown;
  priority?: unknown;
  notes?: unknown;
  nextFollowUp?: unknown;
}

function toVehicleRequirements(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;
  const items = value
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter((item) => item.length > 0);
  return Array.from(new Set(items));
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

  const companyAddress = toOptionalTrimmedString(body.companyAddress);
  const companyName = toOptionalTrimmedString(body.companyName);
  const contactPerson = toOptionalTrimmedString(body.contactPerson);
  const contactPersonDesignation = toOptionalTrimmedString(body.contactPersonDesignation);
  const natureOfBusiness = toOptionalTrimmedString(body.natureOfBusiness);
  const phone = toOptionalTrimmedString(body.phone);
  const email = toOptionalTrimmedString(body.email);
  const route = toOptionalTrimmedString(body.route);
  const estimatedValue = toNullableNumber(body.estimatedValue);
  const notes = toOptionalTrimmedString(body.notes);
  const vehicleRequirementsProvided = Object.prototype.hasOwnProperty.call(body, "vehicleRequirements");
  const vehicleRequirements = vehicleRequirementsProvided ? toVehicleRequirements(body.vehicleRequirements) : null;
  const vehicleType = toOptionalTrimmedString(body.vehicleType);

  if (companyName && companyName.length > COMPANY_NAME_MAX_LENGTH) {
    return NextResponse.json(
      { ok: false, message: `companyName must be at most ${COMPANY_NAME_MAX_LENGTH} characters` },
      { status: 400 },
    );
  }
  if (companyAddress && companyAddress.length > COMPANY_ADDRESS_MAX_LENGTH) {
    return NextResponse.json(
      { ok: false, message: `companyAddress must be at most ${COMPANY_ADDRESS_MAX_LENGTH} characters` },
      { status: 400 },
    );
  }
  if (contactPerson && contactPerson.length > CONTACT_PERSON_MAX_LENGTH) {
    return NextResponse.json(
      { ok: false, message: `contactPerson must be at most ${CONTACT_PERSON_MAX_LENGTH} characters` },
      { status: 400 },
    );
  }
  if (contactPersonDesignation && contactPersonDesignation.length > CONTACT_PERSON_DESIGNATION_MAX_LENGTH) {
    return NextResponse.json(
      {
        ok: false,
        message: `contactPersonDesignation must be at most ${CONTACT_PERSON_DESIGNATION_MAX_LENGTH} characters`,
      },
      { status: 400 },
    );
  }
  if (natureOfBusiness && natureOfBusiness.length > NATURE_OF_BUSINESS_MAX_LENGTH) {
    return NextResponse.json(
      { ok: false, message: `natureOfBusiness must be at most ${NATURE_OF_BUSINESS_MAX_LENGTH} characters` },
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
  if (vehicleRequirementsProvided && vehicleRequirements === null) {
    return NextResponse.json({ ok: false, message: "vehicleRequirements must be an array" }, { status: 400 });
  }
  if (vehicleRequirements && vehicleRequirements.length > MAX_VEHICLE_REQUIREMENTS) {
    return NextResponse.json(
      { ok: false, message: `vehicleRequirements can have at most ${MAX_VEHICLE_REQUIREMENTS} items` },
      { status: 400 },
    );
  }
  if (vehicleRequirements) {
    for (const requirement of vehicleRequirements) {
      if (requirement.length > VEHICLE_TYPE_MAX_LENGTH) {
        return NextResponse.json(
          { ok: false, message: `vehicle requirement must be at most ${VEHICLE_TYPE_MAX_LENGTH} characters` },
          { status: 400 },
        );
      }
    }
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

  const valuesToValidate = [
    ...(vehicleType ? [vehicleType] : []),
    ...(vehicleRequirements ?? []),
  ];
  if (valuesToValidate.length > 0) {
    const uniqueValues = Array.from(new Set(valuesToValidate));
    const validationResults = await Promise.all(
      uniqueValues.map(async (value) => {
        const { data: validationData, error: validationError } = await actorResult.supabase.rpc(
          "vehicle_master_validate_selection_v1",
          {
            p_vehicle_type: value,
            p_vehicle_length: null,
            p_allow_inactive: true,
          } as never,
        );
        return { value, validationData, validationError };
      }),
    );

    for (const validationResult of validationResults) {
      if (validationResult.validationError && !isMissingRpcError(validationResult.validationError)) {
        return mapRpcError(
          validationResult.validationError.message ?? "Unable to validate vehicle requirements",
          validationResult.validationError.code,
        );
      }

      if (!validationResult.validationError) {
        const validation = Array.isArray(validationResult.validationData)
          ? ((validationResult.validationData[0] ?? null) as VehicleMasterValidationRow | null)
          : ((validationResult.validationData ?? null) as VehicleMasterValidationRow | null);
        if (validation && !validation.is_valid) {
          return NextResponse.json(
            { ok: false, message: `${validationResult.value}: Invalid vehicle type selected` },
            { status: 400 },
          );
        }
      }
    }
  }

  const updatePayload = {
    p_actor: actorResult.actor.id,
    p_lead_id: leadId,
    p_company_name: companyName,
    p_company_address: companyAddress,
    p_contact_person: contactPerson,
    p_contact_person_designation: contactPersonDesignation,
    p_nature_of_business: natureOfBusiness,
    p_phone: phone,
    p_email: email,
    p_estimated_value: estimatedValue,
    p_route: route,
    p_vehicle_type: vehicleType,
    p_vehicle_requirements: vehicleRequirements,
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
    "consigner_lead_update_v2",
    updatePayload as never,
  );

  if (rpcError) {
    if (isMissingRpcError(rpcError)) {
      return NextResponse.json({ ok: false, message: "Missing RPC: consigner_lead_update_v2" }, { status: 500 });
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
