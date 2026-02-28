import { NextResponse } from "next/server";
import { isMissingRpcError } from "@/lib/supabase/rpc";
import { mapTicketRpcError, requireTicketActor } from "@/app/api/tickets/_shared";

interface TicketRow {
  id: string;
  trip_id: string | null;
  trip_code: string | null;
  issue_type: string;
  title: string;
  description: string | null;
  status: string;
  assigned_to_id: string | null;
  assigned_to_name: string | null;
  assigned_role: string | null;
  created_by_id: string;
  created_by_name: string | null;
  resolved_by_id: string | null;
  resolved_by_name: string | null;
  resolved_at: string | null;
  created_at: string;
  updated_at: string;
  source_type: string | null;
  source_id: string | null;
  metadata: Record<string, unknown> | null;
}

interface TicketCountsRow {
  open_count: number | string;
  in_progress_count: number | string;
  waiting_count: number | string;
  resolved_count: number | string;
  total_count: number | string;
}

function toPositiveInt(value: string | null, fallback: number, max: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(1, Math.min(Math.floor(parsed), max));
}

function toNonNegativeInt(value: string | null, fallback = 0): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(0, Math.floor(parsed));
}

function toNumber(value: number | string | null | undefined): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

export async function GET(request: Request) {
  const actorResult = await requireTicketActor();
  if ("error" in actorResult) return actorResult.error;

  const url = new URL(request.url);
  const status = (url.searchParams.get("status") ?? "").trim().toLowerCase();
  const search = (url.searchParams.get("search") ?? "").trim();
  const limit = toPositiveInt(url.searchParams.get("limit"), 100, 200);
  const offset = toNonNegativeInt(url.searchParams.get("offset"), 0);

  const [listResult, countsResult] = await Promise.all([
    actorResult.supabase.rpc("ticket_list_v1", {
      p_actor_user_id: actorResult.actor.id,
      p_status: status || null,
      p_search: search || null,
      p_limit: limit,
      p_offset: offset,
    } as never),
    actorResult.supabase.rpc("ticket_counts_v1", {
      p_actor_user_id: actorResult.actor.id,
      p_search: search || null,
    } as never),
  ]);

  if (listResult.error) {
    if (isMissingRpcError(listResult.error)) {
      return NextResponse.json({ ok: false, message: "Missing RPC: ticket_list_v1" }, { status: 500 });
    }
    return mapTicketRpcError(listResult.error.message ?? "Unable to fetch tickets", listResult.error.code);
  }

  if (countsResult.error) {
    if (isMissingRpcError(countsResult.error)) {
      return NextResponse.json({ ok: false, message: "Missing RPC: ticket_counts_v1" }, { status: 500 });
    }
    return mapTicketRpcError(countsResult.error.message ?? "Unable to fetch ticket counts", countsResult.error.code);
  }

  const rows = (Array.isArray(listResult.data) ? listResult.data : []) as TicketRow[];
  const countsRow = (Array.isArray(countsResult.data) ? countsResult.data[0] : countsResult.data) as TicketCountsRow | undefined;

  return NextResponse.json({
    ok: true,
    data: {
      items: rows.map((row) => ({
        id: row.id,
        tripId: row.trip_id,
        tripCode: row.trip_code,
        issueType: row.issue_type,
        title: row.title,
        description: row.description ?? "",
        status: row.status,
        assignedToId: row.assigned_to_id,
        assignedToName: row.assigned_to_name,
        assignedRole: row.assigned_role,
        createdById: row.created_by_id,
        createdByName: row.created_by_name,
        resolvedById: row.resolved_by_id,
        resolvedByName: row.resolved_by_name,
        resolvedAt: row.resolved_at,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        sourceType: row.source_type,
        sourceId: row.source_id,
        metadata: row.metadata ?? {},
      })),
      counts: {
        open: toNumber(countsRow?.open_count),
        inProgress: toNumber(countsRow?.in_progress_count),
        waiting: toNumber(countsRow?.waiting_count),
        resolved: toNumber(countsRow?.resolved_count),
        total: toNumber(countsRow?.total_count),
      },
    },
  });
}
