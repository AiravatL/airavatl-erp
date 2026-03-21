import { NextResponse } from "next/server";
import { requireServerActor } from "@/lib/auth/server-actor";
import { isMissingRpcError } from "@/lib/supabase/rpc";

export const dynamic = "force-dynamic";

export async function GET() {
  const actorResult = await requireServerActor(["super_admin", "admin", "accounts"]);
  if ("error" in actorResult) return actorResult.error;

  const { data, error } = await actorResult.supabase.rpc("receivables_summary_v1", {
    p_actor_user_id: actorResult.actor.id,
  } as never);

  if (error) {
    if (isMissingRpcError(error)) return NextResponse.json({ ok: false, message: "Missing RPC" }, { status: 500 });
    return NextResponse.json({ ok: false, message: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, data });
}
