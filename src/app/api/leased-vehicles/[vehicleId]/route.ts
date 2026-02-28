import { NextResponse } from "next/server";
import { isMissingRpcError } from "@/lib/supabase/rpc";
import {
  mapRpcError,
  normalizeLeasedVehicleRow,
  requireLeasedVehicleActor,
  type LeasedVehicleRow,
} from "@/app/api/leased-vehicles/_shared";

interface RouteParams {
  params: Promise<{ vehicleId: string }>;
}

function toOptionalTrimmedString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export async function GET(_: Request, context: RouteParams) {
  const actorResult = await requireLeasedVehicleActor("read");
  if ("error" in actorResult) return actorResult.error;

  const { vehicleId } = await context.params;
  if (!vehicleId) {
    return NextResponse.json({ ok: false, message: "vehicleId is required" }, { status: 400 });
  }

  const rpcParams = {
    p_actor: actorResult.actor.id,
    p_vehicle_id: vehicleId,
  } as never;

  const v3Result = await actorResult.supabase.rpc("leased_vehicle_get_v3", rpcParams);
  let rpcData = v3Result.data;
  let rpcError = v3Result.error;

  if (rpcError && isMissingRpcError(rpcError)) {
    const v2Result = await actorResult.supabase.rpc("leased_vehicle_get_v2", rpcParams);
    rpcData = v2Result.data;
    rpcError = v2Result.error;
  }

  if (rpcError) {
    if (isMissingRpcError(rpcError)) {
      return NextResponse.json({ ok: false, message: "Missing RPC: leased_vehicle_get_v2/leased_vehicle_get_v3" }, { status: 500 });
    }
    return mapRpcError(rpcError.message ?? "Unable to fetch leased vehicle", rpcError.code);
  }

  const row = Array.isArray(rpcData)
    ? ((rpcData[0] ?? null) as LeasedVehicleRow | null)
    : ((rpcData ?? null) as LeasedVehicleRow | null);

  if (!row) {
    return NextResponse.json({ ok: false, message: "Leased vehicle not found" }, { status: 404 });
  }

  return NextResponse.json({ ok: true, data: normalizeLeasedVehicleRow(row) });
}

interface UpdateBody {
  number?: unknown;
  type?: unknown;
  vehicleLength?: unknown;
  vendorId?: unknown;
  leasedDriverName?: unknown;
  leasedDriverPhone?: unknown;
}

interface VehicleMasterValidationRow {
  is_valid: boolean;
  normalized_vehicle_type: string | null;
  normalized_vehicle_length: string | null;
  message: string | null;
}

const VEHICLE_NUMBER_MAX_LENGTH = 20;
const VEHICLE_TYPE_MAX_LENGTH = 120;
const VEHICLE_LENGTH_MAX_LENGTH = 40;
const LEASED_DRIVER_NAME_MAX_LENGTH = 100;
const PHONE_MIN_DIGITS = 10;
const PHONE_MAX_DIGITS = 15;

function isPhoneValid(value: string | null): boolean {
  if (!value) return false;
  const digits = value.replace(/\D/g, "");
  return digits.length >= PHONE_MIN_DIGITS && digits.length <= PHONE_MAX_DIGITS;
}

export async function PATCH(request: Request, context: RouteParams) {
  const actorResult = await requireLeasedVehicleActor("write");
  if ("error" in actorResult) return actorResult.error;

  const { vehicleId } = await context.params;
  if (!vehicleId) {
    return NextResponse.json({ ok: false, message: "vehicleId is required" }, { status: 400 });
  }

  const body = (await request.json().catch(() => null)) as UpdateBody | null;
  if (!body) {
    return NextResponse.json({ ok: false, message: "Invalid request body" }, { status: 400 });
  }

  const vehicleType = toOptionalTrimmedString(body.type);
  const vehicleNumber = toOptionalTrimmedString(body.number);
  const vehicleLength = toOptionalTrimmedString(body.vehicleLength);
  const leasedDriverName = toOptionalTrimmedString(body.leasedDriverName);
  const leasedDriverPhone = toOptionalTrimmedString(body.leasedDriverPhone);

  if (vehicleNumber && vehicleNumber.length > VEHICLE_NUMBER_MAX_LENGTH) {
    return NextResponse.json(
      { ok: false, message: `number must be at most ${VEHICLE_NUMBER_MAX_LENGTH} characters` },
      { status: 400 },
    );
  }
  if (vehicleType && vehicleType.length > VEHICLE_TYPE_MAX_LENGTH) {
    return NextResponse.json(
      { ok: false, message: `type must be at most ${VEHICLE_TYPE_MAX_LENGTH} characters` },
      { status: 400 },
    );
  }
  if (vehicleLength && vehicleLength.length > VEHICLE_LENGTH_MAX_LENGTH) {
    return NextResponse.json(
      { ok: false, message: `vehicleLength must be at most ${VEHICLE_LENGTH_MAX_LENGTH} characters` },
      { status: 400 },
    );
  }
  if (leasedDriverName && leasedDriverName.length > LEASED_DRIVER_NAME_MAX_LENGTH) {
    return NextResponse.json(
      { ok: false, message: `leasedDriverName must be at most ${LEASED_DRIVER_NAME_MAX_LENGTH} characters` },
      { status: 400 },
    );
  }
  if (leasedDriverPhone && !isPhoneValid(leasedDriverPhone)) {
    return NextResponse.json(
      { ok: false, message: `leasedDriverPhone must have ${PHONE_MIN_DIGITS}-${PHONE_MAX_DIGITS} digits` },
      { status: 400 },
    );
  }
  if ((leasedDriverName && !leasedDriverPhone) || (!leasedDriverName && leasedDriverPhone)) {
    return NextResponse.json(
      { ok: false, message: "Provide both leased driver name and phone together" },
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

  const updateParamsV3 = {
    p_actor: actorResult.actor.id,
    p_vehicle_id: vehicleId,
    p_number: vehicleNumber,
    p_type: vehicleType,
    p_vehicle_length: vehicleLength,
    p_vendor_id: toOptionalTrimmedString(body.vendorId),
    p_leased_driver_name: leasedDriverName,
    p_leased_driver_phone: leasedDriverPhone,
    p_status: null,
  } as never;
  const updateParamsV2 = {
    p_actor: actorResult.actor.id,
    p_vehicle_id: vehicleId,
    p_number: vehicleNumber,
    p_type: vehicleType,
    p_vehicle_length: vehicleLength,
    p_vendor_id: toOptionalTrimmedString(body.vendorId),
    p_status: null,
  } as never;

  const v3UpdateResult = await actorResult.supabase.rpc("leased_vehicle_update_v3", updateParamsV3);
  let rpcData = v3UpdateResult.data;
  let rpcError = v3UpdateResult.error;

  if (rpcError && isMissingRpcError(rpcError)) {
    const v2UpdateResult = await actorResult.supabase.rpc("leased_vehicle_update_v2", updateParamsV2);
    rpcData = v2UpdateResult.data;
    rpcError = v2UpdateResult.error;
  }

  if (rpcError) {
    if (isMissingRpcError(rpcError)) {
      return NextResponse.json({ ok: false, message: "Missing RPC: leased_vehicle_update_v2/leased_vehicle_update_v3" }, { status: 500 });
    }
    return mapRpcError(rpcError.message ?? "Unable to update leased vehicle", rpcError.code);
  }

  const row = Array.isArray(rpcData)
    ? ((rpcData[0] ?? null) as LeasedVehicleRow | null)
    : ((rpcData ?? null) as LeasedVehicleRow | null);

  if (!row) {
    return NextResponse.json({ ok: false, message: "Unable to update leased vehicle" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, data: normalizeLeasedVehicleRow(row) });
}
