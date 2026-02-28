import { NextResponse } from "next/server";
import { isMissingRpcError } from "@/lib/supabase/rpc";
import {
  isVehicleLeadStage,
  normalizeVehicleLeadRow,
  requireVehicleCrmActor,
  type VehicleLeadRow,
} from "@/app/api/vehicle-crm/_shared";

interface CreateVehicleLeadBody {
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

function toRequiredTrimmedString(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.trim();
}

function toNullableNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function getValidationMessage(code: string | null | undefined): string {
  if (code === "unknown_vehicle_type") return "Invalid vehicle type selected";
  if (code === "unknown_vehicle_length") return "Invalid vehicle length for selected type";
  if (code === "missing_vehicle_type") return "vehicleType is required";
  return "Invalid vehicle selection";
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

function isPhoneValid(value: string | null): boolean {
  if (!value) return false;
  const digits = value.replace(/\D/g, "");
  return digits.length >= PHONE_MIN_DIGITS && digits.length <= PHONE_MAX_DIGITS;
}

export async function GET(request: Request) {
  const actorResult = await requireVehicleCrmActor();
  if ("error" in actorResult) return actorResult.error;

  const { searchParams } = new URL(request.url);
  const search = searchParams.get("search")?.trim() ?? "";
  const stage = searchParams.get("stage")?.trim() ?? "";
  const vehicleType = searchParams.get("vehicleType")?.trim() ?? "";
  const limit = Number(searchParams.get("limit") ?? 200);
  const offset = Number(searchParams.get("offset") ?? 0);
  const safeLimit = Number.isFinite(limit) ? Math.max(1, Math.min(limit, 500)) : 200;
  const safeOffset = Number.isFinite(offset) ? Math.max(0, offset) : 0;

  if (stage && stage !== "all" && !isVehicleLeadStage(stage)) {
    return NextResponse.json({ ok: false, message: "Invalid stage filter" }, { status: 400 });
  }

  const { data: rpcData, error: rpcError } = await actorResult.supabase.rpc("vehicle_lead_list_v1", {
    p_actor_user_id: actorResult.actor.id,
    p_search: search || null,
    p_stage: stage && stage !== "all" ? stage : null,
    p_vehicle_type: vehicleType && vehicleType !== "all" ? vehicleType : null,
    p_limit: safeLimit,
    p_offset: safeOffset,
  } as never);

  if (rpcError) {
    if (isMissingRpcError(rpcError)) {
      return NextResponse.json(
        { ok: false, message: "Missing RPC: vehicle_lead_list_v1" },
        { status: 500 },
      );
    }
    return NextResponse.json(
      { ok: false, message: rpcError.message ?? "Unable to fetch vehicle leads" },
      { status: rpcError.code === "42501" ? 403 : 500 },
    );
  }

  const rows = Array.isArray(rpcData)
    ? (rpcData as VehicleLeadRow[])
    : rpcData
      ? ([rpcData] as VehicleLeadRow[])
      : [];

  return NextResponse.json({
    ok: true,
    data: rows.map((row) => normalizeVehicleLeadRow(row)),
  });
}

export async function POST(request: Request) {
  const actorResult = await requireVehicleCrmActor();
  if ("error" in actorResult) return actorResult.error;

  const body = (await request.json().catch(() => null)) as CreateVehicleLeadBody | null;

  const driverName = toRequiredTrimmedString(body?.driverName);
  const mobile = toRequiredTrimmedString(body?.mobile);
  const alternateContact = toOptionalTrimmedString(body?.alternateContact);
  const isOwnerCumDriver = Boolean(body?.isOwnerCumDriver);
  const ownerName = toOptionalTrimmedString(body?.ownerName);
  const ownerContact = toOptionalTrimmedString(body?.ownerContact);
  const currentAddress = toOptionalTrimmedString(body?.currentAddress);
  const permanentAddress = toOptionalTrimmedString(body?.permanentAddress);
  const preferredRoute = toOptionalTrimmedString(body?.preferredRoute);
  const vehicleType = toRequiredTrimmedString(body?.vehicleType);
  const vehicleLength = toOptionalTrimmedString(body?.vehicleLength);
  const vehicleCapacity = toOptionalTrimmedString(body?.vehicleCapacity);
  const vehicleRegistration = toOptionalTrimmedString(body?.vehicleRegistration)?.toUpperCase() ?? null;
  const marketRate = toNullableNumber(body?.marketRate);
  const remarks = toOptionalTrimmedString(body?.remarks);
  const nextFollowUp = toOptionalTrimmedString(body?.nextFollowUp);
  const requestedStage = typeof body?.stage === "string" ? body.stage.trim() : "";
  const stage = requestedStage && isVehicleLeadStage(requestedStage) ? requestedStage : "new_entry";

  if (!driverName || !mobile || !vehicleType) {
    return NextResponse.json(
      { ok: false, message: "driverName, mobile and vehicleType are required" },
      { status: 400 },
    );
  }
  if (driverName.length > NAME_MAX_LENGTH) {
    return NextResponse.json(
      { ok: false, message: `driverName must be at most ${NAME_MAX_LENGTH} characters` },
      { status: 400 },
    );
  }
  if (!isPhoneValid(mobile)) {
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

  if (!isOwnerCumDriver && !ownerName) {
    return NextResponse.json(
      { ok: false, message: "ownerName is required for vendor-owned entries" },
      { status: 400 },
    );
  }

  if (marketRate !== null && marketRate < 0) {
    return NextResponse.json({ ok: false, message: "marketRate must be non-negative" }, { status: 400 });
  }
  if (marketRate !== null && marketRate > MARKET_RATE_MAX) {
    return NextResponse.json({ ok: false, message: "marketRate is out of range" }, { status: 400 });
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
  if (vehicleType.length > VEHICLE_TYPE_MAX_LENGTH) {
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

  const { data: validationData, error: validationError } = await actorResult.supabase.rpc(
    "vehicle_master_validate_selection_v1",
    {
      p_vehicle_type: vehicleType,
      p_vehicle_length: vehicleLength,
      p_allow_inactive: false,
    } as never,
  );

  if (validationError && !isMissingRpcError(validationError)) {
    return NextResponse.json(
      { ok: false, message: validationError.message ?? "Unable to validate vehicle selection" },
      { status: validationError.code === "42501" ? 403 : 500 },
    );
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

  const { data: rpcData, error: rpcError } = await actorResult.supabase.rpc("vehicle_lead_create_v1", {
    p_actor_user_id: actorResult.actor.id,
    p_driver_name: driverName,
    p_mobile: mobile,
    p_alternate_contact: alternateContact,
    p_owner_name: ownerName,
    p_owner_contact: ownerContact,
    p_is_owner_cum_driver: isOwnerCumDriver,
    p_current_address: currentAddress,
    p_permanent_address: permanentAddress,
    p_preferred_route: preferredRoute,
    p_vehicle_type: vehicleType,
    p_vehicle_length: vehicleLength,
    p_vehicle_capacity: vehicleCapacity,
    p_vehicle_registration: vehicleRegistration,
    p_market_rate: marketRate,
    p_stage: stage,
    p_remarks: remarks,
    p_next_follow_up: nextFollowUp,
  } as never);

  if (rpcError) {
    if (isMissingRpcError(rpcError)) {
      return NextResponse.json(
        { ok: false, message: "Missing RPC: vehicle_lead_create_v1" },
        { status: 500 },
      );
    }
    return NextResponse.json(
      { ok: false, message: rpcError.message ?? "Unable to create vehicle lead" },
      { status: rpcError.code === "22023" ? 400 : rpcError.code === "42501" ? 403 : 500 },
    );
  }

  const row = Array.isArray(rpcData)
    ? ((rpcData[0] ?? null) as VehicleLeadRow | null)
    : ((rpcData ?? null) as VehicleLeadRow | null);

  if (!row) {
    return NextResponse.json({ ok: false, message: "Unable to create vehicle lead" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, data: normalizeVehicleLeadRow(row) }, { status: 201 });
}
