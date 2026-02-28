import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { isMissingRpcError } from "@/lib/supabase/rpc";

export const dynamic = "force-dynamic";

interface RouteParams {
  params: Promise<{ typeId: string }>;
}

interface UpdateTypeBody {
  name?: unknown;
  active?: unknown;
  applyToLengths?: unknown;
}

interface TypeRpcRow {
  id: string;
  name: string;
  active: boolean;
}

function toOptionalName(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export async function PATCH(request: Request, context: RouteParams) {
  const supabase = await getSupabaseServerClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return NextResponse.json({ ok: false, message: "Unauthorized" }, { status: 401 });
  }

  const { typeId } = await context.params;
  if (!typeId) {
    return NextResponse.json({ ok: false, message: "typeId is required" }, { status: 400 });
  }

  const body = (await request.json().catch(() => null)) as UpdateTypeBody | null;
  const name = toOptionalName(body?.name);
  const hasName = Object.prototype.hasOwnProperty.call(body ?? {}, "name");
  const hasActive = typeof body?.active === "boolean";
  const active = hasActive ? body.active : undefined;
  const applyToLengths = typeof body?.applyToLengths === "boolean" ? body.applyToLengths : true;

  if (!hasName && !hasActive) {
    return NextResponse.json({ ok: false, message: "No changes provided" }, { status: 400 });
  }

  if (hasName && !name) {
    return NextResponse.json({ ok: false, message: "name cannot be empty" }, { status: 400 });
  }

  const { data: rpcData, error: rpcError } = hasName
    ? await supabase.rpc("vehicle_master_upsert_type_v1", {
        p_actor_user_id: user.id,
        p_type_id: typeId,
        p_name: name,
        p_active: hasActive ? active : null,
      } as never)
    : await supabase.rpc("vehicle_master_set_type_active_v1", {
        p_actor_user_id: user.id,
        p_type_id: typeId,
        p_active: active,
        p_apply_to_lengths: applyToLengths,
      } as never);

  if (rpcError) {
    if (isMissingRpcError(rpcError)) {
      const rpcName = hasName ? "vehicle_master_upsert_type_v1" : "vehicle_master_set_type_active_v1";
      return NextResponse.json({ ok: false, message: `Missing RPC: ${rpcName}` }, { status: 500 });
    }

    const status =
      rpcError.code === "42501" ? 403 : rpcError.code === "22023" || rpcError.code === "23505" ? 400 : rpcError.code === "P0002" ? 404 : 500;
    return NextResponse.json(
      { ok: false, message: rpcError.message ?? "Unable to update vehicle type" },
      { status },
    );
  }

  const row = Array.isArray(rpcData)
    ? ((rpcData[0] ?? null) as TypeRpcRow | null)
    : ((rpcData ?? null) as TypeRpcRow | null);

  if (!row) {
    return NextResponse.json({ ok: false, message: "Unable to update vehicle type" }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    data: {
      id: row.id,
      name: row.name,
      active: row.active,
    },
  });
}
