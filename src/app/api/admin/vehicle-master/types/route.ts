import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { isMissingRpcError } from "@/lib/supabase/rpc";

export const dynamic = "force-dynamic";

interface CreateTypeBody {
  name?: unknown;
  active?: unknown;
}

interface TypeRpcRow {
  id: string;
  name: string;
  active: boolean;
}

function toRequiredName(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.trim();
}

export async function POST(request: Request) {
  const supabase = await getSupabaseServerClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return NextResponse.json({ ok: false, message: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as CreateTypeBody | null;
  const name = toRequiredName(body?.name);
  const active = typeof body?.active === "boolean" ? body.active : true;

  if (!name) {
    return NextResponse.json({ ok: false, message: "name is required" }, { status: 400 });
  }

  const { data: rpcData, error: rpcError } = await supabase.rpc("vehicle_master_upsert_type_v1", {
    p_actor_user_id: user.id,
    p_type_id: null,
    p_name: name,
    p_active: active,
  } as never);

  if (rpcError) {
    if (isMissingRpcError(rpcError)) {
      return NextResponse.json(
        { ok: false, message: "Missing RPC: vehicle_master_upsert_type_v1" },
        { status: 500 },
      );
    }

    const status =
      rpcError.code === "42501" ? 403 : rpcError.code === "22023" || rpcError.code === "23505" ? 400 : 500;
    return NextResponse.json(
      { ok: false, message: rpcError.message ?? "Unable to create vehicle type" },
      { status },
    );
  }

  const row = Array.isArray(rpcData)
    ? ((rpcData[0] ?? null) as TypeRpcRow | null)
    : ((rpcData ?? null) as TypeRpcRow | null);

  if (!row) {
    return NextResponse.json({ ok: false, message: "Unable to create vehicle type" }, { status: 500 });
  }

  return NextResponse.json(
    {
      ok: true,
      data: {
        id: row.id,
        name: row.name,
        active: row.active,
      },
    },
    { status: 201 },
  );
}
