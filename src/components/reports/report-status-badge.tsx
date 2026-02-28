import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { ReportStatus } from "@/lib/api/reports";

const STATUS_LABELS: Record<ReportStatus, string> = {
  ready: "Ready",
  partial: "Partial",
  todo: "TODO",
};

const STATUS_COLORS: Record<ReportStatus, string> = {
  ready: "bg-emerald-50 text-emerald-700",
  partial: "bg-amber-50 text-amber-700",
  todo: "bg-gray-100 text-gray-700",
};

export function ReportStatusBadge({ status, className }: { status: ReportStatus; className?: string }) {
  return (
    <Badge variant="outline" className={cn("border-0 text-xs font-medium", STATUS_COLORS[status], className)}>
      {STATUS_LABELS[status]}
    </Badge>
  );
}
