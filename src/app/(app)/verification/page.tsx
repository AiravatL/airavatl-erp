"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PageHeader } from "@/components/shared/page-header";
import { useAuth } from "@/lib/auth/auth-context";
import { listPendingVerifications } from "@/lib/api/verification";
import { queryKeys } from "@/lib/query/keys";
import { formatDate } from "@/lib/formatters";
import { Search, Plus, Clock, User, Building2 } from "lucide-react";

const TYPE_BADGE: Record<string, string> = {
  individual_driver: "bg-blue-50 text-blue-700",
  transporter: "bg-purple-50 text-purple-700",
};

const TYPE_LABEL: Record<string, string> = {
  individual_driver: "Individual Driver",
  transporter: "Transporter",
};

function formatPhone(phone: string) {
  const digits = phone.replace(/^91/, "");
  if (digits.length === 10) {
    return `${digits.slice(0, 5)} ${digits.slice(5)}`;
  }
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

export default function VerificationPendingPage() {
  const { user } = useAuth();
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("all");

  const pendingQuery = useQuery({
    queryKey: queryKeys.verificationPending({
      userType: typeFilter === "all" ? undefined : typeFilter,
      search: search || undefined,
      limit: 50,
      offset: 0,
    }),
    queryFn: () =>
      listPendingVerifications({
        userType: typeFilter === "all" ? undefined : typeFilter,
        search: search || undefined,
        limit: 50,
        offset: 0,
      }),
    enabled: !!user,
  });

  const data = pendingQuery.data;
  const items = data?.items ?? [];
  const canAddPartner = user?.role === "super_admin" || user?.role === "admin" || user?.role === "sales_vehicles";

  return (
    <div className="space-y-4">
      <PageHeader
        title="Partner Verification"
        description="Verify individual drivers and transporters who signed up via the partner app."
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
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
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
              <p className="text-xs text-gray-500">Individual Drivers</p>
              <p className="text-lg font-semibold text-gray-900">{data?.driverCount ?? "—"}</p>
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
              <p className="text-lg font-semibold text-gray-900">{data?.transporterCount ?? "—"}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative max-w-sm flex-1">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
          <Input
            placeholder="Search by name or phone..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-8 pl-8 text-sm"
            maxLength={100}
          />
        </div>
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-[180px] h-8 text-sm">
            <SelectValue placeholder="User Type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            <SelectItem value="individual_driver">Individual Driver</SelectItem>
            <SelectItem value="transporter">Transporter</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Loading */}
      {pendingQuery.isLoading && (
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-gray-500">Loading pending verifications...</p>
          </CardContent>
        </Card>
      )}

      {/* Error */}
      {!pendingQuery.isLoading && pendingQuery.isError && (
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-red-600">
              {pendingQuery.error instanceof Error ? pendingQuery.error.message : "Unable to fetch pending verifications"}
            </p>
          </CardContent>
        </Card>
      )}

      {/* Results */}
      {!pendingQuery.isLoading && !pendingQuery.isError && (
        <>
          {items.length === 0 && (
            <Card>
              <CardContent className="p-8 text-center">
                <p className="text-sm font-medium text-gray-900">No pending verifications</p>
                <p className="text-xs text-gray-500 mt-1">
                  All partners have been verified. New signups from the partner app will appear here.
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
                          <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500">Name</th>
                          <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500 w-[140px]">Phone</th>
                          <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500 w-[160px]">Type</th>
                          <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500 w-[140px]">City</th>
                          <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500 w-[120px]">Signed Up</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50">
                        {items.map((p) => (
                          <tr key={p.userId} className="hover:bg-gray-50/50 transition-colors">
                            <td className="px-4 py-3">
                              <Link
                                href={`/verification/${p.userId}`}
                                className="font-medium text-blue-600 hover:underline"
                              >
                                {p.fullName}
                              </Link>
                            </td>
                            <td className="px-4 py-3 text-gray-600 tabular-nums">{formatPhone(p.phone)}</td>
                            <td className="px-4 py-3">
                              <Badge variant="outline" className={`border-0 text-[10px] ${TYPE_BADGE[p.userType] ?? ""}`}>
                                {TYPE_LABEL[p.userType] ?? p.userType}
                              </Badge>
                            </td>
                            <td className="px-4 py-3 text-gray-600">{p.city ?? "—"}</td>
                            <td className="px-4 py-3 text-xs text-gray-500">{timeAgo(p.createdAt)}</td>
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
                  <Link key={p.userId} href={`/verification/${p.userId}`}>
                    <Card className="hover:bg-gray-50/50 transition-colors">
                      <CardContent className="p-3">
                        <div className="flex items-start justify-between mb-1">
                          <p className="text-sm font-medium text-gray-900">{p.fullName}</p>
                          <Badge variant="outline" className={`border-0 text-[10px] ${TYPE_BADGE[p.userType] ?? ""}`}>
                            {TYPE_LABEL[p.userType] ?? p.userType}
                          </Badge>
                        </div>
                        <p className="text-xs text-gray-500">
                          {formatPhone(p.phone)}
                          {p.city ? ` · ${p.city}` : ""}
                        </p>
                        <p className="text-[11px] text-gray-400 mt-1">Signed up {timeAgo(p.createdAt)}</p>
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
