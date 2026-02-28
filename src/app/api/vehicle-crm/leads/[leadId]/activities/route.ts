import { NextResponse } from "next/server";
import { isMissingRpcError } from "@/lib/supabase/rpc";
import {
  isVehicleLeadActivityType,
  normalizeVehicleLeadActivityRow,
  requireVehicleCrmActor,
  type VehicleLeadActivityRow,
} from "@/app/api/vehicle-crm/_shared";

interface RouteParams {
  params: Promise<{ leadId: string }>;
}

interface AddActivityBody {
  type?: unknown;
  description?: unknown;
}

const DESCRIPTION_MAX_LENGTH = 500;

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

export async function GET(_: Request, context: RouteParams) {
  const actorResult = await requireVehicleCrmActor();
  if ("error" in actorResult) return actorResult.error;

  const { leadId } = await context.params;
  if (!leadId) {
    return NextResponse.json({ ok: false, message: "leadId is required" }, { status: 400 });
  }

  const { data: rpcData, error: rpcError } = await actorResult.supabase.rpc("vehicle_lead_list_activities_v1", {
    p_actor_user_id: actorResult.actor.id,
    p_lead_id: leadId,
  } as never);

  if (rpcError) {
    if (isMissingRpcError(rpcError)) {
      return NextResponse.json(
        { ok: false, message: "Missing RPC: vehicle_lead_list_activities_v1" },
        { status: 500 },
      );
    }
    return mapRpcError(rpcError.message ?? "Unable to fetch activities", rpcError.code);
  }

  const rows = Array.isArray(rpcData)
    ? (rpcData as VehicleLeadActivityRow[])
    : rpcData
      ? ([rpcData] as VehicleLeadActivityRow[])
      : [];

  return NextResponse.json({
    ok: true,
    data: rows.map((row) => normalizeVehicleLeadActivityRow(row)),
  });
}

export async function POST(request: Request, context: RouteParams) {
  const actorResult = await requireVehicleCrmActor();
  if ("error" in actorResult) return actorResult.error;

  const { leadId } = await context.params;
  if (!leadId) {
    return NextResponse.json({ ok: false, message: "leadId is required" }, { status: 400 });
  }

  const body = (await request.json().catch(() => null)) as AddActivityBody | null;
  const type = toTrimmedString(body?.type).toLowerCase();
  const description = toTrimmedString(body?.description);

  if (!type || !description) {
    return NextResponse.json({ ok: false, message: "type and description are required" }, { status: 400 });
  }
  if (description.length > DESCRIPTION_MAX_LENGTH) {
    return NextResponse.json(
      { ok: false, message: `description must be at most ${DESCRIPTION_MAX_LENGTH} characters` },
      { status: 400 },
    );
  }

  if (!isVehicleLeadActivityType(type)) {
    return NextResponse.json({ ok: false, message: "Invalid activity type" }, { status: 400 });
  }

  const { data: rpcData, error: rpcError } = await actorResult.supabase.rpc("vehicle_lead_add_activity_v1", {
    p_actor_user_id: actorResult.actor.id,
    p_lead_id: leadId,
    p_type: type,
    p_description: description,
  } as never);

  if (rpcError) {
    if (isMissingRpcError(rpcError)) {
      return NextResponse.json(
        { ok: false, message: "Missing RPC: vehicle_lead_add_activity_v1" },
        { status: 500 },
      );
    }
    return mapRpcError(rpcError.message ?? "Unable to add activity", rpcError.code);
  }

  const row = Array.isArray(rpcData)
    ? ((rpcData[0] ?? null) as VehicleLeadActivityRow | null)
    : ((rpcData ?? null) as VehicleLeadActivityRow | null);

  if (!row) {
    return NextResponse.json({ ok: false, message: "Unable to add activity" }, { status: 500 });
  }

  return NextResponse.json(
    {
      ok: true,
      data: normalizeVehicleLeadActivityRow(row),
    },
    { status: 201 },
  );
}
