import { NextResponse } from "next/server";
import { requireServerActor } from "@/lib/auth/server-actor";
import { isMissingRpcError } from "@/lib/supabase/rpc";

const ADMIN_ONLY = ["super_admin", "admin"] as const;

export async function POST(request: Request) {
  const actorResult = await requireServerActor(ADMIN_ONLY);
  if ("error" in actorResult) return actorResult.error;

  const body = (await request.json().catch(() => null)) as {
    type?: string;
    id?: string;
  } | null;

  const type = body?.type;
  const id = body?.id;

  if (!type || !id) {
    return NextResponse.json({ ok: false, message: "type and id are required" }, { status: 400 });
  }

  let rpcName: string;
  let rpcParams: Record<string, unknown>;

  switch (type) {
    case "auction":
      rpcName = "admin_delete_delivery_request_v1";
      rpcParams = { p_actor_user_id: actorResult.actor.id, p_request_id: id };
      break;
    case "trip":
      rpcName = "admin_delete_trip_v1";
      rpcParams = { p_actor_user_id: actorResult.actor.id, p_trip_id: id };
      break;
    default:
      return NextResponse.json({ ok: false, message: `Unknown delete type: ${type}` }, { status: 400 });
  }

  const { data: rpcData, error: rpcError } = await actorResult.supabase.rpc(
    rpcName,
    rpcParams as never,
  );

  if (rpcError) {
    if (isMissingRpcError(rpcError)) {
      return NextResponse.json({ ok: false, message: `Missing RPC: ${rpcName}` }, { status: 500 });
    }
    const msg = rpcError.message ?? "Unable to delete";
    const status = msg.includes("not_found") ? 404 : 500;
    return NextResponse.json({ ok: false, message: msg }, { status });
  }

  return NextResponse.json({ ok: true, data: rpcData });
}
