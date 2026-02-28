import { NextResponse } from "next/server";
import { isMissingRpcError } from "@/lib/supabase/rpc";
import {
  isLeadActivityType,
  mapRpcError,
  normalizeConsignerLeadActivityRow,
  requireConsignerCrmActor,
  type ConsignerLeadActivityRow,
} from "@/app/api/consigner-crm/_shared";

interface RouteParams {
  params: Promise<{ leadId: string }>;
}

export async function GET(_: Request, context: RouteParams) {
  const actorResult = await requireConsignerCrmActor();
  if ("error" in actorResult) return actorResult.error;

  const { leadId } = await context.params;
  if (!leadId) {
    return NextResponse.json({ ok: false, message: "leadId is required" }, { status: 400 });
  }

  const { data: rpcData, error: rpcError } = await actorResult.supabase.rpc(
    "consigner_lead_list_activities_v1",
    {
      p_actor: actorResult.actor.id,
      p_lead_id: leadId,
    } as never,
  );

  if (rpcError) {
    if (isMissingRpcError(rpcError)) {
      return NextResponse.json(
        { ok: false, message: "Missing RPC: consigner_lead_list_activities_v1" },
        { status: 500 },
      );
    }
    return mapRpcError(rpcError.message ?? "Unable to fetch activities", rpcError.code);
  }

  const rows = (Array.isArray(rpcData) ? rpcData : []) as ConsignerLeadActivityRow[];
  return NextResponse.json({ ok: true, data: rows.map(normalizeConsignerLeadActivityRow) });
}

interface AddActivityBody {
  type?: unknown;
  description?: unknown;
}

const DESCRIPTION_MAX_LENGTH = 500;

export async function POST(request: Request, context: RouteParams) {
  const actorResult = await requireConsignerCrmActor();
  if ("error" in actorResult) return actorResult.error;

  const { leadId } = await context.params;
  if (!leadId) {
    return NextResponse.json({ ok: false, message: "leadId is required" }, { status: 400 });
  }

  const body = (await request.json().catch(() => null)) as AddActivityBody | null;
  const typeRaw = typeof body?.type === "string" ? body.type.trim() : "";
  const description = typeof body?.description === "string" ? body.description.trim() : "";

  if (!typeRaw || !isLeadActivityType(typeRaw)) {
    return NextResponse.json({ ok: false, message: "Invalid activity type" }, { status: 400 });
  }
  if (!description) {
    return NextResponse.json({ ok: false, message: "Description is required" }, { status: 400 });
  }
  if (description.length > DESCRIPTION_MAX_LENGTH) {
    return NextResponse.json(
      { ok: false, message: `Description must be at most ${DESCRIPTION_MAX_LENGTH} characters` },
      { status: 400 },
    );
  }

  const { data: rpcData, error: rpcError } = await actorResult.supabase.rpc(
    "consigner_lead_add_activity_v1",
    {
      p_actor: actorResult.actor.id,
      p_lead_id: leadId,
      p_type: typeRaw,
      p_description: description,
    } as never,
  );

  if (rpcError) {
    if (isMissingRpcError(rpcError)) {
      return NextResponse.json(
        { ok: false, message: "Missing RPC: consigner_lead_add_activity_v1" },
        { status: 500 },
      );
    }
    return mapRpcError(rpcError.message ?? "Unable to add activity", rpcError.code);
  }

  const row = Array.isArray(rpcData)
    ? ((rpcData[0] ?? null) as ConsignerLeadActivityRow | null)
    : ((rpcData ?? null) as ConsignerLeadActivityRow | null);

  if (!row) {
    return NextResponse.json({ ok: false, message: "Unable to add activity" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, data: normalizeConsignerLeadActivityRow(row) }, { status: 201 });
}
