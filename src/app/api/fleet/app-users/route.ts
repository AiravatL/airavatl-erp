import { NextResponse } from "next/server";
import { requireServerActor } from "@/lib/auth/server-actor";
import { isMissingRpcError } from "@/lib/supabase/rpc";

const ALLOWED_ROLES = ["super_admin", "admin", "operations", "sales_vehicles"] as const;

interface RpcItem {
  id: string;
  user_type: string;
  full_name: string;
  phone: string;
  email: string | null;
  city: string | null;
  state: string | null;
  is_verified: boolean;
  is_active: boolean;
  is_blocked: boolean;
  created_at: string;
  account_id: string | null;
  account_name: string | null;
  documents_verified: boolean | null;
  vehicle_number: string | null;
  vehicle_type: string | null;
}

interface RpcResult {
  total: number;
  items: RpcItem[];
}

export async function GET(request: Request) {
  const actorResult = await requireServerActor(ALLOWED_ROLES);
  if ("error" in actorResult) return actorResult.error;

  const { searchParams } = new URL(request.url);
  const userType = searchParams.get("userType")?.trim() || null;
  const search = searchParams.get("search")?.trim() || null;
  const isBlocked = searchParams.get("isBlocked");
  const isVerified = searchParams.get("isVerified");
  const limit = Number(searchParams.get("limit") ?? 50);
  const offset = Number(searchParams.get("offset") ?? 0);
  const safeLimit = Number.isFinite(limit) ? Math.max(1, Math.min(limit, 200)) : 50;
  const safeOffset = Number.isFinite(offset) ? Math.max(0, offset) : 0;

  const { data: rpcData, error: rpcError } = await actorResult.supabase.rpc(
    "admin_list_app_users_v2",
    {
      p_actor_user_id: actorResult.actor.id,
      p_user_type: userType,
      p_search: search,
      p_is_blocked: isBlocked === "true" ? true : isBlocked === "false" ? false : null,
      p_is_verified: isVerified === "true" ? true : isVerified === "false" ? false : null,
      p_limit: safeLimit,
      p_offset: safeOffset,
    } as never,
  );

  if (rpcError) {
    if (isMissingRpcError(rpcError)) {
      return NextResponse.json(
        { ok: false, message: "Missing RPC: admin_list_app_users_v2" },
        { status: 500 },
      );
    }
    return NextResponse.json(
      { ok: false, message: rpcError.message ?? "Unable to fetch app users" },
      { status: 500 },
    );
  }

  const result = (rpcData ?? null) as RpcResult | null;
  const items: RpcItem[] = Array.isArray(result?.items) ? result.items : [];
  const total = result?.total ?? items.length;

  return NextResponse.json({
    ok: true,
    data: {
      total,
      items: items.map((row) => ({
        id: row.id,
        userType: row.user_type,
        fullName: row.full_name,
        phone: row.phone,
        email: row.email,
        city: row.city,
        state: row.state,
        isVerified: row.is_verified,
        isActive: row.is_active,
        isBlocked: row.is_blocked,
        createdAt: row.created_at,
        accountId: row.account_id,
        accountName: row.account_name,
        documentsVerified: row.documents_verified,
        vehicleNumber: row.vehicle_number ?? null,
        vehicleType: row.vehicle_type ?? null,
      })),
    },
  });
}
