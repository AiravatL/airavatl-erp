import { NextResponse } from "next/server";
import { isMissingRpcError } from "@/lib/supabase/rpc";
import { mapFleetRpcError, requireFleetActor } from "@/app/api/fleet/_shared";

interface AssignBody {
  driverId?: unknown;
}

interface AssignResult {
  vehicle_id: string;
  driver_id: string;
  driver_name: string;
}

function toOptionalTrimmed(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ vehicleId: string }> },
) {
  const actorResult = await requireFleetActor();
  if ("error" in actorResult) return actorResult.error;

  const { vehicleId } = await params;
  if (!vehicleId) {
    return NextResponse.json({ ok: false, message: "vehicleId is required" }, { status: 400 });
  }

  const body = (await request.json().catch(() => null)) as AssignBody | null;
  const driverId = toOptionalTrimmed(body?.driverId);
  if (!driverId) {
    return NextResponse.json({ ok: false, message: "driverId is required" }, { status: 400 });
  }

  const { data: rpcData, error: rpcError } = await actorResult.supabase.rpc("vehicle_driver_assign_v1", {
    p_actor: actorResult.actor.id,
    p_vehicle_id: vehicleId,
    p_driver_id: driverId,
  } as never);

  if (rpcError) {
    if (isMissingRpcError(rpcError)) {
      return NextResponse.json({ ok: false, message: "Missing RPC: vehicle_driver_assign_v1" }, { status: 500 });
    }
    return mapFleetRpcError(rpcError.message ?? "Unable to assign driver", rpcError.code);
  }

  const row = rpcData as AssignResult | null;
  if (!row) {
    return NextResponse.json({ ok: false, message: "Unable to assign driver" }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    data: {
      vehicleId: row.vehicle_id,
      driverId: row.driver_id,
      driverName: row.driver_name,
    },
  });
}
