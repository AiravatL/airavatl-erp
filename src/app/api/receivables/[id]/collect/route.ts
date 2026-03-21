import { NextResponse } from "next/server";
import { requireServerActor } from "@/lib/auth/server-actor";
import { isMissingRpcError } from "@/lib/supabase/rpc";

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const actorResult = await requireServerActor(["super_admin", "admin", "accounts"]);
  if ("error" in actorResult) return actorResult.error;

  const { id } = await params;
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;

  if (!body) return NextResponse.json({ ok: false, message: "Request body required" }, { status: 400 });

  const { data, error } = await actorResult.supabase.rpc("receivable_record_collection_v1", {
    p_actor_user_id: actorResult.actor.id,
    p_receivable_id: id,
    p_amount: body.amount ?? null,
    p_payment_date: body.paymentDate ?? null,
    p_payment_method: body.paymentMethod ?? null,
    p_payment_reference: body.paymentReference ?? null,
    p_proof_object_key: body.proofObjectKey ?? null,
    p_notes: body.notes ?? null,
  } as never);

  if (error) {
    if (isMissingRpcError(error)) return NextResponse.json({ ok: false, message: "Missing RPC" }, { status: 500 });
    const msg = error.message ?? "";
    if (msg.includes("receivable_not_found")) return NextResponse.json({ ok: false, message: "Receivable not found" }, { status: 404 });
    if (msg.includes("receivable_already_settled")) return NextResponse.json({ ok: false, message: "Receivable already settled" }, { status: 400 });
    if (msg.includes("invalid_amount")) return NextResponse.json({ ok: false, message: "Amount must be greater than 0" }, { status: 400 });
    if (msg.includes("future_date")) return NextResponse.json({ ok: false, message: "Payment date cannot be in the future" }, { status: 400 });
    if (msg.includes("invalid_payment_method")) return NextResponse.json({ ok: false, message: "Invalid payment method" }, { status: 400 });
    return NextResponse.json({ ok: false, message: msg }, { status: 500 });
  }

  return NextResponse.json({ ok: true, data });
}
