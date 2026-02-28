import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { isMissingRpcError } from "@/lib/supabase/rpc";

export const dynamic = "force-dynamic";

interface RouteParams {
  params: Promise<{ lengthId: string }>;
}

interface UpdateLengthBody {
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

function toOptionalTrimmedString(value: unknown): string | null {
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

  const { lengthId } = await context.params;
  if (!lengthId) {
    return NextResponse.json({ ok: false, message: "lengthId is required" }, { status: 400 });
  }

  const body = (await request.json().catch(() => null)) as UpdateLengthBody | null;
  const hasActive = typeof body?.active === "boolean";
  const hasVehicleTypeId = Object.prototype.hasOwnProperty.call(body ?? {}, "vehicleTypeId");
  const hasLengthValue = Object.prototype.hasOwnProperty.call(body ?? {}, "lengthValue");
  const vehicleTypeId = toOptionalTrimmedString(body?.vehicleTypeId);
  const lengthValue = toOptionalTrimmedString(body?.lengthValue);

  if (!hasActive && !hasVehicleTypeId && !hasLengthValue) {
    return NextResponse.json({ ok: false, message: "No changes provided" }, { status: 400 });
  }

  if ((hasVehicleTypeId && !vehicleTypeId) || (hasLengthValue && !lengthValue)) {
    return NextResponse.json(
      { ok: false, message: "vehicleTypeId and lengthValue cannot be empty" },
      { status: 400 },
    );
  }

  if ((hasVehicleTypeId && !hasLengthValue) || (!hasVehicleTypeId && hasLengthValue)) {
    return NextResponse.json(
      { ok: false, message: "vehicleTypeId and lengthValue must be provided together for edit" },
      { status: 400 },
    );
  }

  const { data: rpcData, error: rpcError } =
    hasVehicleTypeId && hasLengthValue
      ? await supabase.rpc("vehicle_master_upsert_length_v1", {
          p_actor_user_id: user.id,
          p_type_id: vehicleTypeId,
          p_length_id: lengthId,
          p_length_value: lengthValue,
          p_active: hasActive ? body?.active : null,
        } as never)
      : await supabase.rpc("vehicle_master_set_length_active_v1", {
          p_actor_user_id: user.id,
          p_length_id: lengthId,
          p_active: body?.active,
        } as never);

  if (rpcError) {
    if (isMissingRpcError(rpcError)) {
      const rpcName =
        hasVehicleTypeId && hasLengthValue
          ? "vehicle_master_upsert_length_v1"
          : "vehicle_master_set_length_active_v1";
      return NextResponse.json({ ok: false, message: `Missing RPC: ${rpcName}` }, { status: 500 });
    }

    const status =
      rpcError.code === "42501" ? 403 : rpcError.code === "22023" || rpcError.code === "23505" ? 400 : rpcError.code === "P0002" ? 404 : 500;
    return NextResponse.json(
      { ok: false, message: rpcError.message ?? "Unable to update vehicle length" },
      { status },
    );
  }

  const row = Array.isArray(rpcData)
    ? ((rpcData[0] ?? null) as LengthRpcRow | null)
    : ((rpcData ?? null) as LengthRpcRow | null);

  if (!row) {
    return NextResponse.json({ ok: false, message: "Unable to update vehicle length" }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    data: {
      id: row.id,
      vehicleTypeId: row.vehicle_type_id,
      lengthValue: row.length_value,
      active: row.active,
    },
  });
}
