import { NextResponse } from "next/server";
import { isMissingRpcError } from "@/lib/supabase/rpc";
import {
  isVehicleLeadStage,
  normalizeVehicleLeadRow,
  requireVehicleCrmActor,
  type VehicleLeadRow,
} from "@/app/api/vehicle-crm/_shared";

interface RouteParams {
  params: Promise<{ leadId: string }>;
}

interface UpdateVehicleLeadBody {
  driverName?: unknown;
  mobile?: unknown;
  alternateContact?: unknown;
  ownerName?: unknown;
  ownerContact?: unknown;
  isOwnerCumDriver?: unknown;
  currentAddress?: unknown;
  permanentAddress?: unknown;
  preferredRoute?: unknown;
  vehicleType?: unknown;
  vehicleLength?: unknown;
  vehicleCapacity?: unknown;
  vehicleRegistration?: unknown;
  marketRate?: unknown;
  stage?: unknown;
  remarks?: unknown;
  nextFollowUp?: unknown;
}

interface VehicleMasterValidationRow {
  is_valid: boolean;
  normalized_vehicle_type: string | null;
  normalized_vehicle_length: string | null;
  message: string | null;
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

function mapRpcError(message: string, code?: string) {
  if (code === "P0002") return NextResponse.json({ ok: false, message }, { status: 404 });
  if (code === "22023") return NextResponse.json({ ok: false, message }, { status: 400 });
  if (code === "42501") return NextResponse.json({ ok: false, message }, { status: 403 });
  return NextResponse.json({ ok: false, message }, { status: 500 });
}

const NAME_MAX_LENGTH = 100;
const PHONE_MIN_DIGITS = 10;
const PHONE_MAX_DIGITS = 15;
const ADDRESS_MAX_LENGTH = 250;
const ROUTE_MAX_LENGTH = 120;
const VEHICLE_TYPE_MAX_LENGTH = 120;
const VEHICLE_LENGTH_MAX_LENGTH = 40;
const VEHICLE_CAPACITY_MAX_LENGTH = 40;
const VEHICLE_REGISTRATION_MAX_LENGTH = 20;
const REMARKS_MAX_LENGTH = 500;
const MARKET_RATE_MAX = 1_000_000_000_000;

function isPhoneValid(value: string): boolean {
  const digits = value.replace(/\D/g, "");
  return digits.length >= PHONE_MIN_DIGITS && digits.length <= PHONE_MAX_DIGITS;
}

export async function GET(_: Request, context: RouteParams) {
  const actorResult = await requireVehicleCrmActor();
  if ("error" in actorResult) return actorResult.error;

  const { leadId } = await context.params;
  if (!leadId) {
    return NextResponse.json({ ok: false, message: "leadId is required" }, { status: 400 });
  }

  const { data: rpcData, error: rpcError } = await actorResult.supabase.rpc("vehicle_lead_get_v1", {
    p_actor_user_id: actorResult.actor.id,
    p_lead_id: leadId,
  } as never);

  if (rpcError) {
    if (isMissingRpcError(rpcError)) {
      return NextResponse.json({ ok: false, message: "Missing RPC: vehicle_lead_get_v1" }, { status: 500 });
    }
    return mapRpcError(rpcError.message ?? "Unable to fetch vehicle lead", rpcError.code);
  }

  const row = Array.isArray(rpcData)
    ? ((rpcData[0] ?? null) as VehicleLeadRow | null)
    : ((rpcData ?? null) as VehicleLeadRow | null);

  if (!row) {
    return NextResponse.json({ ok: false, message: "Vehicle lead not found" }, { status: 404 });
  }

  return NextResponse.json({
    ok: true,
    data: normalizeVehicleLeadRow(row),
  });
}

export async function PATCH(request: Request, context: RouteParams) {
  const actorResult = await requireVehicleCrmActor();
  if ("error" in actorResult) return actorResult.error;

  const { leadId } = await context.params;
  if (!leadId) {
    return NextResponse.json({ ok: false, message: "leadId is required" }, { status: 400 });
  }

  const body = (await request.json().catch(() => null)) as UpdateVehicleLeadBody | null;
  if (!body) {
    return NextResponse.json({ ok: false, message: "Invalid request body" }, { status: 400 });
  }

  const vehicleType = toOptionalTrimmedString(body.vehicleType);
  const vehicleLength = toOptionalTrimmedString(body.vehicleLength);
  const driverName = toOptionalTrimmedString(body.driverName);
  const mobile = toOptionalTrimmedString(body.mobile);
  const alternateContact = toOptionalTrimmedString(body.alternateContact);
  const ownerName = toOptionalTrimmedString(body.ownerName);
  const ownerContact = toOptionalTrimmedString(body.ownerContact);
  const currentAddress = toOptionalTrimmedString(body.currentAddress);
  const permanentAddress = toOptionalTrimmedString(body.permanentAddress);
  const preferredRoute = toOptionalTrimmedString(body.preferredRoute);
  const vehicleCapacity = toOptionalTrimmedString(body.vehicleCapacity);
  const vehicleRegistration = toOptionalTrimmedString(body.vehicleRegistration);
  const remarks = toOptionalTrimmedString(body.remarks);
  const marketRate = toNullableNumber(body.marketRate);

  if (driverName && driverName.length > NAME_MAX_LENGTH) {
    return NextResponse.json(
      { ok: false, message: `driverName must be at most ${NAME_MAX_LENGTH} characters` },
      { status: 400 },
    );
  }
  if (mobile && !isPhoneValid(mobile)) {
    return NextResponse.json(
      { ok: false, message: `mobile must have ${PHONE_MIN_DIGITS}-${PHONE_MAX_DIGITS} digits` },
      { status: 400 },
    );
  }
  if (alternateContact && !isPhoneValid(alternateContact)) {
    return NextResponse.json(
      { ok: false, message: `alternateContact must have ${PHONE_MIN_DIGITS}-${PHONE_MAX_DIGITS} digits` },
      { status: 400 },
    );
  }
  if (ownerName && ownerName.length > NAME_MAX_LENGTH) {
    return NextResponse.json(
      { ok: false, message: `ownerName must be at most ${NAME_MAX_LENGTH} characters` },
      { status: 400 },
    );
  }
  if (ownerContact && !isPhoneValid(ownerContact)) {
    return NextResponse.json(
      { ok: false, message: `ownerContact must have ${PHONE_MIN_DIGITS}-${PHONE_MAX_DIGITS} digits` },
      { status: 400 },
    );
  }
  if (currentAddress && currentAddress.length > ADDRESS_MAX_LENGTH) {
    return NextResponse.json(
      { ok: false, message: `currentAddress must be at most ${ADDRESS_MAX_LENGTH} characters` },
      { status: 400 },
    );
  }
  if (permanentAddress && permanentAddress.length > ADDRESS_MAX_LENGTH) {
    return NextResponse.json(
      { ok: false, message: `permanentAddress must be at most ${ADDRESS_MAX_LENGTH} characters` },
      { status: 400 },
    );
  }
  if (preferredRoute && preferredRoute.length > ROUTE_MAX_LENGTH) {
    return NextResponse.json(
      { ok: false, message: `preferredRoute must be at most ${ROUTE_MAX_LENGTH} characters` },
      { status: 400 },
    );
  }
  if (vehicleType && vehicleType.length > VEHICLE_TYPE_MAX_LENGTH) {
    return NextResponse.json(
      { ok: false, message: `vehicleType must be at most ${VEHICLE_TYPE_MAX_LENGTH} characters` },
      { status: 400 },
    );
  }
  if (vehicleLength && vehicleLength.length > VEHICLE_LENGTH_MAX_LENGTH) {
    return NextResponse.json(
      { ok: false, message: `vehicleLength must be at most ${VEHICLE_LENGTH_MAX_LENGTH} characters` },
      { status: 400 },
    );
  }
  if (vehicleCapacity && vehicleCapacity.length > VEHICLE_CAPACITY_MAX_LENGTH) {
    return NextResponse.json(
      { ok: false, message: `vehicleCapacity must be at most ${VEHICLE_CAPACITY_MAX_LENGTH} characters` },
      { status: 400 },
    );
  }
  if (vehicleRegistration && vehicleRegistration.length > VEHICLE_REGISTRATION_MAX_LENGTH) {
    return NextResponse.json(
      { ok: false, message: `vehicleRegistration must be at most ${VEHICLE_REGISTRATION_MAX_LENGTH} characters` },
      { status: 400 },
    );
  }
  if (remarks && remarks.length > REMARKS_MAX_LENGTH) {
    return NextResponse.json(
      { ok: false, message: `remarks must be at most ${REMARKS_MAX_LENGTH} characters` },
      { status: 400 },
    );
  }
  if (marketRate !== null && (marketRate < 0 || marketRate > MARKET_RATE_MAX)) {
    return NextResponse.json({ ok: false, message: "marketRate is out of range" }, { status: 400 });
  }

  if (vehicleType) {
    const { data: validationData, error: validationError } = await actorResult.supabase.rpc(
      "vehicle_master_validate_selection_v1",
      {
        p_vehicle_type: vehicleType,
        p_vehicle_length: vehicleLength,
        p_allow_inactive: true,
      } as never,
    );

    if (validationError && !isMissingRpcError(validationError)) {
      return mapRpcError(validationError.message ?? "Unable to validate vehicle selection", validationError.code);
    }

    if (!validationError) {
      const validation = Array.isArray(validationData)
        ? ((validationData[0] ?? null) as VehicleMasterValidationRow | null)
        : ((validationData ?? null) as VehicleMasterValidationRow | null);
      if (validation && !validation.is_valid) {
        const message =
          validation.message === "unknown_vehicle_length"
            ? "Invalid vehicle length for selected type"
            : "Invalid vehicle type selected";
        return NextResponse.json({ ok: false, message }, { status: 400 });
      }
    }
  }

  const updatePayload = {
    p_actor_user_id: actorResult.actor.id,
    p_lead_id: leadId,
    p_driver_name: driverName,
    p_mobile: mobile,
    p_alternate_contact: alternateContact,
    p_owner_name: ownerName,
    p_owner_contact: ownerContact,
    p_is_owner_cum_driver:
      typeof body.isOwnerCumDriver === "boolean" ? body.isOwnerCumDriver : null,
    p_current_address: currentAddress,
    p_permanent_address: permanentAddress,
    p_preferred_route: preferredRoute,
    p_vehicle_type: vehicleType,
    p_vehicle_length: vehicleLength,
    p_vehicle_capacity: vehicleCapacity,
    p_vehicle_registration: vehicleRegistration,
    p_market_rate: marketRate,
    p_stage:
      typeof body.stage === "string" && body.stage.trim() && isVehicleLeadStage(body.stage.trim())
        ? body.stage.trim()
        : null,
    p_remarks: remarks,
    p_next_follow_up: toOptionalTrimmedString(body.nextFollowUp),
  };

  const hasAnyChange = Object.entries(updatePayload).some(([key, value]) => {
    if (key === "p_actor_user_id" || key === "p_lead_id") return false;
    return value !== null && value !== undefined;
  });

  if (!hasAnyChange) {
    return NextResponse.json({ ok: false, message: "No changes provided" }, { status: 400 });
  }

  const { data: rpcData, error: rpcError } = await actorResult.supabase.rpc("vehicle_lead_update_v1", updatePayload as never);

  if (rpcError) {
    if (isMissingRpcError(rpcError)) {
      return NextResponse.json({ ok: false, message: "Missing RPC: vehicle_lead_update_v1" }, { status: 500 });
    }
    return mapRpcError(rpcError.message ?? "Unable to update vehicle lead", rpcError.code);
  }

  const row = Array.isArray(rpcData)
    ? ((rpcData[0] ?? null) as VehicleLeadRow | null)
    : ((rpcData ?? null) as VehicleLeadRow | null);

  if (!row) {
    return NextResponse.json({ ok: false, message: "Unable to update vehicle lead" }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    data: normalizeVehicleLeadRow(row),
  });
}
