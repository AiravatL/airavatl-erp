import { NextResponse } from "next/server";
import { requireServerActor } from "@/lib/auth/server-actor";
import { isMissingRpcError } from "@/lib/supabase/rpc";

interface RouteParams { params: Promise<{ vehicleId: string }> }

export async function PATCH(request: Request, context: RouteParams) {
  const actorResult = await requireServerActor(["super_admin", "admin"]);
  if ("error" in actorResult) return actorResult.error;

  const { vehicleId } = await context.params;
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) {
    return NextResponse.json({ ok: false, message: "Request body is required" }, { status: 400 });
  }

  const { data: rpcData, error: rpcError } = await actorResult.supabase.rpc(
    "vehicle_master_upsert_vehicle_v1",
    {
      p_actor_user_id: actorResult.actor.id,
      p_vehicle_id: vehicleId,
      p_capacity_tons: Number(body.capacityTons),
      p_length_feet: body.lengthFeet != null ? Number(body.lengthFeet) : null,
      p_body_type: String(body.bodyType ?? "open"),
      p_wheel_count: body.wheelCount != null ? Number(body.wheelCount) : null,
      p_active: typeof body.active === "boolean" ? body.active : true,
    } as never,
  );

  if (rpcError) {
    if (isMissingRpcError(rpcError)) return NextResponse.json({ ok: false, message: "Missing RPC" }, { status: 500 });
    return NextResponse.json({ ok: false, message: rpcError.message ?? "Unable to update vehicle" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, data: rpcData });
}

export async function DELETE(_request: Request, context: RouteParams) {
  const actorResult = await requireServerActor(["super_admin", "admin"]);
  if ("error" in actorResult) return actorResult.error;

  const { vehicleId } = await context.params;

  const { error: rpcError } = await actorResult.supabase.rpc(
    "vehicle_master_delete_vehicle_v1",
    { p_actor_user_id: actorResult.actor.id, p_vehicle_id: vehicleId } as never,
  );

  if (rpcError) {
    if (isMissingRpcError(rpcError)) return NextResponse.json({ ok: false, message: "Missing RPC" }, { status: 500 });
    const msg = rpcError.message ?? "Unable to delete vehicle";
    const status = msg.includes("vehicle_in_use") ? 409 : msg.includes("vehicle_not_found") ? 404 : 500;
    return NextResponse.json({ ok: false, message: msg }, { status });
  }

  return NextResponse.json({ ok: true, data: null });
}
