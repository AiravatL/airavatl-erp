import { NextResponse } from "next/server";
import { isMissingRpcError } from "@/lib/supabase/rpc";
import { requireDeliveryRequestActor, mapRpcError } from "@/app/api/delivery-requests/_shared";

export const dynamic = "force-dynamic";

interface StatsRow {
  open: number;
  active: number;
}

export async function GET() {
  const actorResult = await requireDeliveryRequestActor();
  if ("error" in actorResult) return actorResult.error;

  const { data: rpcData, error: rpcError } = await actorResult.supabase.rpc(
    "auction_stats_v1",
    { p_actor_user_id: actorResult.actor.id } as never,
  );

  if (rpcError) {
    if (isMissingRpcError(rpcError)) {
      return NextResponse.json(
        { ok: false, message: "Missing RPC: auction_stats_v1" },
        { status: 500 },
      );
    }
    return mapRpcError(rpcError.message ?? "Unable to load auction stats", rpcError.code);
  }

  const result = (rpcData ?? {}) as { erp?: StatsRow; app?: StatsRow };
  return NextResponse.json({
    ok: true,
    data: {
      erp: { open: result.erp?.open ?? 0, active: result.erp?.active ?? 0 },
      app: { open: result.app?.open ?? 0, active: result.app?.active ?? 0 },
    },
  });
}
