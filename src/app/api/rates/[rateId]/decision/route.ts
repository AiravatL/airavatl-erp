import { NextResponse } from "next/server";
import {
  RATE_REVIEWER_ROLES,
  type RateRow,
  normalizeRateRow,
  requireRateActor,
} from "@/app/api/rates/_shared";

export const dynamic = "force-dynamic";

interface RouteParams {
  params: Promise<{ rateId: string }>;
}

interface DecisionBody {
  action?: unknown;
  reviewRemarks?: unknown;
}

function mapRpcError(message: string, code?: string) {
  if (code === "42501") return NextResponse.json({ ok: false, message }, { status: 403 });
  if (code === "P0002") return NextResponse.json({ ok: false, message }, { status: 404 });
  if (code === "22023") return NextResponse.json({ ok: false, message }, { status: 400 });
  if (code === "22P02") return NextResponse.json({ ok: false, message }, { status: 400 });
  return NextResponse.json({ ok: false, message }, { status: 500 });
}

export async function POST(request: Request, context: RouteParams) {
  const actorResult = await requireRateActor(RATE_REVIEWER_ROLES);
  if ("error" in actorResult) return actorResult.error;

  const { rateId } = await context.params;
  if (!rateId) {
    return NextResponse.json({ ok: false, message: "Missing rateId" }, { status: 400 });
  }

  const body = (await request.json().catch(() => null)) as DecisionBody | null;
  const action = typeof body?.action === "string" ? body.action.trim().toLowerCase() : "";
  const reviewRemarks = typeof body?.reviewRemarks === "string" ? body.reviewRemarks.trim() : "";

  if (action !== "approve" && action !== "reject") {
    return NextResponse.json({ ok: false, message: "action must be approve or reject" }, { status: 400 });
  }

  if (action === "reject" && !reviewRemarks) {
    return NextResponse.json(
      { ok: false, message: "reviewRemarks is required for rejection" },
      { status: 400 },
    );
  }

  const { data: rpcData, error: rpcError } = await actorResult.supabase.rpc("rate_review_decide_v1", {
    p_rate_id: rateId,
    p_action: action,
    p_review_remarks: reviewRemarks || null,
    p_actor_user_id: actorResult.actor.id,
  } as never);

  if (rpcError) {
    return mapRpcError(rpcError.message ?? "Unable to review rate", rpcError.code);
  }

  const row = Array.isArray(rpcData)
    ? ((rpcData[0] ?? null) as RateRow | null)
    : ((rpcData ?? null) as RateRow | null);
  if (!row) {
    return NextResponse.json({ ok: false, message: "Unable to review rate" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, data: normalizeRateRow(row) });
}
