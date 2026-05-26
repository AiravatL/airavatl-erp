"use client";

import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Smartphone,
  CheckCircle2,
  XCircle,
  HelpCircle,
  MinusCircle,
  MapPin,
  Bell,
  Circle as BubbleIcon,
} from "lucide-react";
import {
  getDriverDevicePermissions,
  type DriverPermissionState,
  type PermissionTri,
  type OverlayPermission,
} from "@/lib/api/verification";
import { queryKeys } from "@/lib/query/keys";

interface DevicePermissionsCardProps {
  userId: string;
}

function relativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  if (Number.isNaN(diffMs)) return "—";
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

type StatusValue = PermissionTri | OverlayPermission | undefined;

interface StatusVisual {
  Icon: typeof CheckCircle2;
  label: string;
  className: string;
}

function statusVisual(value: StatusValue): StatusVisual {
  switch (value) {
    case "granted":
      return {
        Icon: CheckCircle2,
        label: "Granted",
        className: "bg-emerald-50 text-emerald-700",
      };
    case "denied":
      return {
        Icon: XCircle,
        label: "Denied",
        className: "bg-red-50 text-red-700",
      };
    case "not_applicable":
      return {
        Icon: MinusCircle,
        label: "N/A",
        className: "bg-gray-50 text-gray-500",
      };
    case "undetermined":
    default:
      return {
        Icon: HelpCircle,
        label: "Not set",
        className: "bg-amber-50 text-amber-700",
      };
  }
}

function PermissionRow({
  Icon,
  label,
  value,
}: {
  Icon: typeof MapPin;
  label: string;
  value: StatusValue;
}) {
  const v = statusVisual(value);
  return (
    <div className="flex items-center justify-between gap-3 py-2">
      <div className="flex items-center gap-2 text-sm text-gray-700">
        <Icon className="h-3.5 w-3.5 text-gray-400" />
        <span>{label}</span>
      </div>
      <Badge
        variant="outline"
        className={`border-0 text-[11px] font-medium ${v.className}`}
      >
        <v.Icon className="h-3 w-3 mr-1" />
        {v.label}
      </Badge>
    </div>
  );
}

export function DevicePermissionsCard({ userId }: DevicePermissionsCardProps) {
  const query = useQuery({
    queryKey: queryKeys.driverDevicePermissions(userId),
    queryFn: () => getDriverDevicePermissions(userId),
    enabled: !!userId,
  });

  if (query.isLoading) {
    return (
      <Card>
        <CardContent className="p-4">
          <p className="text-xs text-gray-500">Loading device permissions…</p>
        </CardContent>
      </Card>
    );
  }

  if (query.isError) return null;

  const data = query.data;
  if (!data) return null;

  if (!data.hasState) {
    return (
      <Card className="border-gray-200">
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gray-100">
              <Smartphone className="h-4 w-4 text-gray-500" />
            </div>
            <div className="flex-1">
              <h2 className="text-sm font-semibold text-gray-900">
                Device permissions
              </h2>
              <p className="mt-1 text-xs text-gray-500">
                No data yet. The partner hasn&apos;t opened the updated app since
                this feature shipped, or they&apos;re on an older build.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  const state: DriverPermissionState = data.state;

  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gray-100">
            <Smartphone className="h-4 w-4 text-gray-600" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-sm font-semibold text-gray-900">
                Device permissions
              </h2>
              <Badge
                variant="outline"
                className="border-0 text-[10px] bg-gray-100 text-gray-600"
              >
                Last synced {relativeTime(data.updatedAt)}
              </Badge>
            </div>
            <p className="mt-1 text-[11px] text-gray-500">
              {data.platform ? `${data.platform}` : "unknown platform"}
              {data.appVersion ? ` · app v${data.appVersion}` : null}
              {" · "}
              best-effort, may be stale up to an hour
            </p>

            <div className="mt-3 divide-y divide-gray-100">
              <PermissionRow
                Icon={MapPin}
                label="Location (foreground)"
                value={state.location_foreground}
              />
              <PermissionRow
                Icon={MapPin}
                label="Location (background)"
                value={state.location_background}
              />
              <PermissionRow
                Icon={Bell}
                label="Notifications"
                value={state.notifications}
              />
              <PermissionRow
                Icon={BubbleIcon}
                label="Quick-access bubble"
                value={state.overlay}
              />
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
