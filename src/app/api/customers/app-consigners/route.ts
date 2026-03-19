import { NextResponse } from "next/server";
import { requireServerActor } from "@/lib/auth/server-actor";
import { isMissingRpcError } from "@/lib/supabase/rpc";

export async function GET(request: Request) {
  const actorResult = await requireServerActor();
  if ("error" in actorResult) return actorResult.error;

  const { searchParams } = new URL(request.url);
  const search = searchParams.get("search")?.trim() || null;
  const limit = Number(searchParams.get("limit") ?? 200);
  const offset = Number(searchParams.get("offset") ?? 0);

  const { data: rpcData, error: rpcError } = await actorResult.supabase.rpc(
    "app_consigner_list_v1",
    {
      p_actor: actorResult.actor.id,
      p_search: search,
      p_limit: Math.max(1, Math.min(limit, 500)),
      p_offset: Math.max(0, offset),
    } as never,
  );

  if (rpcError) {
    if (isMissingRpcError(rpcError)) {
      return NextResponse.json({ ok: false, message: "Missing RPC: app_consigner_list_v1" }, { status: 500 });
    }
    return NextResponse.json({ ok: false, message: rpcError.message ?? "Unable to fetch app consigners" }, { status: 500 });
  }

  const result = (rpcData ?? { total: 0, items: [] }) as { total: number; items: unknown[] };
  return NextResponse.json({ ok: true, data: result });
}
