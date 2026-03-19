import { NextResponse } from "next/server";
import { requireServerActor } from "@/lib/auth/server-actor";
import { isMissingRpcError } from "@/lib/supabase/rpc";
import { REPORT_ROLES } from "@/app/api/reports/_shared";

export async function GET(request: Request) {
  const actorResult = await requireServerActor(REPORT_ROLES);
  if ("error" in actorResult) return actorResult.error;

  const { searchParams } = new URL(request.url);
  const from = searchParams.get("from")?.trim() || null;
  const to = searchParams.get("to")?.trim() || null;

  const { data: rpcData, error: rpcError } = await actorResult.supabase.rpc(
    "admin_report_overview_v1",
    {
      p_actor_user_id: actorResult.actor.id,
      p_from: from,
      p_to: to,
    } as never,
  );

  if (rpcError) {
    if (isMissingRpcError(rpcError)) {
      return NextResponse.json({ ok: false, message: "Missing RPC: admin_report_overview_v1" }, { status: 500 });
    }
    return NextResponse.json({ ok: false, message: rpcError.message ?? "Unable to fetch overview" }, { status: 500 });
  }

  const normalized = Array.isArray(rpcData) ? (rpcData[0] ?? null) : rpcData;
  return NextResponse.json({ ok: true, data: normalized ?? {} });
}
