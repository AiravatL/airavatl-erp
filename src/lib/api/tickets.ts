import { apiRequest } from "@/lib/api/http";

export type TicketStatus = "open" | "in_progress" | "waiting" | "resolved";

export interface TicketItem {
  id: string;
  tripId: string | null;
  tripCode: string | null;
  issueType: string;
  title: string;
  description: string;
  status: TicketStatus;
  assignedToId: string | null;
  assignedToName: string | null;
  assignedRole: string | null;
  createdById: string;
  createdByName: string | null;
  resolvedById: string | null;
  resolvedByName: string | null;
  resolvedAt: string | null;
  createdAt: string;
  updatedAt: string;
  sourceType: string | null;
  sourceId: string | null;
  metadata: Record<string, unknown>;
}

export interface TicketCounts {
  open: number;
  inProgress: number;
  waiting: number;
  resolved: number;
  total: number;
}

export interface TicketListResult {
  items: TicketItem[];
  counts: TicketCounts;
}

export interface ListTicketsFilters {
  status?: "all" | TicketStatus;
  search?: string;
  limit?: number;
  offset?: number;
}

export interface UpdateTicketStatusInput {
  status: TicketStatus;
  note?: string;
}

export async function listTickets(filters: ListTicketsFilters): Promise<TicketListResult> {
  const params = new URLSearchParams();
  if (filters.status && filters.status !== "all") params.set("status", filters.status);
  if (filters.search?.trim()) params.set("search", filters.search.trim());
  if (filters.limit) params.set("limit", String(filters.limit));
  if (filters.offset) params.set("offset", String(filters.offset));

  const queryString = params.toString();
  const url = queryString ? `/api/tickets?${queryString}` : "/api/tickets";

  return apiRequest<TicketListResult>(url, { method: "GET" });
}

export async function updateTicketStatus(
  ticketId: string,
  input: UpdateTicketStatusInput,
): Promise<{ id: string; status: TicketStatus }> {
  return apiRequest<{ id: string; status: TicketStatus }>(`/api/tickets/${ticketId}/status`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}
