import { NextResponse } from "next/server";
import { isMissingRpcError } from "@/lib/supabase/rpc";
import { mapRpcError, requireConsignerCrmActor } from "@/app/api/consigner-crm/_shared";

interface RouteParams {
  params: Promise<{ leadId: string }>;
}

interface WinConvertBody {
  creditDays?: unknown;
  creditLimit?: unknown;
  address?: unknown;
  gstin?: unknown;
}

const ADDRESS_MAX_LENGTH = 250;
const GSTIN_MAX_LENGTH = 15;
const CREDIT_DAYS_MAX = 999;
const CREDIT_LIMIT_MAX = 1_000_000_000_000;

export async function POST(request: Request, context: RouteParams) {
  const actorResult = await requireConsignerCrmActor();
  if ("error" in actorResult) return actorResult.error;

  const { leadId } = await context.params;
  if (!leadId) {
    return NextResponse.json({ ok: false, message: "leadId is required" }, { status: 400 });
  }

  const body = (await request.json().catch(() => null)) as WinConvertBody | null;
  const creditDays = typeof body?.creditDays === "number" ? body.creditDays : 30;
  const creditLimit = typeof body?.creditLimit === "number" ? body.creditLimit : 0;
  const address = typeof body?.address === "string" ? body.address.trim() : null;
  const gstin = typeof body?.gstin === "string" ? body.gstin.trim() : null;

  if (!Number.isFinite(creditDays) || creditDays < 0 || creditDays > CREDIT_DAYS_MAX) {
    return NextResponse.json(
      { ok: false, message: `creditDays must be between 0 and ${CREDIT_DAYS_MAX}` },
      { status: 400 },
    );
  }
  if (!Number.isFinite(creditLimit) || creditLimit < 0 || creditLimit > CREDIT_LIMIT_MAX) {
    return NextResponse.json(
      { ok: false, message: "creditLimit is out of range" },
      { status: 400 },
    );
  }
  if (address && address.length > ADDRESS_MAX_LENGTH) {
    return NextResponse.json(
      { ok: false, message: `address must be at most ${ADDRESS_MAX_LENGTH} characters` },
      { status: 400 },
    );
  }
  if (gstin && gstin.length > GSTIN_MAX_LENGTH) {
    return NextResponse.json(
      { ok: false, message: `gstin must be at most ${GSTIN_MAX_LENGTH} characters` },
      { status: 400 },
    );
  }

  const { data: rpcData, error: rpcError } = await actorResult.supabase.rpc(
    "consigner_lead_win_convert_v1",
    {
      p_actor: actorResult.actor.id,
      p_lead_id: leadId,
      p_credit_days: creditDays,
      p_credit_limit: creditLimit,
      p_address: address,
      p_gstin: gstin,
    } as never,
  );

  if (rpcError) {
    if (isMissingRpcError(rpcError)) {
      return NextResponse.json(
        { ok: false, message: "Missing RPC: consigner_lead_win_convert_v1" },
        { status: 500 },
      );
    }
    return mapRpcError(rpcError.message ?? "Unable to convert lead", rpcError.code);
  }

  const row = rpcData as { lead_id: string; customer_id: string; customer_name: string } | null;
  if (!row) {
    return NextResponse.json({ ok: false, message: "Unable to convert lead" }, { status: 500 });
  }

  return NextResponse.json(
    {
      ok: true,
      data: {
        leadId: row.lead_id,
        customerId: row.customer_id,
        customerName: row.customer_name,
      },
    },
    { status: 201 },
  );
}
