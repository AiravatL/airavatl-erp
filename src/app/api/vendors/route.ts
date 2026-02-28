import { NextResponse } from "next/server";
import { isMissingRpcError } from "@/lib/supabase/rpc";
import { getSupabaseServerClient } from "@/lib/supabase/server";

interface VendorRow {
  id: string;
  name: string;
  contact_phone: string | null;
  kyc_status: string;
}

export async function GET(request: Request) {
  const supabase = await getSupabaseServerClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return NextResponse.json({ ok: false, message: "Unauthorized" }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, role, active")
    .eq("id", user.id)
    .single();

  if (!profile || !profile.active) {
    return NextResponse.json({ ok: false, message: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const search = searchParams.get("search")?.trim() || null;
  const limit = Number(searchParams.get("limit") ?? 100);
  const offset = Number(searchParams.get("offset") ?? 0);
  const safeLimit = Number.isFinite(limit) ? Math.max(1, Math.min(limit, 500)) : 100;
  const safeOffset = Number.isFinite(offset) ? Math.max(0, offset) : 0;

  const { data: rpcData, error: rpcError } = await supabase.rpc("vendor_list_v1", {
    p_actor: profile.id,
    p_search: search,
    p_limit: safeLimit,
    p_offset: safeOffset,
  } as never);

  if (rpcError) {
    if (isMissingRpcError(rpcError)) {
      return NextResponse.json({ ok: false, message: "Missing RPC: vendor_list_v1" }, { status: 500 });
    }
    return NextResponse.json({ ok: false, message: rpcError.message ?? "Unable to fetch vendors" }, { status: 500 });
  }

  const rows = (Array.isArray(rpcData) ? rpcData : []) as VendorRow[];
  return NextResponse.json({
    ok: true,
    data: rows.map((r) => ({
      id: r.id,
      name: r.name,
      contactPhone: r.contact_phone,
      kycStatus: r.kyc_status,
    })),
  });
}
