import { NextResponse } from "next/server";
import { isMissingRpcError } from "@/lib/supabase/rpc";
import {
  mapRpcError,
  normalizeLeasedVehicleRow,
  requireLeasedVehicleActor,
  type LeasedVehicleRow,
} from "@/app/api/leased-vehicles/_shared";

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

const VEHICLE_NUMBER_MAX_LENGTH = 20;
const VEHICLE_TYPE_MAX_LENGTH = 120;
const VEHICLE_LENGTH_MAX_LENGTH = 40;
const LEASED_DRIVER_NAME_MAX_LENGTH = 100;
const PHONE_MIN_DIGITS = 10;
const PHONE_MAX_DIGITS = 15;
const MAX_CURRENCY_VALUE = 1_000_000_000_000;
const MAX_PERCENT = 100;
const MAX_MILEAGE = 100;

function isPhoneValid(value: string | null): boolean {
  if (!value) return false;
  const digits = value.replace(/\D/g, "");
  return digits.length >= PHONE_MIN_DIGITS && digits.length <= PHONE_MAX_DIGITS;
}

export async function GET(request: Request) {
  const actorResult = await requireLeasedVehicleActor("read");
  if ("error" in actorResult) return actorResult.error;

  const { searchParams } = new URL(request.url);
  const search = searchParams.get("search")?.trim() || null;
  const status = searchParams.get("status")?.trim() || null;
  const limit = Number(searchParams.get("limit") ?? 200);
  const offset = Number(searchParams.get("offset") ?? 0);
  const safeLimit = Number.isFinite(limit) ? Math.max(1, Math.min(limit, 500)) : 200;
  const safeOffset = Number.isFinite(offset) ? Math.max(0, offset) : 0;

  const rpcParams = {
    p_actor: actorResult.actor.id,
    p_status: status,
    p_search: search,
    p_limit: safeLimit,
    p_offset: safeOffset,
  } as never;

  const v3Result = await actorResult.supabase.rpc("leased_vehicle_list_v3", rpcParams);
  let rpcData = v3Result.data;
  let rpcError = v3Result.error;

  if (rpcError && isMissingRpcError(rpcError)) {
    const v2Result = await actorResult.supabase.rpc("leased_vehicle_list_v2", rpcParams);
    rpcData = v2Result.data;
    rpcError = v2Result.error;
  }

  if (rpcError) {
    if (isMissingRpcError(rpcError)) {
      return NextResponse.json({ ok: false, message: "Missing RPC: leased_vehicle_list_v2/leased_vehicle_list_v3" }, { status: 500 });
    }
    return mapRpcError(rpcError.message ?? "Unable to fetch leased vehicles", rpcError.code);
  }

  const rows = (Array.isArray(rpcData) ? rpcData : []) as LeasedVehicleRow[];
  return NextResponse.json({ ok: true, data: rows.map(normalizeLeasedVehicleRow) });
}

interface CreateBody {
  number?: unknown;
  type?: unknown;
  vehicleLength?: unknown;
  vendorId?: unknown;
  leasedDriverName?: unknown;
  leasedDriverPhone?: unknown;
  driverDaPerDay?: unknown;
  vehicleRentPerDay?: unknown;
  mileageMin?: unknown;
  mileageMax?: unknown;
  defaultTerrain?: unknown;
  fuelVarianceThresholdPercent?: unknown;
  unofficialGateCap?: unknown;
  dalaKharchaCap?: unknown;
  parkingCap?: unknown;
}

export async function POST(request: Request) {
  const actorResult = await requireLeasedVehicleActor("write");
  if ("error" in actorResult) return actorResult.error;

  const body = (await request.json().catch(() => null)) as CreateBody | null;

  const vehicleNumber = toOptionalTrimmedString(body?.number);
  const vehicleType = toOptionalTrimmedString(body?.type);
  const leasedDriverName = toOptionalTrimmedString(body?.leasedDriverName);
  const leasedDriverPhone = toOptionalTrimmedString(body?.leasedDriverPhone);

  if (!vehicleNumber || !vehicleType) {
    return NextResponse.json(
      { ok: false, message: "Vehicle number and type are required" },
      { status: 400 },
    );
  }
  if (vehicleNumber.length > VEHICLE_NUMBER_MAX_LENGTH) {
    return NextResponse.json(
      { ok: false, message: `number must be at most ${VEHICLE_NUMBER_MAX_LENGTH} characters` },
      { status: 400 },
    );
  }
  if (vehicleType.length > VEHICLE_TYPE_MAX_LENGTH) {
    return NextResponse.json(
      { ok: false, message: `type must be at most ${VEHICLE_TYPE_MAX_LENGTH} characters` },
      { status: 400 },
    );
  }
  const vehicleLength = toOptionalTrimmedString(body?.vehicleLength);
  if (vehicleLength && vehicleLength.length > VEHICLE_LENGTH_MAX_LENGTH) {
    return NextResponse.json(
      { ok: false, message: `vehicleLength must be at most ${VEHICLE_LENGTH_MAX_LENGTH} characters` },
      { status: 400 },
    );
  }
  if (!leasedDriverName) {
    return NextResponse.json({ ok: false, message: "Leased driver name is required" }, { status: 400 });
  }
  if (leasedDriverName.length > LEASED_DRIVER_NAME_MAX_LENGTH) {
    return NextResponse.json(
      { ok: false, message: `leasedDriverName must be at most ${LEASED_DRIVER_NAME_MAX_LENGTH} characters` },
      { status: 400 },
    );
  }
  if (!isPhoneValid(leasedDriverPhone)) {
    return NextResponse.json(
      { ok: false, message: `leasedDriverPhone must have ${PHONE_MIN_DIGITS}-${PHONE_MAX_DIGITS} digits` },
      { status: 400 },
    );
  }

  const driverDaPerDay = toNullableNumber(body?.driverDaPerDay) ?? 1000;
  const vehicleRentPerDay = toNullableNumber(body?.vehicleRentPerDay) ?? 3333;
  const mileageMin = toNullableNumber(body?.mileageMin) ?? 3.0;
  const mileageMax = toNullableNumber(body?.mileageMax) ?? 5.0;
  const fuelVarianceThresholdPercent = toNullableNumber(body?.fuelVarianceThresholdPercent) ?? 10;
  const unofficialGateCap = toNullableNumber(body?.unofficialGateCap);
  const dalaKharchaCap = toNullableNumber(body?.dalaKharchaCap);
  const parkingCap = toNullableNumber(body?.parkingCap);

  if (driverDaPerDay < 0 || driverDaPerDay > MAX_CURRENCY_VALUE) {
    return NextResponse.json({ ok: false, message: "driverDaPerDay is out of range" }, { status: 400 });
  }
  if (vehicleRentPerDay < 0 || vehicleRentPerDay > MAX_CURRENCY_VALUE) {
    return NextResponse.json({ ok: false, message: "vehicleRentPerDay is out of range" }, { status: 400 });
  }
  if (mileageMin < 0 || mileageMax < 0 || mileageMin > MAX_MILEAGE || mileageMax > MAX_MILEAGE) {
    return NextResponse.json({ ok: false, message: "mileage is out of range" }, { status: 400 });
  }
  if (mileageMin > mileageMax) {
    return NextResponse.json({ ok: false, message: "mileageMin must be <= mileageMax" }, { status: 400 });
  }
  if (fuelVarianceThresholdPercent < 0 || fuelVarianceThresholdPercent > MAX_PERCENT) {
    return NextResponse.json(
      { ok: false, message: `fuelVarianceThresholdPercent must be between 0 and ${MAX_PERCENT}` },
      { status: 400 },
    );
  }
  if (unofficialGateCap !== null && (unofficialGateCap < 0 || unofficialGateCap > MAX_CURRENCY_VALUE)) {
    return NextResponse.json({ ok: false, message: "unofficialGateCap is out of range" }, { status: 400 });
  }
  if (dalaKharchaCap !== null && (dalaKharchaCap < 0 || dalaKharchaCap > MAX_CURRENCY_VALUE)) {
    return NextResponse.json({ ok: false, message: "dalaKharchaCap is out of range" }, { status: 400 });
  }
  if (parkingCap !== null && (parkingCap < 0 || parkingCap > MAX_CURRENCY_VALUE)) {
    return NextResponse.json({ ok: false, message: "parkingCap is out of range" }, { status: 400 });
  }

  const createParamsV3 = {
    p_actor: actorResult.actor.id,
    p_number: vehicleNumber.toUpperCase(),
    p_type: vehicleType,
    p_vehicle_length: vehicleLength,
    p_vendor_id: toOptionalTrimmedString(body?.vendorId),
    p_leased_driver_name: leasedDriverName,
    p_leased_driver_phone: leasedDriverPhone,
    p_driver_da_per_day: driverDaPerDay,
    p_vehicle_rent_per_day: vehicleRentPerDay,
    p_mileage_min: mileageMin,
    p_mileage_max: mileageMax,
    p_default_terrain: toOptionalTrimmedString(body?.defaultTerrain) ?? "plain",
    p_fuel_variance_threshold_percent: fuelVarianceThresholdPercent,
    p_unofficial_gate_cap: unofficialGateCap,
    p_dala_kharcha_cap: dalaKharchaCap,
    p_parking_cap: parkingCap,
  } as never;
  const createParamsV2 = {
    p_actor: actorResult.actor.id,
    p_number: vehicleNumber.toUpperCase(),
    p_type: vehicleType,
    p_vehicle_length: vehicleLength,
    p_vendor_id: toOptionalTrimmedString(body?.vendorId),
    p_driver_da_per_day: driverDaPerDay,
    p_vehicle_rent_per_day: vehicleRentPerDay,
    p_mileage_min: mileageMin,
    p_mileage_max: mileageMax,
    p_default_terrain: toOptionalTrimmedString(body?.defaultTerrain) ?? "plain",
    p_fuel_variance_threshold_percent: fuelVarianceThresholdPercent,
    p_unofficial_gate_cap: unofficialGateCap,
    p_dala_kharcha_cap: dalaKharchaCap,
    p_parking_cap: parkingCap,
  } as never;

  const v3CreateResult = await actorResult.supabase.rpc("leased_vehicle_create_v3", createParamsV3);
  let rpcData = v3CreateResult.data;
  let rpcError = v3CreateResult.error;

  if (rpcError && isMissingRpcError(rpcError)) {
    const v2CreateResult = await actorResult.supabase.rpc("leased_vehicle_create_v2", createParamsV2);
    rpcData = v2CreateResult.data;
    rpcError = v2CreateResult.error;
  }

  if (rpcError) {
    if (isMissingRpcError(rpcError)) {
      return NextResponse.json({ ok: false, message: "Missing RPC: leased_vehicle_create_v2/leased_vehicle_create_v3" }, { status: 500 });
    }
    return mapRpcError(rpcError.message ?? "Unable to create leased vehicle", rpcError.code);
  }

  const row = Array.isArray(rpcData)
    ? ((rpcData[0] ?? null) as LeasedVehicleRow | null)
    : ((rpcData ?? null) as LeasedVehicleRow | null);

  if (!row) {
    return NextResponse.json({ ok: false, message: "Unable to create leased vehicle" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, data: normalizeLeasedVehicleRow(row) }, { status: 201 });
}
