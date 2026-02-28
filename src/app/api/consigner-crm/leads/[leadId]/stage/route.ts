import { NextResponse } from "next/server";
import { isMissingRpcError } from "@/lib/supabase/rpc";
import {
  isLeadStage,
  mapRpcError,
  normalizeConsignerLeadRow,
  requireConsignerCrmActor,
  type ConsignerLeadRow,
} from "@/app/api/consigner-crm/_shared";

interface RouteParams {
  params: Promise<{ leadId: string }>;
}

interface MoveStageBody {
  toStage?: unknown;
  note?: unknown;
}

export async function POST(request: Request, context: RouteParams) {
  const actorResult = await requireConsignerCrmActor();
  if ("error" in actorResult) return actorResult.error;

  const { leadId } = await context.params;
  if (!leadId) {
    return NextResponse.json({ ok: false, message: "leadId is required" }, { status: 400 });
  }

  const body = (await request.json().catch(() => null)) as MoveStageBody | null;
  const toStageRaw = typeof body?.toStage === "string" ? body.toStage.trim().toLowerCase() : "";
  const note = typeof body?.note === "string" ? body.note.trim() : "";

  if (!toStageRaw || !isLeadStage(toStageRaw)) {
    return NextResponse.json({ ok: false, message: "Invalid toStage value" }, { status: 400 });
  }

  const { data: rpcData, error: rpcError } = await actorResult.supabase.rpc("consigner_lead_move_stage_v1", {
    p_actor: actorResult.actor.id,
    p_lead_id: leadId,
    p_to_stage: toStageRaw,
    p_note: note || null,
  } as never);

  if (rpcError) {
    if (isMissingRpcError(rpcError)) {
      return NextResponse.json({ ok: false, message: "Missing RPC: consigner_lead_move_stage_v1" }, { status: 500 });
    }
    return mapRpcError(rpcError.message ?? "Unable to move lead stage", rpcError.code);
  }

  const row = Array.isArray(rpcData)
    ? ((rpcData[0] ?? null) as ConsignerLeadRow | null)
    : ((rpcData ?? null) as ConsignerLeadRow | null);

  if (!row) {
    return NextResponse.json({ ok: false, message: "Unable to move lead stage" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, data: normalizeConsignerLeadRow(row) });
}
