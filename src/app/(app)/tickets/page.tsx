"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { User, Filter, Loader2, TicketCheck } from "lucide-react";
import { useAuth } from "@/lib/auth/auth-context";
import { listTickets, updateTicketStatus, type TicketItem, type TicketStatus } from "@/lib/api/tickets";
import { queryKeys } from "@/lib/query/keys";
import { formatDate } from "@/lib/formatters";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/shared/page-header";
import { StatusBadge } from "@/components/shared/status-badge";
import { EmptyState } from "@/components/shared/empty-state";

const STATUS_LABELS: Record<TicketStatus, string> = {
  open: "Open",
  in_progress: "In Progress",
  waiting: "Waiting",
  resolved: "Resolved",
};

const ISSUE_TYPE_LABELS: Record<string, string> = {
  operational: "Operational",
  payment: "Payment",
  documentation: "Documentation",
  customer_complaint: "Customer Complaint",
  other: "Other",
};

const COLUMNS: TicketStatus[] = ["open", "in_progress", "waiting", "resolved"];

export default function TicketsPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const [view, setView] = useState<"board" | "list">("board");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | TicketStatus>("all");
  const [actionError, setActionError] = useState<string | null>(null);

  const filters = useMemo(
    () => ({
      search: search.trim() || undefined,
      status: statusFilter,
      limit: 200,
      offset: 0,
    }),
    [search, statusFilter],
  );

  const ticketsQuery = useQuery({
    queryKey: queryKeys.tickets(filters),
    queryFn: () => listTickets(filters),
    enabled: Boolean(user),
  });

  const statusMutation = useMutation({
    mutationFn: ({ ticketId, status }: { ticketId: string; status: TicketStatus }) =>
      updateTicketStatus(ticketId, { status }),
    onSuccess: async () => {
      setActionError(null);
      await queryClient.invalidateQueries({ queryKey: queryKeys.tickets(filters) });
    },
    onError: (error) => {
      setActionError(error instanceof Error ? error.message : "Unable to update ticket");
    },
  });

  const items = ticketsQuery.data?.items ?? [];
  const counts = ticketsQuery.data?.counts ?? { open: 0, inProgress: 0, waiting: 0, resolved: 0, total: 0 };

  return (
    <div className="space-y-4 p-4 sm:p-6">
      <PageHeader title="Tickets" description={`${counts.total} tickets`}>
        <div className="flex gap-2">
          <div className="flex overflow-hidden rounded-md border border-gray-200">
            <button
              onClick={() => setView("board")}
              className={`px-2.5 py-1 text-xs ${view === "board" ? "bg-gray-900 text-white" : "bg-white text-gray-600 hover:bg-gray-50"}`}
            >
              Board
            </button>
            <button
              onClick={() => setView("list")}
              className={`px-2.5 py-1 text-xs ${view === "list" ? "bg-gray-900 text-white" : "bg-white text-gray-600 hover:bg-gray-50"}`}
            >
              List
            </button>
          </div>
        </div>
      </PageHeader>

      <Card>
        <CardContent className="flex flex-col gap-3 p-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-xs text-gray-600">
            Auto-generated workflow tickets: vehicle assignment and payment proof tasks.
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <div className="relative">
              <Filter className="pointer-events-none absolute left-2 top-2.5 h-3.5 w-3.5 text-gray-400" />
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search by trip, title, description"
                className="h-8 w-full pl-7 text-xs sm:w-72"
                maxLength={120}
              />
            </div>
            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value as "all" | TicketStatus)}
              className="h-8 rounded-md border border-gray-200 px-2 text-xs text-gray-700"
            >
              <option value="all">All Status</option>
              <option value="open">Open</option>
              <option value="in_progress">In Progress</option>
              <option value="waiting">Waiting</option>
              <option value="resolved">Resolved</option>
            </select>
          </div>
        </CardContent>
      </Card>

      {actionError && (
        <Card>
          <CardContent className="p-3 text-xs text-red-600">{actionError}</CardContent>
        </Card>
      )}

      {ticketsQuery.isLoading && (
        <Card>
          <CardContent className="flex items-center gap-2 p-4 text-sm text-gray-500">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading tickets...
          </CardContent>
        </Card>
      )}

      {ticketsQuery.isError && (
        <Card>
          <CardContent className="p-4 text-sm text-red-600">
            {ticketsQuery.error instanceof Error ? ticketsQuery.error.message : "Unable to load tickets"}
          </CardContent>
        </Card>
      )}

      {!ticketsQuery.isLoading && !ticketsQuery.isError && items.length === 0 && (
        <EmptyState icon={TicketCheck} title="No tickets" description="No ticket found for this filter." />
      )}

      {!ticketsQuery.isLoading && !ticketsQuery.isError && items.length > 0 && view === "board" && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {COLUMNS.map((col) => {
            const colTickets = items.filter((ticket) => ticket.status === col);
            return (
              <div key={col} className="space-y-2">
                <div className="flex items-center justify-between px-1">
                  <h3 className="text-xs font-medium uppercase tracking-wider text-gray-500">{STATUS_LABELS[col]}</h3>
                  <span className="text-[11px] text-gray-400">{colTickets.length}</span>
                </div>
                <div className="space-y-2">
                  {colTickets.map((ticket) => (
                    <TicketCard
                      key={ticket.id}
                      ticket={ticket}
                      onChangeStatus={(status) => statusMutation.mutate({ ticketId: ticket.id, status })}
                      busy={statusMutation.isPending}
                    />
                  ))}
                  {colTickets.length === 0 && (
                    <div className="rounded-lg border border-dashed border-gray-200 p-4 text-center">
                      <p className="text-xs text-gray-400">No tickets</p>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {!ticketsQuery.isLoading && !ticketsQuery.isError && items.length > 0 && view === "list" && (
        <div className="space-y-2">
          {items.map((ticket) => (
            <TicketCard
              key={ticket.id}
              ticket={ticket}
              onChangeStatus={(status) => statusMutation.mutate({ ticketId: ticket.id, status })}
              busy={statusMutation.isPending}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function TicketCard({
  ticket,
  onChangeStatus,
  busy,
}: {
  ticket: TicketItem;
  onChangeStatus: (status: TicketStatus) => void;
  busy: boolean;
}) {
  const issueTypeLabel = ISSUE_TYPE_LABELS[ticket.issueType] ?? ticket.issueType;

  return (
    <Card className="transition-colors hover:bg-gray-50/50">
      <CardContent className="space-y-2 p-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="line-clamp-1 text-sm font-medium text-gray-900">{ticket.title}</p>
            <div className="mt-1 flex flex-wrap items-center gap-1.5">
              <Badge variant="outline" className="h-5 border-gray-200 px-1.5 py-0 text-[10px] text-gray-600">
                {issueTypeLabel}
              </Badge>
              {ticket.assignedRole && (
                <Badge variant="outline" className="h-5 border-blue-200 px-1.5 py-0 text-[10px] text-blue-700">
                  Role: {ticket.assignedRole}
                </Badge>
              )}
            </div>
          </div>
          <StatusBadge status={ticket.status} label={STATUS_LABELS[ticket.status]} variant="ticket" className="shrink-0" />
        </div>

        {ticket.description && <p className="line-clamp-2 text-[11px] text-gray-500">{ticket.description}</p>}

        <div className="space-y-1 text-[11px] text-gray-500">
          <p className="flex items-center gap-1">
            <User className="h-3 w-3" />
            Assigned: {ticket.assignedToName ?? (ticket.assignedRole ? `Role ${ticket.assignedRole}` : "Unassigned")}
          </p>
          <p>Created by: {ticket.createdByName ?? "Unknown"}</p>
          <div className="flex items-center justify-between gap-2">
            <span>{formatDate(ticket.createdAt)}</span>
            {ticket.tripCode && ticket.tripId && (
              <Link href={`/trips/${ticket.tripId}`} className="text-blue-600 hover:underline">
                {ticket.tripCode}
              </Link>
            )}
          </div>
        </div>

        <div className="flex flex-wrap gap-1.5 border-t border-gray-100 pt-2">
          {ticket.status !== "in_progress" && (
            <Button
              size="sm"
              variant="outline"
              className="h-6 px-2 text-[10px]"
              onClick={() => onChangeStatus("in_progress")}
              disabled={busy}
            >
              Start
            </Button>
          )}
          {ticket.status !== "waiting" && ticket.status !== "resolved" && (
            <Button
              size="sm"
              variant="outline"
              className="h-6 px-2 text-[10px]"
              onClick={() => onChangeStatus("waiting")}
              disabled={busy}
            >
              Waiting
            </Button>
          )}
          {ticket.status !== "resolved" ? (
            <Button
              size="sm"
              className="h-6 px-2 text-[10px]"
              onClick={() => onChangeStatus("resolved")}
              disabled={busy}
            >
              Resolve
            </Button>
          ) : (
            <Button
              size="sm"
              variant="outline"
              className="h-6 px-2 text-[10px]"
              onClick={() => onChangeStatus("open")}
              disabled={busy}
            >
              Reopen
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
