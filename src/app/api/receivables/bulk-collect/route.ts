import { NextResponse } from "next/server";
import { requireServerActor } from "@/lib/auth/server-actor";
import { isMissingRpcError } from "@/lib/supabase/rpc";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const actorResult = await requireServerActor(["super_admin", "admin", "accounts"]);
  if ("error" in actorResult) return actorResult.error;

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ ok: false, message: "Request body required" }, { status: 400 });

  const { data, error } = await actorResult.supabase.rpc("receivable_bulk_collection_v1", {
    p_actor_user_id: actorResult.actor.id,
    p_consigner_profile_id: body.consignerProfileId ?? null,
    p_total_amount: body.totalAmount ?? null,
    p_payment_date: body.paymentDate ?? null,
    p_payment_method: body.paymentMethod ?? null,
    p_payment_reference: body.paymentReference ?? null,
    p_proof_object_key: body.proofObjectKey ?? null,
    p_notes: body.notes ?? null,
  } as never);

  if (error) {
    if (isMissingRpcError(error)) return NextResponse.json({ ok: false, message: "Missing RPC" }, { status: 500 });
    const msg = error.message ?? "";
    if (msg.includes("consigner_not_found")) return NextResponse.json({ ok: false, message: "Consigner not found" }, { status: 404 });
    if (msg.includes("no_outstanding_receivables")) return NextResponse.json({ ok: false, message: "No outstanding receivables for this consigner" }, { status: 400 });
    if (msg.includes("invalid_amount")) return NextResponse.json({ ok: false, message: "Amount must be greater than 0" }, { status: 400 });
    if (msg.includes("future_date")) return NextResponse.json({ ok: false, message: "Payment date cannot be in the future" }, { status: 400 });
    return NextResponse.json({ ok: false, message: msg }, { status: 500 });
  }

  return NextResponse.json({ ok: true, data });
}
