import { NextResponse } from "next/server";
import { isMissingRpcError } from "@/lib/supabase/rpc";
import { mapCustomerRpcError, requireCustomerActor } from "@/app/api/customers/_shared";

export const dynamic = "force-dynamic";

interface RouteParams {
  params: Promise<{ customerId: string }>;
}

interface CustomerRow {
  id: string;
  name: string;
  address: string | null;
  gstin: string | null;
  credit_days: number | string;
  credit_limit: number | string;
  sales_owner_id: string | null;
  sales_owner_name: string | null;
  active: boolean;
  active_trips_count: number | string;
  outstanding_amount: number | string;
  last_activity_at: string | null;
  created_at: string;
  updated_at: string;
}

function toNumber(value: number | string | null | undefined): number {
  if (typeof value === "number") return value;
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

export async function GET(_: Request, context: RouteParams) {
  const actorResult = await requireCustomerActor("read");
  if ("error" in actorResult) return actorResult.error;

  const { customerId } = await context.params;
  if (!customerId) {
    return NextResponse.json({ ok: false, message: "customerId is required" }, { status: 400 });
  }

  const { data: rpcData, error: rpcError } = await actorResult.supabase.rpc("customer_get_v1", {
    p_actor: actorResult.actor.id,
    p_customer_id: customerId,
  } as never);

  if (rpcError) {
    if (isMissingRpcError(rpcError)) {
      return NextResponse.json({ ok: false, message: "Missing RPC: customer_get_v1" }, { status: 500 });
    }
    return mapCustomerRpcError(rpcError.message ?? "Unable to fetch customer", rpcError.code);
  }

  const row = Array.isArray(rpcData)
    ? ((rpcData[0] ?? null) as CustomerRow | null)
    : ((rpcData ?? null) as CustomerRow | null);

  if (!row) {
    return NextResponse.json({ ok: false, message: "Customer not found" }, { status: 404 });
  }

  return NextResponse.json({
    ok: true,
    data: {
      id: row.id,
      name: row.name,
      address: row.address,
      gstin: row.gstin,
      creditDays: toNumber(row.credit_days),
      creditLimit: toNumber(row.credit_limit),
      salesOwnerId: row.sales_owner_id,
      salesOwnerName: row.sales_owner_name,
      active: row.active,
      activeTripsCount: toNumber(row.active_trips_count),
      outstandingAmount: toNumber(row.outstanding_amount),
      lastActivityAt: row.last_activity_at,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    },
  });
}
