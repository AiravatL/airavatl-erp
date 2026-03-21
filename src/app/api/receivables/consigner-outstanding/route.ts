import { NextResponse } from "next/server";
import { requireServerActor } from "@/lib/auth/server-actor";
import { isMissingRpcError } from "@/lib/supabase/rpc";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const actorResult = await requireServerActor(["super_admin", "admin", "accounts"]);
  if ("error" in actorResult) return actorResult.error;

  const url = new URL(request.url);
  const consignerId = url.searchParams.get("consigner_id");

  if (!consignerId) {
    return NextResponse.json({ ok: false, message: "consigner_id is required" }, { status: 400 });
  }

  const { data, error } = await actorResult.supabase.rpc("receivable_consigner_outstanding_v1", {
    p_actor_user_id: actorResult.actor.id,
    p_consigner_profile_id: consignerId,
  } as never);

  if (error) {
    if (isMissingRpcError(error)) return NextResponse.json({ ok: false, message: "Missing RPC" }, { status: 500 });
    return NextResponse.json({ ok: false, message: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, data });
}
