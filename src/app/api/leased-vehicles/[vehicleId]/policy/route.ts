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

function toNullableNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

const MAX_CURRENCY_VALUE = 1_000_000_000_000;
const MAX_MILEAGE = 100;
const MAX_PERCENT = 100;

interface UpdatePolicyBody {
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

export async function PATCH(request: Request, context: RouteParams) {
  const actorResult = await requireLeasedVehicleActor("write");
  if ("error" in actorResult) return actorResult.error;

  const { vehicleId } = await context.params;
  if (!vehicleId) {
    return NextResponse.json({ ok: false, message: "vehicleId is required" }, { status: 400 });
  }

  const body = (await request.json().catch(() => null)) as UpdatePolicyBody | null;
  if (!body) {
    return NextResponse.json({ ok: false, message: "Invalid request body" }, { status: 400 });
  }

  const driverDaPerDay = toNullableNumber(body.driverDaPerDay);
  const vehicleRentPerDay = toNullableNumber(body.vehicleRentPerDay);
  const mileageMin = toNullableNumber(body.mileageMin);
  const mileageMax = toNullableNumber(body.mileageMax);
  const fuelVarianceThresholdPercent = toNullableNumber(body.fuelVarianceThresholdPercent);
  const unofficialGateCap = toNullableNumber(body.unofficialGateCap);
  const dalaKharchaCap = toNullableNumber(body.dalaKharchaCap);
  const parkingCap = toNullableNumber(body.parkingCap);

  if (driverDaPerDay !== null && (driverDaPerDay < 0 || driverDaPerDay > MAX_CURRENCY_VALUE)) {
    return NextResponse.json({ ok: false, message: "driverDaPerDay is out of range" }, { status: 400 });
  }
  if (vehicleRentPerDay !== null && (vehicleRentPerDay < 0 || vehicleRentPerDay > MAX_CURRENCY_VALUE)) {
    return NextResponse.json({ ok: false, message: "vehicleRentPerDay is out of range" }, { status: 400 });
  }
  if (mileageMin !== null && (mileageMin < 0 || mileageMin > MAX_MILEAGE)) {
    return NextResponse.json({ ok: false, message: "mileageMin is out of range" }, { status: 400 });
  }
  if (mileageMax !== null && (mileageMax < 0 || mileageMax > MAX_MILEAGE)) {
    return NextResponse.json({ ok: false, message: "mileageMax is out of range" }, { status: 400 });
  }
  if (mileageMin !== null && mileageMax !== null && mileageMin > mileageMax) {
    return NextResponse.json({ ok: false, message: "mileageMin must be <= mileageMax" }, { status: 400 });
  }
  if (
    fuelVarianceThresholdPercent !== null &&
    (fuelVarianceThresholdPercent < 0 || fuelVarianceThresholdPercent > MAX_PERCENT)
  ) {
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

  const { data: rpcData, error: rpcError } = await actorResult.supabase.rpc("leased_vehicle_update_policy_v1", {
    p_actor: actorResult.actor.id,
    p_vehicle_id: vehicleId,
    p_driver_da_per_day: driverDaPerDay,
    p_vehicle_rent_per_day: vehicleRentPerDay,
    p_mileage_min: mileageMin,
    p_mileage_max: mileageMax,
    p_default_terrain: toOptionalTrimmedString(body.defaultTerrain),
    p_fuel_variance_threshold_percent: fuelVarianceThresholdPercent,
    p_unofficial_gate_cap: unofficialGateCap,
    p_dala_kharcha_cap: dalaKharchaCap,
    p_parking_cap: parkingCap,
  } as never);

  if (rpcError) {
    if (isMissingRpcError(rpcError)) {
      return NextResponse.json({ ok: false, message: "Missing RPC: leased_vehicle_update_policy_v1" }, { status: 500 });
    }
    return mapRpcError(rpcError.message ?? "Unable to update policy", rpcError.code);
  }

  const row = Array.isArray(rpcData)
    ? ((rpcData[0] ?? null) as LeasedVehicleRow | null)
    : ((rpcData ?? null) as LeasedVehicleRow | null);

  if (!row) {
    return NextResponse.json({ ok: false, message: "Unable to update policy" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, data: normalizeLeasedVehicleRow(row) });
}
