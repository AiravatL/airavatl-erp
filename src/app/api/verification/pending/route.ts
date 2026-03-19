import { NextResponse } from "next/server";
import { isMissingRpcError } from "@/lib/supabase/rpc";
import { mapRpcError, requireVerificationActor } from "@/app/api/verification/_shared";

interface PendingRow {
  user_id: string;
  full_name: string;
  phone: string;
  user_type: string;
  city: string | null;
  state: string | null;
  created_at: string;
}

interface RpcResult {
  total: number;
  driver_count: number;
  transporter_count: number;
  items: PendingRow[];
}

export async function GET(request: Request) {
  const actorResult = await requireVerificationActor();
  if ("error" in actorResult) return actorResult.error;

  const { searchParams } = new URL(request.url);
  const userType = searchParams.get("userType")?.trim() || null;
  const search = searchParams.get("search")?.trim() || null;
  const limit = Number(searchParams.get("limit") ?? 50);
  const offset = Number(searchParams.get("offset") ?? 0);
  const safeLimit = Number.isFinite(limit) ? Math.max(1, Math.min(limit, 200)) : 50;
  const safeOffset = Number.isFinite(offset) ? Math.max(0, offset) : 0;

  const { data: rpcData, error: rpcError } = await actorResult.supabase.rpc(
    "verification_list_pending_v1",
    {
      p_actor_user_id: actorResult.actor.id,
      p_user_type: userType,
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
  const items = Array.isArray(result?.items) ? result.items : (Array.isArray(rpcData) ? rpcData as PendingRow[] : []);
  const total = result?.total ?? items.length;
  const driverCount = result?.driver_count ?? items.filter((i) => i.user_type === "individual_driver").length;
  const transporterCount = result?.transporter_count ?? items.filter((i) => i.user_type === "transporter").length;

  return NextResponse.json({
    ok: true,
    data: {
      total,
      driverCount,
      transporterCount,
      items: items.map((row) => ({
        userId: row.user_id,
        fullName: row.full_name,
        phone: row.phone,
        userType: row.user_type,
        city: row.city ?? null,
        state: row.state ?? null,
        createdAt: row.created_at,
      })),
    },
  });
}
