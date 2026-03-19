import { NextResponse } from "next/server";
import { isMissingRpcError } from "@/lib/supabase/rpc";
import { requireTripActor, mapTripRpcError } from "@/app/api/trips/_shared";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const actorResult = await requireTripActor();
  if ("error" in actorResult) return actorResult.error;

  const { searchParams } = new URL(request.url);
  const search = searchParams.get("search")?.trim() || null;
  const status = searchParams.get("status")?.trim() || null;
  const limit = Number(searchParams.get("limit") ?? 50);
  const offset = Number(searchParams.get("offset") ?? 0);

  const { data: rpcData, error: rpcError } = await actorResult.supabase.rpc(
    "trip_list_v1",
    {
      p_actor_user_id: actorResult.actor.id,
      p_search: search,
      p_status: status,
      p_limit: Number.isFinite(limit) ? Math.max(1, Math.min(limit, 200)) : 50,
      p_offset: Number.isFinite(offset) ? Math.max(0, offset) : 0,
    } as never,
  );

  if (rpcError) {
    if (isMissingRpcError(rpcError)) {
      return NextResponse.json(
        { ok: false, message: "Missing RPC: trip_list_v1" },
        { status: 500 },
      );
    }
    return mapTripRpcError(rpcError.message ?? "Unable to list trips", rpcError.code);
  }

  const result = rpcData as {
    total: number;
    limit: number;
    offset: number;
    items: Array<Record<string, unknown>>;
  } | null;

  return NextResponse.json({
    ok: true,
    data: {
      total: result?.total ?? 0,
      limit: result?.limit ?? 50,
      offset: result?.offset ?? 0,
      items: result?.items ?? [],
    },
  });
}
