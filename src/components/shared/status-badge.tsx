import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import type { TripStage } from "@/lib/types";

const STAGE_COLORS: Record<TripStage, string> = {
  request_received: "bg-gray-100 text-gray-700",
  quoted: "bg-blue-50 text-blue-700",
  confirmed: "bg-blue-100 text-blue-800",
  vehicle_assigned: "bg-indigo-50 text-indigo-700",
  at_loading: "bg-amber-50 text-amber-700",
  loaded_docs_ok: "bg-amber-100 text-amber-800",
  advance_paid: "bg-purple-50 text-purple-700",
  in_transit: "bg-cyan-50 text-cyan-700",
  delivered: "bg-emerald-50 text-emerald-700",
  pod_soft_received: "bg-emerald-100 text-emerald-800",
  vendor_settled: "bg-teal-50 text-teal-700",
  customer_collected: "bg-green-50 text-green-700",
  closed: "bg-gray-100 text-gray-600",
};

const PAYMENT_COLORS: Record<string, string> = {
  pending: "bg-amber-50 text-amber-700",
  approved: "bg-blue-50 text-blue-700",
  on_hold: "bg-orange-50 text-orange-700",
  rejected: "bg-red-50 text-red-700",
  paid: "bg-emerald-50 text-emerald-700",
};

const DOC_COLORS: Record<string, string> = {
  pending: "bg-gray-100 text-gray-600",
  uploaded: "bg-blue-50 text-blue-700",
  verified: "bg-emerald-50 text-emerald-700",
  rejected: "bg-red-50 text-red-700",
};

const TICKET_COLORS: Record<string, string> = {
  open: "bg-red-50 text-red-700",
  in_progress: "bg-blue-50 text-blue-700",
  waiting: "bg-amber-50 text-amber-700",
  resolved: "bg-emerald-50 text-emerald-700",
};

const SEVERITY_COLORS: Record<string, string> = {
  low: "bg-gray-100 text-gray-600",
  medium: "bg-amber-50 text-amber-700",
  high: "bg-red-50 text-red-700",
};

type BadgeVariant = "stage" | "payment" | "document" | "ticket" | "severity" | "generic";

interface StatusBadgeProps {
  status: string;
  label: string;
  variant?: BadgeVariant;
  className?: string;
}

export function StatusBadge({ status, label, variant = "generic", className }: StatusBadgeProps) {
  let colorMap: Record<string, string> = {};
  switch (variant) {
    case "stage": colorMap = STAGE_COLORS; break;
    case "payment": colorMap = PAYMENT_COLORS; break;
    case "document": colorMap = DOC_COLORS; break;
    case "ticket": colorMap = TICKET_COLORS; break;
    case "severity": colorMap = SEVERITY_COLORS; break;
  }

  const color = colorMap[status] || "bg-gray-100 text-gray-700";

  return (
    <Badge variant="outline" className={cn("border-0 font-medium text-xs", color, className)}>
      {label}
    </Badge>
  );
}
