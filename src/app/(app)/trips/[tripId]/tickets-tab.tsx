import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/shared/status-badge";
import { EmptyState } from "@/components/shared/empty-state";
import type { Ticket } from "@/lib/types";
import { formatDate } from "@/lib/formatters";
import { TicketCheck, Plus, User } from "lucide-react";

const STATUS_LABELS: Record<string, string> = {
  open: "Open", in_progress: "In Progress", waiting: "Waiting", resolved: "Resolved",
};

export function TicketsTab({ tickets }: { tickets: Ticket[] }) {
  if (tickets.length === 0) {
    return (
      <EmptyState
        icon={TicketCheck}
        title="No tickets"
        description="Create a ticket if there's an issue to track."
        action={<Button size="sm" className="h-8 text-xs gap-1"><Plus className="h-3 w-3" /> New Ticket</Button>}
      />
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex justify-end">
        <Button size="sm" className="h-8 text-xs gap-1.5">
          <Plus className="h-3.5 w-3.5" /> New Ticket
        </Button>
      </div>
      {tickets.map((t) => (
        <Card key={t.id}>
          <CardContent className="p-3">
            <div className="flex items-start justify-between mb-1">
              <div>
                <p className="text-sm font-medium text-gray-900">{t.title}</p>
                <p className="text-xs text-gray-500">{t.issueType}</p>
              </div>
              <StatusBadge status={t.status} label={STATUS_LABELS[t.status]} variant="ticket" />
            </div>
            <p className="text-xs text-gray-500 line-clamp-2 mb-2">{t.description}</p>
            <div className="flex items-center gap-3 text-[11px] text-gray-400">
              <span className="flex items-center gap-1"><User className="h-3 w-3" /> {t.assignedToName}</span>
              <span>{formatDate(t.createdAt)}</span>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
