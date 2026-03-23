import { NextResponse } from "next/server";
import { requireServerActor } from "@/lib/auth/server-actor";
import { isMissingRpcError } from "@/lib/supabase/rpc";

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ tripId: string }> },
) {
  const actorResult = await requireServerActor(["super_admin", "admin", "operations"]);
  if ("error" in actorResult) return actorResult.error;

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ ok: false, message: "Body required" }, { status: 400 });

  const proofId = body.proofId as string | undefined;
  const action = body.action as string | undefined;
  const rejectionReason = body.rejectionReason as string | undefined;

  if (!proofId) return NextResponse.json({ ok: false, message: "proofId required" }, { status: 400 });
  if (action !== "accept" && action !== "reject") {
    return NextResponse.json({ ok: false, message: "action must be 'accept' or 'reject'" }, { status: 400 });
  }

  const { data, error } = await actorResult.supabase.rpc("trip_proof_review_v1", {
    p_actor_user_id: actorResult.actor.id,
    p_proof_id: proofId,
    p_action: action,
    p_rejection_reason: rejectionReason ?? null,
  } as never);

  if (error) {
    if (isMissingRpcError(error)) return NextResponse.json({ ok: false, message: "Missing RPC" }, { status: 500 });
    const msg = error.message ?? "";
    if (msg.includes("proof_not_found")) return NextResponse.json({ ok: false, message: "Proof not found" }, { status: 404 });
    if (msg.includes("not_erp_trip")) return NextResponse.json({ ok: false, message: "Only ERP trip proofs can be reviewed" }, { status: 400 });
    if (msg.includes("rejection_reason_required")) return NextResponse.json({ ok: false, message: "Rejection reason is required" }, { status: 400 });
    if (msg.includes("already_reviewed")) return NextResponse.json({ ok: false, message: "Proof already reviewed" }, { status: 409 });
    return NextResponse.json({ ok: false, message: msg }, { status: 500 });
  }

  return NextResponse.json({ ok: true, data });
}
