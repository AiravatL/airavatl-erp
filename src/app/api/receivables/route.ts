import { NextResponse } from "next/server";
import { requireServerActor } from "@/lib/auth/server-actor";
import { isMissingRpcError } from "@/lib/supabase/rpc";

export const dynamic = "force-dynamic";

const ALLOWED = ["super_admin", "admin", "accounts"] as const;

export async function GET(request: Request) {
  const actorResult = await requireServerActor(ALLOWED);
  if ("error" in actorResult) return actorResult.error;

  const url = new URL(request.url);
  const search = url.searchParams.get("search") || undefined;
  const status = url.searchParams.get("status") || undefined;
  const consignerId = url.searchParams.get("consigner_id") || undefined;
  const aging = url.searchParams.get("aging") || undefined;
  const limit = Number(url.searchParams.get("limit") || 50);
  const offset = Number(url.searchParams.get("offset") || 0);

  const { data, error } = await actorResult.supabase.rpc("receivables_list_v1", {
    p_actor_user_id: actorResult.actor.id,
    p_search: search ?? null,
    p_status: status ?? null,
    p_consigner_id: consignerId ?? null,
    p_aging: aging ?? null,
    p_limit: limit,
    p_offset: offset,
  } as never);

  if (error) {
    if (isMissingRpcError(error)) return NextResponse.json({ ok: false, message: "Missing RPC" }, { status: 500 });
    return NextResponse.json({ ok: false, message: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, data });
}
