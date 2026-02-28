import { NextResponse } from "next/server";
import { isMissingRpcError } from "@/lib/supabase/rpc";
import { mapRpcError, requireConsignerCrmActor } from "@/app/api/consigner-crm/_shared";

interface RouteParams {
  params: Promise<{ leadId: string }>;
}

interface ConvertBody {
  creditDays?: unknown;
  creditLimit?: unknown;
  address?: unknown;
  gstin?: unknown;
}

export async function POST(request: Request, context: RouteParams) {
  const actorResult = await requireConsignerCrmActor();
  if ("error" in actorResult) return actorResult.error;

  const { leadId } = await context.params;
  if (!leadId) {
    return NextResponse.json({ ok: false, message: "leadId is required" }, { status: 400 });
  }

  const body = (await request.json().catch(() => null)) as ConvertBody | null;
  const creditDays = typeof body?.creditDays === "number" ? body.creditDays : 30;
  const creditLimit = typeof body?.creditLimit === "number" ? body.creditLimit : 0;
  const address = typeof body?.address === "string" ? body.address.trim() : null;
  const gstin = typeof body?.gstin === "string" ? body.gstin.trim() : null;

  const { data: rpcData, error: rpcError } = await actorResult.supabase.rpc("consigner_lead_convert_v1", {
    p_actor: actorResult.actor.id,
    p_lead_id: leadId,
    p_credit_days: creditDays,
    p_credit_limit: creditLimit,
    p_address: address,
    p_gstin: gstin,
  } as never);

  if (rpcError) {
    if (isMissingRpcError(rpcError)) {
      return NextResponse.json(
        { ok: false, message: "Missing RPC: consigner_lead_convert_v1" },
        { status: 500 },
      );
    }
    return mapRpcError(rpcError.message ?? "Unable to convert lead", rpcError.code);
  }

  const row = Array.isArray(rpcData)
    ? ((rpcData[0] ?? null) as { customer_id: string; customer_name: string } | null)
    : ((rpcData ?? null) as { customer_id: string; customer_name: string } | null);

  if (!row) {
    return NextResponse.json({ ok: false, message: "Unable to convert lead" }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    data: { customerId: row.customer_id, customerName: row.customer_name },
  }, { status: 201 });
}
