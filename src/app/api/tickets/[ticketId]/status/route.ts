import { NextResponse } from "next/server";
import { isMissingRpcError } from "@/lib/supabase/rpc";
import { mapTicketRpcError, requireTicketActor } from "@/app/api/tickets/_shared";

interface UpdateStatusBody {
  status?: unknown;
  note?: unknown;
}

const VALID_STATUSES = new Set(["open", "in_progress", "waiting", "resolved"]);
const MAX_NOTE_LENGTH = 500;

function toTrimmedString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ ticketId: string }> },
) {
  const actorResult = await requireTicketActor();
  if ("error" in actorResult) return actorResult.error;

  const { ticketId } = await params;
  const body = (await request.json().catch(() => null)) as UpdateStatusBody | null;
  const status = toTrimmedString(body?.status).toLowerCase();
  const note = toTrimmedString(body?.note);

  if (!VALID_STATUSES.has(status)) {
    return NextResponse.json({ ok: false, message: "Invalid status" }, { status: 400 });
  }
  if (note.length > MAX_NOTE_LENGTH) {
    return NextResponse.json({ ok: false, message: "Note is too long" }, { status: 400 });
  }

  const { data: rpcData, error: rpcError } = await actorResult.supabase.rpc("ticket_update_status_v1", {
    p_actor_user_id: actorResult.actor.id,
    p_ticket_id: ticketId,
    p_to_status: status,
    p_note: note || null,
  } as never);

  if (rpcError) {
    if (isMissingRpcError(rpcError)) {
      return NextResponse.json({ ok: false, message: "Missing RPC: ticket_update_status_v1" }, { status: 500 });
    }
    return mapTicketRpcError(rpcError.message ?? "Unable to update ticket status", rpcError.code);
  }

  return NextResponse.json({ ok: true, data: rpcData ?? null });
}
