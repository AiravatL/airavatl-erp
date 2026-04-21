import { NextResponse } from "next/server";
import { requireServerActor } from "@/lib/auth/server-actor";
import { isMissingRpcError } from "@/lib/supabase/rpc";
import { REPORT_ROLES } from "@/app/api/reports/_shared";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const actorResult = await requireServerActor(REPORT_ROLES);
  if ("error" in actorResult) return actorResult.error;

  const { searchParams } = new URL(request.url);
  const from = searchParams.get("from")?.trim() || null;
  const to = searchParams.get("to")?.trim() || null;

  const { data, error } = await actorResult.supabase.rpc("admin_analytics_v1", {
    p_actor_user_id: actorResult.actor.id,
    p_from: from,
    p_to: to,
  } as never);

  if (error) {
    if (isMissingRpcError(error)) {
      return NextResponse.json(
        { ok: false, message: "Missing RPC: admin_analytics_v1" },
        { status: 500 },
      );
    }
    return NextResponse.json(
      { ok: false, message: error.message ?? "Unable to load analytics" },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true, data: data ?? {} });
}
