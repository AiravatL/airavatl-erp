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

  const { tripId } = await params;
  const body = (await request.json().catch(() => null)) as { payment_type?: string } | null;
  const paymentType = body?.payment_type;

  if (paymentType !== "advance" && paymentType !== "final") {
    return NextResponse.json({ ok: false, message: "payment_type must be 'advance' or 'final'" }, { status: 400 });
  }

  const { data, error } = await actorResult.supabase.rpc("trip_request_payment_v1", {
    p_actor_user_id: actorResult.actor.id,
    p_trip_id: tripId,
    p_payment_type: paymentType,
  } as never);

  if (error) {
    if (isMissingRpcError(error)) {
      return NextResponse.json({ ok: false, message: "Missing RPC" }, { status: 500 });
    }
    const msg = error.message ?? "";
    if (msg.includes("trip_not_found")) return NextResponse.json({ ok: false, message: "Trip not found" }, { status: 404 });
    if (msg.includes("not_erp_trip")) return NextResponse.json({ ok: false, message: "Not an ERP trip" }, { status: 400 });
    if (msg.includes("payment_already_requested")) return NextResponse.json({ ok: false, message: "Payment already requested" }, { status: 409 });
    if (msg.includes("trip_not_waiting_for_advance")) return NextResponse.json({ ok: false, message: "Trip is not waiting for advance payment" }, { status: 400 });
    if (msg.includes("trip_not_waiting_for_final")) return NextResponse.json({ ok: false, message: "Trip is not waiting for final payment" }, { status: 400 });
    if (msg.includes("no_final_amount_due")) return NextResponse.json({ ok: false, message: "No final amount due" }, { status: 400 });
    return NextResponse.json({ ok: false, message: msg }, { status: 500 });
  }

  return NextResponse.json({ ok: true, data });
}
