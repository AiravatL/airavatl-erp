"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/shared/page-header";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/lib/auth/auth-context";
import { formatCurrency } from "@/lib/formatters";
import { listCustomers } from "@/lib/api/customers";
import { queryKeys } from "@/lib/query/keys";
import { FIELD_LIMITS } from "@/lib/validation/client/field-limits";
import { Search, Building2 } from "lucide-react";

const STATUS_COLORS: Record<"active" | "inactive", string> = {
  active: "bg-emerald-50 text-emerald-700",
  inactive: "bg-gray-100 text-gray-600",
};

function formatPercent(value: number): string {
  if (!Number.isFinite(value)) return "0%";
  return `${Math.round(value)}%`;
}

export default function CustomersPage() {
  const { user } = useAuth();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<"all" | "active" | "inactive">("all");
  const [creditHealth, setCreditHealth] = useState<"all" | "within_limit" | "over_limit">("all");
  const [ownerId, setOwnerId] = useState<string>("all");

  const customersQuery = useQuery({
    queryKey: queryKeys.customers({ search, status, ownerId, creditHealth }),
    queryFn: () =>
      listCustomers({
        search: search || undefined,
        status: status === "all" ? undefined : status,
        ownerId: ownerId === "all" ? undefined : ownerId,
        creditHealth: creditHealth === "all" ? undefined : creditHealth,
        limit: 300,
      }),
    enabled: !!user,
  });

  const customers = useMemo(() => customersQuery.data ?? [], [customersQuery.data]);

  const ownerOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const customer of customers) {
      if (!customer.salesOwnerId || !customer.salesOwnerName) continue;
      if (!map.has(customer.salesOwnerId)) {
        map.set(customer.salesOwnerId, customer.salesOwnerName);
      }
    }
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
  }, [customers]);

  return (
    <div className="p-4 sm:p-6 space-y-4">
      <PageHeader
        title="Customers"
        description={
          customersQuery.isLoading
            ? "Loading customers..."
            : `${customers.length} customer${customers.length === 1 ? "" : "s"}`
        }
      />

      <div className="relative max-w-sm">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
        <Input
          placeholder="Search customers, GSTIN, owner..."
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          className="h-8 pl-8 text-sm"
          maxLength={FIELD_LIMITS.search}
        />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Select value={status} onValueChange={(value) => setStatus(value as typeof status)}>
          <SelectTrigger className="h-8 w-[150px] text-xs">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="inactive">Inactive</SelectItem>
          </SelectContent>
        </Select>

        <Select value={creditHealth} onValueChange={(value) => setCreditHealth(value as typeof creditHealth)}>
          <SelectTrigger className="h-8 w-[170px] text-xs">
            <SelectValue placeholder="Credit Health" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Credit Health</SelectItem>
            <SelectItem value="within_limit">Within Limit</SelectItem>
            <SelectItem value="over_limit">Over Limit</SelectItem>
          </SelectContent>
        </Select>

        <Select value={ownerId} onValueChange={setOwnerId}>
          <SelectTrigger className="h-8 w-[190px] text-xs">
            <SelectValue placeholder="Sales Owner" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Sales Owners</SelectItem>
            {ownerOptions.map((owner) => (
              <SelectItem key={owner.id} value={owner.id}>
                {owner.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {customersQuery.isLoading && (
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-gray-500">Loading customers...</p>
          </CardContent>
        </Card>
      )}

      {!customersQuery.isLoading && customersQuery.isError && (
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-red-600">
              {customersQuery.error instanceof Error ? customersQuery.error.message : "Unable to fetch customers"}
            </p>
          </CardContent>
        </Card>
      )}

      {!customersQuery.isLoading && !customersQuery.isError && customers.length === 0 && (
        <Card>
          <CardContent className="p-6 text-center">
            <Building2 className="h-8 w-8 text-gray-300 mx-auto mb-2" />
            <p className="text-sm text-gray-500">No customers found.</p>
          </CardContent>
        </Card>
      )}

      {!customersQuery.isLoading && !customersQuery.isError && customers.length > 0 && (
        <>
          <div className="hidden sm:block">
            <Card>
              <CardContent className="p-0">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100 bg-gray-50/50">
                      <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500">Customer</th>
                      <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500">Sales Owner</th>
                      <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500">Active Trips</th>
                      <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500">Outstanding</th>
                      <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500">Credit</th>
                      <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {customers.map((customer) => {
                      const utilization =
                        customer.creditLimit > 0
                          ? (customer.outstandingAmount / customer.creditLimit) * 100
                          : null;

                      return (
                        <tr key={customer.id} className="hover:bg-gray-50/50 transition-colors">
                          <td className="px-4 py-3">
                            <Link href={`/customers/${customer.id}`} className="font-medium text-blue-600 hover:underline">
                              {customer.name}
                            </Link>
                            <p className="text-[11px] text-gray-400">{customer.gstin || "No GSTIN"}</p>
                          </td>
                          <td className="px-4 py-3 text-gray-600">{customer.salesOwnerName || "-"}</td>
                          <td className="px-4 py-3 text-gray-600">{customer.activeTripsCount}</td>
                          <td className="px-4 py-3 text-gray-900 font-medium">
                            {formatCurrency(customer.outstandingAmount)}
                          </td>
                          <td className="px-4 py-3 text-gray-500">
                            <p>{customer.creditDays}d / {formatCurrency(customer.creditLimit)}</p>
                            {utilization != null && (
                              <p className="text-[11px] text-gray-400 mt-0.5">Utilization: {formatPercent(utilization)}</p>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            <Badge
                              variant="outline"
                              className={`text-[10px] border-0 ${STATUS_COLORS[customer.active ? "active" : "inactive"]}`}
                            >
                              {customer.active ? "Active" : "Inactive"}
                            </Badge>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          </div>

          <div className="sm:hidden space-y-2">
            {customers.map((customer) => {
              const utilization =
                customer.creditLimit > 0 ? (customer.outstandingAmount / customer.creditLimit) * 100 : null;

              return (
                <Link key={customer.id} href={`/customers/${customer.id}`}>
                  <Card className="hover:bg-gray-50/50 transition-colors">
                    <CardContent className="p-3">
                      <div className="flex items-start justify-between mb-1">
                        <div>
                          <p className="text-sm font-medium text-gray-900">{customer.name}</p>
                          <p className="text-[11px] text-gray-500">{customer.salesOwnerName || "No owner"}</p>
                        </div>
                        <Badge
                          variant="outline"
                          className={`text-[10px] border-0 ${STATUS_COLORS[customer.active ? "active" : "inactive"]}`}
                        >
                          {customer.active ? "Active" : "Inactive"}
                        </Badge>
                      </div>
                      <div className="flex flex-col gap-1 mt-2 text-xs text-gray-500">
                        <span>{customer.activeTripsCount} active trips</span>
                        <span className="font-medium text-gray-700">{formatCurrency(customer.outstandingAmount)}</span>
                        {utilization != null && <span>Utilization: {formatPercent(utilization)}</span>}
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
