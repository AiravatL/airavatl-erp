import { NextResponse } from "next/server";
import { requireServerActor } from "@/lib/auth/server-actor";
import { isMissingRpcError } from "@/lib/supabase/rpc";
import { REPORT_ROLES, parsePaginationParams } from "@/app/api/reports/_shared";

export async function GET(request: Request) {
  const actorResult = await requireServerActor(REPORT_ROLES);
  if ("error" in actorResult) return actorResult.error;

  const { search, status, limit, offset } = parsePaginationParams(request);

  const { data: rpcData, error: rpcError } = await actorResult.supabase.rpc(
    "admin_list_app_trips_v1",
    {
      p_actor_user_id: actorResult.actor.id,
      p_status: status,
      p_search: search,
      p_limit: limit,
      p_offset: offset,
    } as never,
  );

  if (rpcError) {
    if (isMissingRpcError(rpcError)) {
      return NextResponse.json({ ok: false, message: "Missing RPC: admin_list_app_trips_v1" }, { status: 500 });
    }
    return NextResponse.json({ ok: false, message: rpcError.message ?? "Unable to fetch trips" }, { status: 500 });
  }

  const result = (rpcData ?? {}) as { total?: number; items?: unknown[] };
  return NextResponse.json({ ok: true, data: { total: result.total ?? 0, items: result.items ?? [] } });
}
