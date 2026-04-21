import { NextResponse } from "next/server";
import { requireServerActor } from "@/lib/auth/server-actor";
import { isMissingRpcError } from "@/lib/supabase/rpc";

export const dynamic = "force-dynamic";

type AddChargeBody = {
  driver_amount?: number;
  consigner_amount?: number;
  note?: string;
};

function mapError(msg: string) {
  if (msg.includes("trip_not_found")) return { status: 404, message: "Trip not found" };
  if (msg.includes("trip_terminal")) return { status: 400, message: "Trip is already cancelled or rejected" };
  if (msg.includes("final_already_paid")) return { status: 400, message: "Final payment already settled" };
  if (msg.includes("final_payment_already_requested"))
    return { status: 409, message: "Final payment already requested — cannot change holding charges" };
  if (msg.includes("amount_negative")) return { status: 400, message: "Amounts must be non-negative" };
  if (msg.includes("amount_required")) return { status: 400, message: "Enter a Driver or Consigner amount greater than 0" };
  if (msg.includes("charge_not_found")) return { status: 404, message: "Charge entry not found" };
  return { status: 500, message: msg || "Unexpected error" };
}

// GET — list existing charges for a trip with running totals
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ tripId: string }> },
) {
  const actorResult = await requireServerActor([
    "super_admin",
    "admin",
    "operations",
    "accounts",
    "support",
  ]);
  if ("error" in actorResult) return actorResult.error;

  const { tripId } = await params;
  if (!tripId) {
    return NextResponse.json({ ok: false, message: "Trip ID is required" }, { status: 400 });
  }

  const { data, error } = await actorResult.supabase.rpc("trip_list_holding_charges_v1", {
    p_actor_user_id: actorResult.actor.id,
    p_trip_id: tripId,
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

// POST — add a new charge entry
export async function POST(
  request: Request,
  { params }: { params: Promise<{ tripId: string }> },
) {
  const actorResult = await requireServerActor(["super_admin", "admin", "operations"]);
  if ("error" in actorResult) return actorResult.error;

  const { tripId } = await params;
  if (!tripId) {
    return NextResponse.json({ ok: false, message: "Trip ID is required" }, { status: 400 });
  }

  const body = (await request.json().catch(() => null)) as AddChargeBody | null;
  const driverAmount = Number(body?.driver_amount ?? 0);
  const consignerAmount = Number(body?.consigner_amount ?? 0);
  const note = body?.note?.toString().trim() || null;

  if (!Number.isFinite(driverAmount) || !Number.isFinite(consignerAmount)) {
    return NextResponse.json({ ok: false, message: "Amounts must be numbers" }, { status: 400 });
  }
  if (driverAmount < 0 || consignerAmount < 0) {
    return NextResponse.json({ ok: false, message: "Amounts must be non-negative" }, { status: 400 });
  }
  if (driverAmount + consignerAmount <= 0) {
    return NextResponse.json(
      { ok: false, message: "Enter a Driver or Consigner amount greater than 0" },
      { status: 400 },
    );
  }

  const { data, error } = await actorResult.supabase.rpc("trip_add_holding_charge_v1", {
    p_actor_user_id: actorResult.actor.id,
    p_trip_id: tripId,
    p_driver_amount: driverAmount,
    p_consigner_amount: consignerAmount,
    p_note: note,
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
