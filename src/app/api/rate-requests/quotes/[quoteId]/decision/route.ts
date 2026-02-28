import { NextResponse } from "next/server";
import {
  mapRateRequestRpcError,
  normalizeRateRequestQuoteRow,
  RATE_REQUEST_REVIEW_ROLES,
  requireRateRequestActor,
  type RateRequestQuoteRow,
} from "@/app/api/rate-requests/_shared";

interface RouteParams {
  params: Promise<{ quoteId: string }>;
}

interface DecisionBody {
  action?: unknown;
  reviewRemarks?: unknown;
}

const MAX_REVIEW_REMARKS = 500;

function toTrimmed(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export async function POST(request: Request, context: RouteParams) {
  const actorResult = await requireRateRequestActor(RATE_REQUEST_REVIEW_ROLES);
  if ("error" in actorResult) return actorResult.error;

  const { quoteId } = await context.params;
  if (!quoteId) {
    return NextResponse.json({ ok: false, message: "Missing quoteId" }, { status: 400 });
  }

  const body = (await request.json().catch(() => null)) as DecisionBody | null;
  const action = toTrimmed(body?.action).toLowerCase();
  const reviewRemarks = toTrimmed(body?.reviewRemarks);

  if (action !== "approve" && action !== "reject") {
    return NextResponse.json({ ok: false, message: "action must be approve or reject" }, { status: 400 });
  }

  if (action === "reject" && !reviewRemarks) {
    return NextResponse.json({ ok: false, message: "reviewRemarks is required for rejection" }, { status: 400 });
  }

  if (reviewRemarks.length > MAX_REVIEW_REMARKS) {
    return NextResponse.json({ ok: false, message: "reviewRemarks is too long" }, { status: 400 });
  }

  const { data: rpcData, error: rpcError } = await actorResult.supabase.rpc("rate_request_quote_decide_v1", {
    p_quote_id: quoteId,
    p_action: action,
    p_review_remarks: reviewRemarks || null,
    p_actor_user_id: actorResult.actor.id,
  } as never);

  if (rpcError) {
    return mapRateRequestRpcError(rpcError.message ?? "Unable to review quote", rpcError.code);
  }

  const row = (Array.isArray(rpcData) ? rpcData[0] : rpcData) as RateRequestQuoteRow | undefined;
  if (!row) {
    return NextResponse.json({ ok: false, message: "Unable to review quote" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, data: normalizeRateRequestQuoteRow(row) });
}
