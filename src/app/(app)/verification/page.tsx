"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PageHeader } from "@/components/shared/page-header";
import { useAuth } from "@/lib/auth/auth-context";
import { listPendingVerifications } from "@/lib/api/verification";
import { queryKeys } from "@/lib/query/keys";
import { formatDate } from "@/lib/formatters";
import type { PendingVerificationItem, PendingVerificationKind } from "@/lib/types";
import {
  Search,
  Plus,
  Clock,
  User,
  Building2,
  Users,
  Truck,
} from "lucide-react";

const KIND_BADGE: Record<PendingVerificationKind, string> = {
  individual_driver: "bg-blue-50 text-blue-700",
  transporter: "bg-purple-50 text-purple-700",
  employee_driver: "bg-sky-50 text-sky-700",
  vehicle: "bg-amber-50 text-amber-700",
};

const KIND_LABEL: Record<PendingVerificationKind, string> = {
  individual_driver: "Individual Driver",
  transporter: "Transporter",
  employee_driver: "Employee Driver",
  vehicle: "Vehicle",
};

function formatPhone(phone: string | null | undefined) {
  if (!phone) return "";
  const digits = phone.replace(/^91/, "");
  if (digits.length === 10) return `${digits.slice(0, 5)} ${digits.slice(5)}`;
  return digits;
}

function timeAgo(dateStr: string) {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffMs = now - then;
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays === 1) return "1 day ago";
  if (diffDays < 30) return `${diffDays} days ago`;
  return formatDate(dateStr);
}

function hrefFor(item: PendingVerificationItem): string {
  switch (item.kind) {
    case "individual_driver":
    case "transporter":
      return `/verification/${item.id}`;
    case "employee_driver":
      return `/verification/employee-driver/${item.id}`;
    case "vehicle":
      return `/verification/vehicle/${item.id}`;
  }
}

function subtitleFor(item: PendingVerificationItem): string {
  // For users we show phone; for vehicle we show spec; employee also includes parent transporter.
  switch (item.kind) {
    case "individual_driver":
    case "transporter":
      return item.subtitle ? formatPhone(item.subtitle) : "";
    case "employee_driver":
      return [item.subtitle ? formatPhone(item.subtitle) : null, item.parentTitle]
        .filter(Boolean)
        .join(" · ");
    case "vehicle":
      return [item.subtitle, item.parentTitle].filter(Boolean).join(" · ");
  }
}

export default function VerificationPendingPage() {
  const { user } = useAuth();
  const [search, setSearch] = useState("");
  const [kindFilter, setKindFilter] = useState<string>("all");

  const pendingQuery = useQuery({
    queryKey: queryKeys.verificationPending({
      userType: kindFilter === "all" ? undefined : kindFilter,
      search: search || undefined,
      limit: 50,
      offset: 0,
    }),
    queryFn: () =>
      listPendingVerifications({
        userType: kindFilter === "all" ? undefined : kindFilter,
        search: search || undefined,
        limit: 50,
        offset: 0,
      }),
    enabled: !!user,
  });

  const data = pendingQuery.data;
  const items = data?.items ?? [];
  const canAddPartner =
    user?.role === "super_admin" ||
    user?.role === "admin" ||
    user?.role === "sales_vehicles";

  return (
    <div className="space-y-4">
      <PageHeader
        title="Verification"
        description="Verify partners, employee drivers, and fleet vehicles."
      >
        {canAddPartner && (
          <Button size="sm" className="h-8 text-xs" asChild>
            <Link href="/verification/add">
              <Plus className="h-3.5 w-3.5" />
              Add Partner
            </Link>
          </Button>
        )}
      </PageHeader>

      {/* Stats row */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <Card>
          <CardContent className="p-3 flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gray-100">
              <Clock className="h-4 w-4 text-gray-600" />
            </div>
            <div>
              <p className="text-xs text-gray-500">Total Pending</p>
              <p className="text-lg font-semibold text-gray-900">{data?.total ?? "—"}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-50">
              <User className="h-4 w-4 text-blue-600" />
            </div>
            <div>
              <p className="text-xs text-gray-500">Individual</p>
              <p className="text-lg font-semibold text-gray-900">
                {data?.individualDriverCount ?? "—"}
              </p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-purple-50">
              <Building2 className="h-4 w-4 text-purple-600" />
            </div>
            <div>
              <p className="text-xs text-gray-500">Transporters</p>
              <p className="text-lg font-semibold text-gray-900">
                {data?.transporterCount ?? "—"}
              </p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-sky-50">
              <Users className="h-4 w-4 text-sky-600" />
            </div>
            <div>
              <p className="text-xs text-gray-500">Employees</p>
              <p className="text-lg font-semibold text-gray-900">
                {data?.employeeDriverCount ?? "—"}
              </p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-50">
              <Truck className="h-4 w-4 text-amber-600" />
            </div>
            <div>
              <p className="text-xs text-gray-500">Vehicles</p>
              <p className="text-lg font-semibold text-gray-900">
                {data?.vehicleCount ?? "—"}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative max-w-sm flex-1">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
          <Input
            placeholder="Search by name, phone or registration..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-8 pl-8 text-sm"
            maxLength={100}
          />
        </div>
        <Select value={kindFilter} onValueChange={setKindFilter}>
          <SelectTrigger className="w-[200px] h-8 text-sm">
            <SelectValue placeholder="Type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            <SelectItem value="individual_driver">Individual Driver</SelectItem>
            <SelectItem value="transporter">Transporter</SelectItem>
            <SelectItem value="employee_driver">Employee Driver</SelectItem>
            <SelectItem value="vehicle">Vehicle</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {pendingQuery.isLoading && (
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-gray-500">Loading pending verifications...</p>
          </CardContent>
        </Card>
      )}

      {!pendingQuery.isLoading && pendingQuery.isError && (
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-red-600">
              {pendingQuery.error instanceof Error
                ? pendingQuery.error.message
                : "Unable to fetch pending verifications"}
            </p>
          </CardContent>
        </Card>
      )}

      {!pendingQuery.isLoading && !pendingQuery.isError && (
        <>
          {items.length === 0 && (
            <Card>
              <CardContent className="p-8 text-center">
                <p className="text-sm font-medium text-gray-900">
                  No pending verifications
                </p>
                <p className="text-xs text-gray-500 mt-1">
                  Everything is verified. New partners, employees, and vehicles
                  will appear here.
                </p>
              </CardContent>
            </Card>
          )}

          {items.length > 0 && (
            <>
              {/* Desktop table */}
              <div className="hidden sm:block">
                <Card>
                  <CardContent className="p-0">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-gray-100 bg-gray-50/50">
                          <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500">
                            Name
                          </th>
                          <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500 w-[140px]">
                            Type
                          </th>
                          <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500">
                            Details
                          </th>
                          <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500 w-[120px]">
                            City
                          </th>
                          <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500 w-[120px]">
                            Added
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50">
                        {items.map((p) => (
                          <tr
                            key={`${p.kind}-${p.id}`}
                            className="hover:bg-gray-50/50 transition-colors"
                          >
                            <td className="px-4 py-3">
                              <Link
                                href={hrefFor(p)}
                                className="font-medium text-blue-600 hover:underline"
                              >
                                {p.title}
                              </Link>
                            </td>
                            <td className="px-4 py-3">
                              <Badge
                                variant="outline"
                                className={`border-0 text-[10px] ${KIND_BADGE[p.kind]}`}
                              >
                                {KIND_LABEL[p.kind]}
                              </Badge>
                            </td>
                            <td className="px-4 py-3 text-gray-600 truncate max-w-[260px]">
                              {subtitleFor(p) || "—"}
                            </td>
                            <td className="px-4 py-3 text-gray-600">{p.city ?? "—"}</td>
                            <td className="px-4 py-3 text-xs text-gray-500">
                              {timeAgo(p.createdAt)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </CardContent>
                </Card>
              </div>

              {/* Mobile cards */}
              <div className="sm:hidden space-y-2">
                {items.map((p) => (
                  <Link key={`${p.kind}-${p.id}`} href={hrefFor(p)}>
                    <Card className="hover:bg-gray-50/50 transition-colors">
                      <CardContent className="p-3">
                        <div className="flex items-start justify-between mb-1">
                          <p className="text-sm font-medium text-gray-900 truncate">
                            {p.title}
                          </p>
                          <Badge
                            variant="outline"
                            className={`border-0 text-[10px] ${KIND_BADGE[p.kind]}`}
                          >
                            {KIND_LABEL[p.kind]}
                          </Badge>
                        </div>
                        <p className="text-xs text-gray-500 truncate">
                          {subtitleFor(p) || "—"}
                        </p>
                        <p className="text-[11px] text-gray-400 mt-1">
                          {p.city ? `${p.city} · ` : ""}Added {timeAgo(p.createdAt)}
                        </p>
                      </CardContent>
                    </Card>
                  </Link>
                ))}
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
