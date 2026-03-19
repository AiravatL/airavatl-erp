"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatCurrency } from "@/lib/formatters";
import type { AppTripStatus } from "@/lib/types";
import { User, Phone } from "lucide-react";

interface DriverInfoCardProps {
  bid: Record<string, unknown>;
  tripStatus: AppTripStatus;
  isOps: boolean;
}

export function DriverInfoCard({ bid, tripStatus, isOps }: DriverInfoCardProps) {
  const acceptance =
    tripStatus === "waiting_driver_acceptance"
      ? "Pending"
      : tripStatus === "driver_rejected"
        ? "Rejected"
        : "Accepted";

  const acceptanceBadgeColor =
    acceptance === "Accepted"
      ? "border-green-200 bg-green-50 text-green-700"
      : acceptance === "Rejected"
        ? "border-red-200 bg-red-50 text-red-700"
        : "border-amber-200 bg-amber-50 text-amber-700";

  const bidderType =
    (bid.bidder_type as string) === "individual_driver"
      ? "Individual Driver"
      : "Transporter";

  const phone = bid.bidder_phone as string | null;

  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center gap-2 mb-3">
          <User className="h-4 w-4 text-gray-500" />
          <h3 className="text-sm font-semibold text-gray-900">Driver Info</h3>
        </div>
        <div className="space-y-2">
          <DetailRow label="Name" value={bid.bidder_name as string} />
          <DetailRow label="Type" value={bidderType} />
          <div className="flex justify-between gap-4 items-center">
            <span className="text-xs text-gray-500 shrink-0">Acceptance</span>
            <Badge
              variant="outline"
              className={`text-xs ${acceptanceBadgeColor}`}
            >
              {acceptance}
            </Badge>
          </div>
          {phone && (
            <div className="flex justify-between gap-4 items-center">
              <span className="text-xs text-gray-500 shrink-0">Phone</span>
              <a
                href={`tel:${phone}`}
                className="inline-flex items-center gap-1 text-sm text-blue-600 hover:underline"
              >
                <Phone className="h-3 w-3" />
                {phone}
              </a>
            </div>
          )}
          {!isOps && (
            <DetailRow
              label="Bid Amount"
              value={formatCurrency(bid.bid_amount as number)}
            />
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <span className="text-xs text-gray-500 shrink-0">{label}</span>
      <span className="text-sm text-gray-900 text-right">{value}</span>
    </div>
  );
}
