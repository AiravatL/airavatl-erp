import { NextResponse } from "next/server";
import { requireServerActor } from "@/lib/auth/server-actor";
import { isMissingRpcError } from "@/lib/supabase/rpc";

export async function POST(request: Request) {
  const actorResult = await requireServerActor(["super_admin", "admin"]);
  if ("error" in actorResult) return actorResult.error;

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) {
    return NextResponse.json({ ok: false, message: "Request body is required" }, { status: 400 });
  }

  const capacityTons = Number(body.capacityTons);
  if (!Number.isFinite(capacityTons) || capacityTons <= 0) {
    return NextResponse.json({ ok: false, message: "capacityTons must be a positive number" }, { status: 400 });
  }

  const { data: rpcData, error: rpcError } = await actorResult.supabase.rpc(
    "vehicle_master_upsert_vehicle_v1",
    {
      p_actor_user_id: actorResult.actor.id,
      p_vehicle_id: null,
      p_capacity_tons: capacityTons,
      p_length_feet: body.lengthFeet != null ? Number(body.lengthFeet) : null,
      p_body_type: String(body.bodyType ?? "open"),
      p_wheel_count: body.wheelCount != null ? Number(body.wheelCount) : null,
      p_active: body.active !== false,
    } as never,
  );

  if (rpcError) {
    if (isMissingRpcError(rpcError)) {
      return NextResponse.json({ ok: false, message: "Missing RPC: vehicle_master_upsert_vehicle_v1" }, { status: 500 });
    }
    return NextResponse.json({ ok: false, message: rpcError.message ?? "Unable to create vehicle" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, data: rpcData });
}
