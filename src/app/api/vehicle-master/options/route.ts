import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { isMissingRpcError } from "@/lib/supabase/rpc";
import {
  normalizeVehicleMasterRows,
  type VehicleMasterRpcRow,
} from "@/app/api/vehicle-master/_shared";

export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = await getSupabaseServerClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return NextResponse.json({ ok: false, message: "Unauthorized" }, { status: 401 });
  }

  const { data: rpcData, error: rpcError } = await supabase.rpc("vehicle_master_list_v1", {
    p_actor_user_id: user.id,
    p_include_inactive: false,
  } as never);

  if (rpcError) {
    if (isMissingRpcError(rpcError)) {
      return NextResponse.json(
        { ok: false, message: "Missing RPC: vehicle_master_list_v1" },
        { status: 500 },
      );
    }

    const status = rpcError.code === "42501" ? 403 : 500;
    return NextResponse.json(
      { ok: false, message: rpcError.message ?? "Unable to fetch vehicle master options" },
      { status },
    );
  }

  const rows = Array.isArray(rpcData) ? (rpcData as VehicleMasterRpcRow[]) : [];

  return NextResponse.json({
    ok: true,
    data: normalizeVehicleMasterRows(rows),
  });
}
