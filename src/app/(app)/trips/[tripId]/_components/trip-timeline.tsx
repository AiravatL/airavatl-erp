"use client";

import { Card, CardContent } from "@/components/ui/card";
import { formatDateTime } from "@/lib/formatters";
import { APP_TRIP_STATUS_LABELS, type AppTripStatus } from "@/lib/types";
import { Clock, CheckCircle2 } from "lucide-react";

interface TimelineStep {
  status: AppTripStatus;
  label: string;
  timestamp: string | null;
}

interface TripTimelineProps {
  trip: Record<string, unknown>;
  currentStatus: AppTripStatus;
}

const TIMELINE_FIELDS: { status: AppTripStatus; field: string }[] = [
  { status: "waiting_driver_acceptance", field: "created_at" },
  { status: "driver_assigned", field: "driver_assigned_at" },
  { status: "en_route_to_pickup", field: "en_route_to_pickup_at" },
  { status: "at_pickup", field: "at_pickup_at" },
  { status: "loading", field: "loading_at" },
  { status: "in_transit", field: "in_transit_at" },
  { status: "at_delivery", field: "at_delivery_at" },
  { status: "unloading", field: "unloading_at" },
  { status: "completed", field: "completed_at" },
];

export function TripTimeline({ trip, currentStatus }: TripTimelineProps) {
  const steps: TimelineStep[] = TIMELINE_FIELDS.map(({ status, field }) => ({
    status,
    label: APP_TRIP_STATUS_LABELS[status] ?? status,
    timestamp: (trip[field] as string) ?? null,
  }));

  const currentIndex = TIMELINE_FIELDS.findIndex(
    (f) => f.status === currentStatus,
  );

  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center gap-2 mb-4">
          <Clock className="h-4 w-4 text-gray-500" />
          <h3 className="text-sm font-semibold text-gray-900">Timeline</h3>
        </div>
        <div className="relative space-y-0">
          {steps.map((step, idx) => {
            const isCompleted = currentIndex >= 0 && idx <= currentIndex;
            const isCurrent = idx === currentIndex;
            const isLast = idx === steps.length - 1;

            return (
              <div key={step.status} className="flex gap-3">
                {/* Vertical line + dot */}
                <div className="flex flex-col items-center">
                  <div
                    className={`flex h-6 w-6 items-center justify-center rounded-full shrink-0 ${
                      isCompleted
                        ? isCurrent
                          ? "bg-blue-600"
                          : "bg-green-500"
                        : "bg-gray-200"
                    }`}
                  >
                    {isCompleted ? (
                      <CheckCircle2 className="h-3.5 w-3.5 text-white" />
                    ) : (
                      <div className="h-2 w-2 rounded-full bg-gray-400" />
                    )}
                  </div>
                  {!isLast && (
                    <div
                      className={`w-0.5 flex-1 min-h-[24px] ${
                        isCompleted && idx < currentIndex
                          ? "bg-green-300"
                          : "bg-gray-200"
                      }`}
                    />
                  )}
                </div>

                {/* Content */}
                <div className="pb-4 pt-0.5 min-w-0">
                  <p
                    className={`text-sm font-medium ${
                      isCurrent
                        ? "text-blue-700"
                        : isCompleted
                          ? "text-gray-900"
                          : "text-gray-400"
                    }`}
                  >
                    {step.label}
                  </p>
                  {step.timestamp && isCompleted && (
                    <p className="text-xs text-gray-500 mt-0.5">
                      {formatDateTime(step.timestamp)}
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
