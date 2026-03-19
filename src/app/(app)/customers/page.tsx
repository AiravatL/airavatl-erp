"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/shared/page-header";
import { KpiCard } from "@/components/reports/kpi-card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/lib/auth/auth-context";
import { formatCurrency } from "@/lib/formatters";
import { listCustomers, listAppConsigners, type CustomerListItem, type AppConsigner } from "@/lib/api/customers";
import { queryKeys } from "@/lib/query/keys";
import { FIELD_LIMITS } from "@/lib/validation/client/field-limits";
import { Search, Building2, Users } from "lucide-react";

export default function CustomersPage() {
  const { user } = useAuth();
  const [tab, setTab] = useState<"erp" | "app">("erp");

  // ERP Customers
  const [erpSearch, setErpSearch] = useState("");
  const [status, setStatus] = useState<"all" | "active" | "inactive">("all");
  const [creditHealth, setCreditHealth] = useState<"all" | "within_limit" | "over_limit">("all");

  const erpQuery = useQuery({
    queryKey: queryKeys.customers({ search: erpSearch, status, creditHealth }),
    queryFn: () => listCustomers({
      search: erpSearch || undefined,
      status: status === "all" ? undefined : status,
      creditHealth: creditHealth === "all" ? undefined : creditHealth,
      limit: 300,
    }),
    enabled: !!user,
  });
  const erpCustomers = useMemo(() => erpQuery.data ?? [], [erpQuery.data]);

  // App Consigners
  const [appSearch, setAppSearch] = useState("");
  const appQuery = useQuery({
    queryKey: queryKeys.appConsigners({ search: appSearch }),
    queryFn: () => listAppConsigners({ search: appSearch || undefined, limit: 300 }),
    enabled: !!user,
  });
  const appConsigners = appQuery.data?.items ?? [];
  const appTotal = appQuery.data?.total ?? 0;

  return (
    <div className="p-4 sm:p-6 space-y-4">
      <PageHeader title="Customers" description="Manage ERP enterprise customers and app consigners" />

      {/* Stat Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <KpiCard label="ERP Customers" value={erpCustomers.length.toLocaleString("en-IN")} />
        <KpiCard label="App Consigners" value={appTotal.toLocaleString("en-IN")} />
        <KpiCard label="Active (ERP)" value={erpCustomers.filter((c) => c.active).length.toLocaleString("en-IN")} />
        <KpiCard label="Total Outstanding" value={formatCurrency(erpCustomers.reduce((s, c) => s + c.outstandingAmount, 0))} />
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as "erp" | "app")}>
        <TabsList className="bg-gray-100 h-8">
          <TabsTrigger value="erp" className="text-xs h-7 data-[state=active]:bg-white">
            ERP Customers ({erpCustomers.length})
          </TabsTrigger>
          <TabsTrigger value="app" className="text-xs h-7 data-[state=active]:bg-white">
            App Consigners ({appTotal})
          </TabsTrigger>
        </TabsList>

        {/* ERP Customers Tab */}
        <TabsContent value="erp" className="mt-4 space-y-3">
          <div className="flex flex-col sm:flex-row gap-2">
            <div className="relative max-w-xs flex-1">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
              <Input placeholder="Search customers..." value={erpSearch}
                onChange={(e) => setErpSearch(e.target.value)} className="h-8 pl-8 text-sm" maxLength={FIELD_LIMITS.search} />
            </div>
            <Select value={status} onValueChange={(v) => setStatus(v as typeof status)}>
              <SelectTrigger className="h-8 w-[140px] text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="inactive">Inactive</SelectItem>
              </SelectContent>
            </Select>
            <Select value={creditHealth} onValueChange={(v) => setCreditHealth(v as typeof creditHealth)}>
              <SelectTrigger className="h-8 w-[160px] text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Credit</SelectItem>
                <SelectItem value="within_limit">Within Limit</SelectItem>
                <SelectItem value="over_limit">Over Limit</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <QueryState query={erpQuery} icon={Building2} emptyLabel="No ERP customers found." />
          {erpCustomers.length > 0 && (
            <>
              <div className="hidden sm:block">
                <Card><CardContent className="p-0"><ErpTable customers={erpCustomers} /></CardContent></Card>
              </div>
              <div className="sm:hidden space-y-2">
                {erpCustomers.map((c) => (
                  <Link key={c.id} href={`/customers/${c.id}`}>
                    <Card className="hover:bg-gray-50/50 transition-colors">
                      <CardContent className="p-3">
                        <div className="flex items-start justify-between">
                          <div>
                            <p className="text-sm font-medium text-gray-900">{c.name}</p>
                            <p className="text-xs text-gray-500">{c.gstin || "No GSTIN"}</p>
                          </div>
                          <Badge variant="outline" className={`text-[10px] border-0 ${c.active ? "bg-emerald-50 text-emerald-700" : "bg-gray-100 text-gray-500"}`}>
                            {c.active ? "Active" : "Inactive"}
                          </Badge>
                        </div>
                        <div className="mt-1.5 flex gap-3 text-[11px] text-gray-500">
                          <span>{c.activeTripsCount} trips</span>
                          <span>{formatCurrency(c.outstandingAmount)} outstanding</span>
                        </div>
                      </CardContent>
                    </Card>
                  </Link>
                ))}
              </div>
            </>
          )}
        </TabsContent>

        {/* App Consigners Tab */}
        <TabsContent value="app" className="mt-4 space-y-3">
          <div className="relative max-w-xs">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
            <Input placeholder="Search by name, phone..." value={appSearch}
              onChange={(e) => setAppSearch(e.target.value)} className="h-8 pl-8 text-sm" maxLength={FIELD_LIMITS.search} />
          </div>

          <QueryState query={appQuery} icon={Users} emptyLabel="No app consigners found." />
          {appConsigners.length > 0 && (
            <>
              <div className="hidden sm:block">
                <Card><CardContent className="p-0"><AppTable consigners={appConsigners} /></CardContent></Card>
              </div>
              <div className="sm:hidden space-y-2">
                {appConsigners.map((c) => (
                  <Card key={c.consignerId}>
                    <CardContent className="p-3">
                      <div className="flex items-start justify-between">
                        <div>
                          <p className="text-sm font-medium text-gray-900">{c.businessName}</p>
                          <p className="text-xs text-gray-500">{c.fullName} · {c.phone}</p>
                          {c.city && <p className="text-[11px] text-gray-400">{c.city}{c.state ? `, ${c.state}` : ""}</p>}
                        </div>
                        <Badge variant="outline" className={`text-[10px] border-0 ${c.isVerified ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>
                          {c.isVerified ? "Verified" : "Unverified"}
                        </Badge>
                      </div>
                      <div className="mt-1.5 flex gap-3 text-[11px] text-gray-500">
                        <span>{c.totalTrips} trips</span>
                        <span>{c.activeTrips} active</span>
                        <span>{c.accountType}</span>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

/* ---------- ERP Table ---------- */

function ErpTable({ customers }: { customers: CustomerListItem[] }) {
  return (
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
        {customers.map((c) => {
          const util = c.creditLimit > 0 ? (c.outstandingAmount / c.creditLimit) * 100 : null;
          return (
            <tr key={c.id} className="hover:bg-gray-50/50 transition-colors">
              <td className="px-4 py-3">
                <Link href={`/customers/${c.id}`} className="font-medium text-blue-600 hover:underline">{c.name}</Link>
                <p className="text-[11px] text-gray-400">{c.gstin || "No GSTIN"}</p>
              </td>
              <td className="px-4 py-3 text-gray-600">{c.salesOwnerName || "—"}</td>
              <td className="px-4 py-3 text-gray-600">{c.activeTripsCount}</td>
              <td className="px-4 py-3 text-gray-900 font-medium">{formatCurrency(c.outstandingAmount)}</td>
              <td className="px-4 py-3 text-gray-500">
                <p>{c.creditDays}d / {formatCurrency(c.creditLimit)}</p>
                {util != null && <p className="text-[11px] text-gray-400 mt-0.5">{Math.round(util)}% used</p>}
              </td>
              <td className="px-4 py-3">
                <Badge variant="outline" className={`text-[10px] border-0 ${c.active ? "bg-emerald-50 text-emerald-700" : "bg-gray-100 text-gray-500"}`}>
                  {c.active ? "Active" : "Inactive"}
                </Badge>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

/* ---------- App Table ---------- */

function AppTable({ consigners }: { consigners: AppConsigner[] }) {
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b border-gray-100 bg-gray-50/50">
          <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500">Name</th>
          <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500">Phone</th>
          <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500">Location</th>
          <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500">Type</th>
          <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500">Trips</th>
          <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500">Status</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-gray-50">
        {consigners.map((c) => (
          <tr key={c.consignerId} className="hover:bg-gray-50/50 transition-colors">
            <td className="px-4 py-3">
              <p className="font-medium text-gray-900">{c.businessName}</p>
              {c.businessName !== c.fullName && <p className="text-[11px] text-gray-400">{c.fullName}</p>}
            </td>
            <td className="px-4 py-3 text-gray-600">{c.phone}</td>
            <td className="px-4 py-3 text-gray-600">{c.city || "—"}{c.state ? `, ${c.state}` : ""}</td>
            <td className="px-4 py-3">
              <Badge variant="outline" className="text-[10px] border-0 bg-blue-50 text-blue-700">
                {c.accountType === "business" ? "Business" : "Individual"}
              </Badge>
            </td>
            <td className="px-4 py-3 text-gray-600">
              {c.totalTrips} total{c.activeTrips > 0 && <span className="text-emerald-600 ml-1">({c.activeTrips} active)</span>}
            </td>
            <td className="px-4 py-3">
              <Badge variant="outline" className={`text-[10px] border-0 ${c.isVerified ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>
                {c.isVerified ? "Verified" : "Unverified"}
              </Badge>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/* ---------- Query State ---------- */

function QueryState({
  query, icon: Icon, emptyLabel,
}: {
  query: { isLoading: boolean; isError: boolean; error: unknown; data?: unknown };
  icon: React.ComponentType<{ className?: string }>;
  emptyLabel: string;
}) {
  if (query.isLoading) return <Card><CardContent className="p-4 text-sm text-gray-500">Loading...</CardContent></Card>;
  if (query.isError) return <Card><CardContent className="p-4 text-sm text-red-600">{query.error instanceof Error ? query.error.message : "Error"}</CardContent></Card>;
  const data = query.data;
  const isEmpty = Array.isArray(data) ? data.length === 0 : data && typeof data === "object" && "items" in data ? (data as { items: unknown[] }).items.length === 0 : !data;
  if (isEmpty) {
    return <Card><CardContent className="p-6 text-center"><Icon className="h-8 w-8 text-gray-300 mx-auto mb-2" /><p className="text-sm text-gray-500">{emptyLabel}</p></CardContent></Card>;
  }
  return null;
}
