import { NextResponse } from "next/server";
import { requireServerActor } from "@/lib/auth/server-actor";
import { isMissingRpcError } from "@/lib/supabase/rpc";
import { mapTripRpcError } from "@/app/api/trips/_shared";
import type { Role } from "@/lib/types";

export const dynamic = "force-dynamic";

const HISTORY_ALLOWED_ROLES: Role[] = ["super_admin", "admin"];

export async function GET(request: Request) {
  const actorResult = await requireServerActor(HISTORY_ALLOWED_ROLES);
  if ("error" in actorResult) return actorResult.error;

  const { searchParams } = new URL(request.url);
  const search = searchParams.get("search")?.trim() || null;
  const limit = Number(searchParams.get("limit") ?? 50);
  const offset = Number(searchParams.get("offset") ?? 0);

  // History shows completed + cancelled trips
  // We call trip_list_v1 twice (for each status) and merge, or we pass a special filter.
  // Since our RPC supports single status filter, we'll make two calls and merge.
  // Alternatively, we can pass null status and filter in SQL. Let's use null and accept all,
  // then filter for terminal statuses client-side. But better: call without status filter
  // and use the RPC. For history, let's just call with no status and let the UI filter.
  // Actually, the plan says history uses trip_list_v1 with status filter.
  // We'll call it for delivery_completed and cancelled separately and merge.

  const completedP = actorResult.supabase.rpc("trip_list_v1", {
    p_actor_user_id: actorResult.actor.id,
    p_search: search,
    p_status: "completed",
    p_limit: Number.isFinite(limit) ? Math.max(1, Math.min(limit, 200)) : 50,
    p_offset: Number.isFinite(offset) ? Math.max(0, offset) : 0,
  } as never);

  const cancelledP = actorResult.supabase.rpc("trip_list_v1", {
    p_actor_user_id: actorResult.actor.id,
    p_search: search,
    p_status: "cancelled",
    p_limit: Number.isFinite(limit) ? Math.max(1, Math.min(limit, 200)) : 50,
    p_offset: Number.isFinite(offset) ? Math.max(0, offset) : 0,
  } as never);

  const [completedResult, cancelledResult] = await Promise.all([completedP, cancelledP]);

  if (completedResult.error) {
    if (isMissingRpcError(completedResult.error)) {
      return NextResponse.json({ ok: false, message: "Missing RPC: trip_list_v1" }, { status: 500 });
    }
    return mapTripRpcError(completedResult.error.message ?? "Unable to fetch trip history", completedResult.error.code);
  }

  if (cancelledResult.error) {
    return mapTripRpcError(cancelledResult.error.message ?? "Unable to fetch trip history", cancelledResult.error.code);
  }

  type RpcResult = { total: number; items: Array<Record<string, unknown>> } | null;
  const completed = completedResult.data as RpcResult;
  const cancelled = cancelledResult.data as RpcResult;

  const allItems = [
    ...(completed?.items ?? []),
    ...(cancelled?.items ?? []),
  ].sort((a, b) => {
    const aDate = (a.updated_at as string) ?? (a.created_at as string) ?? "";
    const bDate = (b.updated_at as string) ?? (b.created_at as string) ?? "";
    return bDate.localeCompare(aDate);
  });

  const total = (completed?.total ?? 0) + (cancelled?.total ?? 0);

  return NextResponse.json({
    ok: true,
    data: {
      total,
      limit: Number.isFinite(limit) ? Math.max(1, Math.min(limit, 200)) : 50,
      offset: Number.isFinite(offset) ? Math.max(0, offset) : 0,
      items: allItems,
    },
  });
}
