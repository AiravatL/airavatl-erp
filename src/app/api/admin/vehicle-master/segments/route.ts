import { NextResponse } from "next/server";
import { requireServerActor } from "@/lib/auth/server-actor";
import { isMissingRpcError } from "@/lib/supabase/rpc";

export async function POST(request: Request) {
  const actorResult = await requireServerActor(["super_admin", "admin"]);
  if ("error" in actorResult) return actorResult.error;

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body || !body.label || !body.bodyType) {
    return NextResponse.json({ ok: false, message: "label and bodyType are required" }, { status: 400 });
  }

  const { data: rpcData, error: rpcError } = await actorResult.supabase.rpc(
    "vehicle_master_upsert_segment_v1",
    {
      p_actor_user_id: actorResult.actor.id,
      p_segment_id: null,
      p_body_type: String(body.bodyType),
      p_label: String(body.label),
      p_weight_min_kg: Number(body.weightMinKg ?? 0),
      p_weight_max_kg: body.weightMaxKg != null ? Number(body.weightMaxKg) : null,
      p_active: body.active !== false,
    } as never,
  );

  if (rpcError) {
    if (isMissingRpcError(rpcError)) return NextResponse.json({ ok: false, message: "Missing RPC" }, { status: 500 });
    return NextResponse.json({ ok: false, message: rpcError.message ?? "Unable to create segment" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, data: rpcData });
}
