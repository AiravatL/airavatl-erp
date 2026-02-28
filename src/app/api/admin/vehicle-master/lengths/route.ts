import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { isMissingRpcError } from "@/lib/supabase/rpc";

export const dynamic = "force-dynamic";

interface CreateLengthBody {
  vehicleTypeId?: unknown;
  lengthValue?: unknown;
  active?: unknown;
}

interface LengthRpcRow {
  id: string;
  vehicle_type_id: string;
  length_value: string;
  active: boolean;
}

function toRequiredString(value: unknown): string {
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

  const body = (await request.json().catch(() => null)) as CreateLengthBody | null;
  const vehicleTypeId = toRequiredString(body?.vehicleTypeId);
  const lengthValue = toRequiredString(body?.lengthValue);
  const active = typeof body?.active === "boolean" ? body.active : true;

  if (!vehicleTypeId || !lengthValue) {
    return NextResponse.json(
      { ok: false, message: "vehicleTypeId and lengthValue are required" },
      { status: 400 },
    );
  }

  const { data: rpcData, error: rpcError } = await supabase.rpc("vehicle_master_upsert_length_v1", {
    p_actor_user_id: user.id,
    p_type_id: vehicleTypeId,
    p_length_id: null,
    p_length_value: lengthValue,
    p_active: active,
  } as never);

  if (rpcError) {
    if (isMissingRpcError(rpcError)) {
      return NextResponse.json(
        { ok: false, message: "Missing RPC: vehicle_master_upsert_length_v1" },
        { status: 500 },
      );
    }

    const status =
      rpcError.code === "42501" ? 403 : rpcError.code === "22023" || rpcError.code === "23505" ? 400 : rpcError.code === "P0002" ? 404 : 500;
    return NextResponse.json(
      { ok: false, message: rpcError.message ?? "Unable to create vehicle length" },
      { status },
    );
  }

  const row = Array.isArray(rpcData)
    ? ((rpcData[0] ?? null) as LengthRpcRow | null)
    : ((rpcData ?? null) as LengthRpcRow | null);

  if (!row) {
    return NextResponse.json({ ok: false, message: "Unable to create vehicle length" }, { status: 500 });
  }

  return NextResponse.json(
    {
      ok: true,
      data: {
        id: row.id,
        vehicleTypeId: row.vehicle_type_id,
        lengthValue: row.length_value,
        active: row.active,
      },
    },
    { status: 201 },
  );
}
