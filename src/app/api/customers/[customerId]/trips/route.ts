import { NextResponse } from "next/server";
import { isMissingRpcError } from "@/lib/supabase/rpc";
import { mapCustomerRpcError, requireCustomerActor } from "@/app/api/customers/_shared";

export const dynamic = "force-dynamic";

interface RouteParams {
  params: Promise<{ customerId: string }>;
}

interface TripRow {
  id: string;
  trip_code: string;
  route: string | null;
  current_stage: string;
  schedule_date: string | null;
  vehicle_number: string | null;
  created_at: string;
  updated_at: string;
}

export async function GET(request: Request, context: RouteParams) {
  const actorResult = await requireCustomerActor("read");
  if ("error" in actorResult) return actorResult.error;

  const { customerId } = await context.params;
  if (!customerId) {
    return NextResponse.json({ ok: false, message: "customerId is required" }, { status: 400 });
  }

  const { searchParams } = new URL(request.url);
  const limit = Number(searchParams.get("limit") ?? 50);
  const offset = Number(searchParams.get("offset") ?? 0);
  const safeLimit = Number.isFinite(limit) ? Math.max(1, Math.min(limit, 500)) : 50;
  const safeOffset = Number.isFinite(offset) ? Math.max(0, offset) : 0;

  const { data: rpcData, error: rpcError } = await actorResult.supabase.rpc("customer_trip_history_v1", {
    p_actor: actorResult.actor.id,
    p_customer_id: customerId,
    p_limit: safeLimit,
    p_offset: safeOffset,
  } as never);

  if (rpcError) {
    if (isMissingRpcError(rpcError)) {
      return NextResponse.json(
        { ok: false, message: "Missing RPC: customer_trip_history_v1" },
        { status: 500 },
      );
    }
    return mapCustomerRpcError(rpcError.message ?? "Unable to fetch customer trips", rpcError.code);
  }

  const rows = (Array.isArray(rpcData) ? rpcData : []) as TripRow[];

  return NextResponse.json({
    ok: true,
    data: rows.map((row) => ({
      id: row.id,
      tripCode: row.trip_code,
      route: row.route,
      currentStage: row.current_stage,
      scheduleDate: row.schedule_date,
      vehicleNumber: row.vehicle_number,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    })),
  });
}
