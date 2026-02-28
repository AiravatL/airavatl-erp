import { NextResponse } from "next/server";
import type { Role } from "@/lib/types";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { isMissingRpcError } from "@/lib/supabase/rpc";

export const dynamic = "force-dynamic";

interface ProfileRow {
  id: string;
  full_name: string;
  email: string;
  role: Role;
  active: boolean;
}

function normalizeProfile(row: ProfileRow) {
  return {
    id: row.id,
    fullName: row.full_name,
    email: row.email,
    role: row.role,
    active: row.active,
  };
}

export async function GET() {
  const supabase = await getSupabaseServerClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError) {
    return NextResponse.json({ ok: false, message: userError.message }, { status: 401 });
  }

  if (!user) {
    return NextResponse.json({ ok: true, data: null });
  }

  const { data: rpcData, error: rpcError } = await supabase.rpc("auth_get_my_profile_v1");
  if (rpcError) {
    if (isMissingRpcError(rpcError)) {
      return NextResponse.json({ ok: false, message: "Missing RPC: auth_get_my_profile_v1" }, { status: 500 });
    }
    return NextResponse.json({ ok: false, message: rpcError.message }, { status: 500 });
  }

  if (Array.isArray(rpcData)) {
    const first = rpcData[0] as ProfileRow | undefined;
    return NextResponse.json({ ok: true, data: first ? normalizeProfile(first) : null });
  }

  return NextResponse.json({ ok: true, data: rpcData ? normalizeProfile(rpcData as ProfileRow) : null });
}
