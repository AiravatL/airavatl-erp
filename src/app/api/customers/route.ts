import { NextResponse } from "next/server";
import { isMissingRpcError } from "@/lib/supabase/rpc";
import { mapCustomerRpcError, requireCustomerActor } from "@/app/api/customers/_shared";

export const dynamic = "force-dynamic";

interface CustomerListRow {
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

function isUuid(value: string | null): value is string {
  if (!value) return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export async function GET(request: Request) {
  const actorResult = await requireCustomerActor("read");
  if ("error" in actorResult) return actorResult.error;

  const { searchParams } = new URL(request.url);
  const search = searchParams.get("search")?.trim() || null;
  const status = searchParams.get("status")?.trim() || null;
  const creditHealth = searchParams.get("creditHealth")?.trim() || null;
  const ownerIdRaw = searchParams.get("ownerId")?.trim() || null;
  const ownerId = isUuid(ownerIdRaw) ? ownerIdRaw : null;

  const limit = Number(searchParams.get("limit") ?? 200);
  const offset = Number(searchParams.get("offset") ?? 0);
  const safeLimit = Number.isFinite(limit) ? Math.max(1, Math.min(limit, 500)) : 200;
  const safeOffset = Number.isFinite(offset) ? Math.max(0, offset) : 0;

  const { data: rpcData, error: rpcError } = await actorResult.supabase.rpc("customer_list_v1", {
    p_actor: actorResult.actor.id,
    p_search: search,
    p_status: status,
    p_owner_id: ownerId,
    p_credit_health: creditHealth,
    p_limit: safeLimit,
    p_offset: safeOffset,
  } as never);

  if (rpcError) {
    if (isMissingRpcError(rpcError)) {
      return NextResponse.json({ ok: false, message: "Missing RPC: customer_list_v1" }, { status: 500 });
    }
    return mapCustomerRpcError(rpcError.message ?? "Unable to fetch customers", rpcError.code);
  }

  const rows = (Array.isArray(rpcData) ? rpcData : []) as CustomerListRow[];

  return NextResponse.json({
    ok: true,
    data: rows.map((row) => ({
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
    })),
  });
}
