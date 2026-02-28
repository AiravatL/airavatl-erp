import { NextResponse } from "next/server";
import { isMissingRpcError } from "@/lib/supabase/rpc";
import {
  isVehicleLeadStage,
  normalizeVehicleLeadRow,
  requireVehicleCrmActor,
  type VehicleLeadRow,
} from "@/app/api/vehicle-crm/_shared";

interface RouteParams {
  params: Promise<{ leadId: string }>;
}

interface MoveStageBody {
  toStage?: unknown;
  note?: unknown;
}

function toTrimmedString(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.trim();
}

function mapRpcError(message: string, code?: string) {
  if (code === "P0002") return NextResponse.json({ ok: false, message }, { status: 404 });
  if (code === "22023") return NextResponse.json({ ok: false, message }, { status: 400 });
  if (code === "42501") return NextResponse.json({ ok: false, message }, { status: 403 });
  return NextResponse.json({ ok: false, message }, { status: 500 });
}

export async function POST(request: Request, context: RouteParams) {
  const actorResult = await requireVehicleCrmActor();
  if ("error" in actorResult) return actorResult.error;

  const { leadId } = await context.params;
  if (!leadId) {
    return NextResponse.json({ ok: false, message: "leadId is required" }, { status: 400 });
  }

  const body = (await request.json().catch(() => null)) as MoveStageBody | null;
  const toStage = toTrimmedString(body?.toStage).toLowerCase();
  const note = toTrimmedString(body?.note);

  if (!toStage || !isVehicleLeadStage(toStage)) {
    return NextResponse.json({ ok: false, message: "Invalid toStage value" }, { status: 400 });
  }

  const { data: rpcData, error: rpcError } = await actorResult.supabase.rpc("vehicle_lead_move_stage_v1", {
    p_actor_user_id: actorResult.actor.id,
    p_lead_id: leadId,
    p_to_stage: toStage,
    p_note: note || null,
  } as never);

  if (rpcError) {
    if (isMissingRpcError(rpcError)) {
      return NextResponse.json(
        { ok: false, message: "Missing RPC: vehicle_lead_move_stage_v1" },
        { status: 500 },
      );
    }
    return mapRpcError(rpcError.message ?? "Unable to move lead stage", rpcError.code);
  }

  const row = Array.isArray(rpcData)
    ? ((rpcData[0] ?? null) as VehicleLeadRow | null)
    : ((rpcData ?? null) as VehicleLeadRow | null);

  if (!row) {
    return NextResponse.json({ ok: false, message: "Unable to move lead stage" }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    data: normalizeVehicleLeadRow(row),
  });
}
