import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { isMissingRpcError } from "@/lib/supabase/rpc";

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
      return NextResponse.json({ ok: false, message: "Missing RPC: vehicle_master_list_v1" }, { status: 500 });
    }
    return NextResponse.json({ ok: false, message: rpcError.message ?? "Unable to fetch vehicle options" }, { status: 500 });
  }

  const result = (rpcData ?? { vehicles: [], segments: [] }) as { vehicles: unknown[]; segments: unknown[] };
  return NextResponse.json({ ok: true, data: result });
}
