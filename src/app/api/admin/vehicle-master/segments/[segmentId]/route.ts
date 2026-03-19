import { NextResponse } from "next/server";
import { requireServerActor } from "@/lib/auth/server-actor";
import { isMissingRpcError } from "@/lib/supabase/rpc";

interface RouteParams { params: Promise<{ segmentId: string }> }

export async function PATCH(request: Request, context: RouteParams) {
  const actorResult = await requireServerActor(["super_admin", "admin"]);
  if ("error" in actorResult) return actorResult.error;

  const { segmentId } = await context.params;
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) {
    return NextResponse.json({ ok: false, message: "Request body is required" }, { status: 400 });
  }

  const { data: rpcData, error: rpcError } = await actorResult.supabase.rpc(
    "vehicle_master_upsert_segment_v1",
    {
      p_actor_user_id: actorResult.actor.id,
      p_segment_id: segmentId,
      p_body_type: String(body.bodyType ?? "open"),
      p_label: String(body.label ?? ""),
      p_weight_min_kg: Number(body.weightMinKg ?? 0),
      p_weight_max_kg: body.weightMaxKg != null ? Number(body.weightMaxKg) : null,
      p_active: typeof body.active === "boolean" ? body.active : true,
    } as never,
  );

  if (rpcError) {
    if (isMissingRpcError(rpcError)) return NextResponse.json({ ok: false, message: "Missing RPC" }, { status: 500 });
    return NextResponse.json({ ok: false, message: rpcError.message ?? "Unable to update segment" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, data: rpcData });
}

export async function DELETE(_request: Request, context: RouteParams) {
  const actorResult = await requireServerActor(["super_admin", "admin"]);
  if ("error" in actorResult) return actorResult.error;

  const { segmentId } = await context.params;

  const { error: rpcError } = await actorResult.supabase.rpc(
    "vehicle_master_delete_segment_v1",
    { p_actor_user_id: actorResult.actor.id, p_segment_id: segmentId } as never,
  );

  if (rpcError) {
    if (isMissingRpcError(rpcError)) return NextResponse.json({ ok: false, message: "Missing RPC" }, { status: 500 });
    const status = rpcError.message?.includes("segment_not_found") ? 404 : 500;
    return NextResponse.json({ ok: false, message: rpcError.message ?? "Unable to delete segment" }, { status });
  }

  return NextResponse.json({ ok: true, data: null });
}
