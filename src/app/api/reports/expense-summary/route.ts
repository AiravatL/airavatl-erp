import { NextResponse } from "next/server";
import { isMissingRpcError } from "@/lib/supabase/rpc";
import { mapReportRpcError, parseReportFilters, requireReportActor } from "@/app/api/reports/_shared";

export async function GET(request: Request) {
  const actorResult = await requireReportActor();
  if ("error" in actorResult) return actorResult.error;

  const parsedFilters = parseReportFilters(request);
  if (parsedFilters.error) return parsedFilters.error;

  const { fromDate, toDate, ownerId, vehicleType } = parsedFilters.data!;

  const { data: rpcData, error: rpcError } = await actorResult.supabase.rpc("report_expense_summary_v1", {
    p_actor_user_id: actorResult.actor.id,
    p_from_date: fromDate,
    p_to_date: toDate,
    p_owner_id: ownerId,
    p_vehicle_type: vehicleType,
  } as never);

  if (rpcError) {
    if (isMissingRpcError(rpcError)) {
      return NextResponse.json({ ok: false, message: "Missing RPC: report_expense_summary_v1" }, { status: 500 });
    }
    return mapReportRpcError(rpcError.message ?? "Unable to fetch expense summary", rpcError.code);
  }

  const normalized = Array.isArray(rpcData) ? (rpcData[0] ?? null) : rpcData;
  return NextResponse.json({ ok: true, data: normalized ?? { summary: {}, categoryBreakdown: [], monthlyTrend: [] } });
}
