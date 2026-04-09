import { NextResponse } from "next/server";
import { isMissingRpcError } from "@/lib/supabase/rpc";
import { mapRpcError, requireVerificationActor } from "@/app/api/verification/_shared";

type PendingKind = "individual_driver" | "transporter" | "employee_driver" | "vehicle";

interface PendingRow {
  kind: PendingKind;
  id: string;
  title: string;
  subtitle: string | null;
  parent_title: string | null;
  city: string | null;
  created_at: string;
}

interface RpcResult {
  total: number;
  individual_driver_count: number;
  transporter_count: number;
  employee_driver_count: number;
  vehicle_count: number;
  items: PendingRow[];
}

export async function GET(request: Request) {
  const actorResult = await requireVerificationActor();
  if ("error" in actorResult) return actorResult.error;

  const { searchParams } = new URL(request.url);
  const kind = searchParams.get("userType")?.trim() || null;
  const search = searchParams.get("search")?.trim() || null;
  const limit = Number(searchParams.get("limit") ?? 50);
  const offset = Number(searchParams.get("offset") ?? 0);
  const safeLimit = Number.isFinite(limit) ? Math.max(1, Math.min(limit, 200)) : 50;
  const safeOffset = Number.isFinite(offset) ? Math.max(0, offset) : 0;

  const { data: rpcData, error: rpcError } = await actorResult.supabase.rpc(
    "verification_list_pending_v1",
    {
      p_actor_user_id: actorResult.actor.id,
      p_user_type: kind,
      p_search: search,
      p_limit: safeLimit,
      p_offset: safeOffset,
    } as never,
  );

  if (rpcError) {
    if (isMissingRpcError(rpcError)) {
      return NextResponse.json(
        { ok: false, message: "Missing RPC: verification_list_pending_v1" },
        { status: 500 },
      );
    }
    return mapRpcError(rpcError.message ?? "Unable to fetch pending verifications", rpcError.code);
  }

  const result = (rpcData ?? null) as RpcResult | null;
  const items = Array.isArray(result?.items) ? result!.items : [];

  return NextResponse.json({
    ok: true,
    data: {
      total: result?.total ?? items.length,
      individualDriverCount: result?.individual_driver_count ?? 0,
      transporterCount: result?.transporter_count ?? 0,
      employeeDriverCount: result?.employee_driver_count ?? 0,
      vehicleCount: result?.vehicle_count ?? 0,
      items: items.map((row) => ({
        kind: row.kind,
        id: row.id,
        title: row.title,
        subtitle: row.subtitle ?? null,
        parentTitle: row.parent_title ?? null,
        city: row.city ?? null,
        createdAt: row.created_at,
      })),
    },
  });
}
