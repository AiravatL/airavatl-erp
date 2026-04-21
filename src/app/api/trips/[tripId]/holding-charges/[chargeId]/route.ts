import { NextResponse } from "next/server";
import { requireServerActor } from "@/lib/auth/server-actor";
import { isMissingRpcError } from "@/lib/supabase/rpc";

export const dynamic = "force-dynamic";

function mapError(msg: string) {
  if (msg.includes("charge_not_found")) return { status: 404, message: "Charge entry not found" };
  if (msg.includes("final_already_paid")) return { status: 400, message: "Final payment already settled" };
  if (msg.includes("final_payment_already_requested"))
    return { status: 409, message: "Final payment already requested — cannot delete holding charges" };
  return { status: 500, message: msg || "Unexpected error" };
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ tripId: string; chargeId: string }> },
) {
  const actorResult = await requireServerActor(["super_admin", "admin", "operations"]);
  if ("error" in actorResult) return actorResult.error;

  const { chargeId } = await params;
  if (!chargeId) {
    return NextResponse.json({ ok: false, message: "Charge ID is required" }, { status: 400 });
  }

  const { data, error } = await actorResult.supabase.rpc("trip_delete_holding_charge_v1", {
    p_actor_user_id: actorResult.actor.id,
    p_charge_id: chargeId,
  } as never);

  if (error) {
    if (isMissingRpcError(error)) {
      return NextResponse.json({ ok: false, message: "Missing RPC" }, { status: 500 });
    }
    const mapped = mapError(error.message ?? "");
    return NextResponse.json({ ok: false, message: mapped.message }, { status: mapped.status });
  }

  return NextResponse.json({ ok: true, data });
}
