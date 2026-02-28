import { NextResponse } from "next/server";
import { isMissingRpcError } from "@/lib/supabase/rpc";
import { mapCustomerRpcError, requireCustomerActor } from "@/app/api/customers/_shared";

export const dynamic = "force-dynamic";

interface RouteParams {
  params: Promise<{ customerId: string }>;
}

interface ReceivableRow {
  id: string;
  trip_id: string;
  trip_code: string | null;
  amount: number | string;
  due_date: string | null;
  collected_status: "pending" | "partial" | "collected" | "overdue";
  aging_bucket: "0-7" | "8-15" | "16-30" | "30+";
  follow_up_status: string | null;
  follow_up_notes: string | null;
  collected_at: string | null;
  created_at: string;
  updated_at: string;
}

function toNumber(value: number | string | null | undefined): number {
  if (typeof value === "number") return value;
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
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

  const { data: rpcData, error: rpcError } = await actorResult.supabase.rpc("customer_receivables_v1", {
    p_actor: actorResult.actor.id,
    p_customer_id: customerId,
    p_limit: safeLimit,
    p_offset: safeOffset,
  } as never);

  if (rpcError) {
    if (isMissingRpcError(rpcError)) {
      return NextResponse.json(
        { ok: false, message: "Missing RPC: customer_receivables_v1" },
        { status: 500 },
      );
    }
    return mapCustomerRpcError(rpcError.message ?? "Unable to fetch customer receivables", rpcError.code);
  }

  const rows = (Array.isArray(rpcData) ? rpcData : []) as ReceivableRow[];

  return NextResponse.json({
    ok: true,
    data: rows.map((row) => ({
      id: row.id,
      tripId: row.trip_id,
      tripCode: row.trip_code,
      amount: toNumber(row.amount),
      dueDate: row.due_date,
      collectedStatus: row.collected_status,
      agingBucket: row.aging_bucket,
      followUpStatus: row.follow_up_status,
      followUpNotes: row.follow_up_notes,
      collectedAt: row.collected_at,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    })),
  });
}
