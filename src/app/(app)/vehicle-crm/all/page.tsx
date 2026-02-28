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
import { listVehicleLeads } from "@/lib/api/vehicle-crm";
import { queryKeys } from "@/lib/query/keys";
import { formatCurrency, formatDate } from "@/lib/formatters";
import { VEHICLE_LEAD_STAGE_LABELS, VEHICLE_LEAD_STAGES } from "@/lib/types";
import type { VehicleLeadStage } from "@/lib/types";
import { FIELD_LIMITS } from "@/lib/validation/client/field-limits";
import { Search, LayoutGrid, List, Plus } from "lucide-react";

const STAGE_COLORS: Record<VehicleLeadStage, string> = {
  new_entry: "bg-gray-100 text-gray-700",
  contacted: "bg-blue-50 text-blue-700",
  docs_pending: "bg-amber-50 text-amber-700",
  onboarded: "bg-emerald-50 text-emerald-700",
  rejected: "bg-red-50 text-red-700",
};

export default function AllVehicleLeadsPage() {
  const { user } = useAuth();
  const [search, setSearch] = useState("");
  const [stageFilter, setStageFilter] = useState<string>("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const leadsQuery = useQuery({
    queryKey: queryKeys.vehicleCrmLeads({ view: "list" }),
    queryFn: () => listVehicleLeads({ limit: 500, offset: 0 }),
    enabled: !!user,
  });
  const visibleLeads = leadsQuery.data ?? [];
  const queryError =
    leadsQuery.error instanceof Error ? leadsQuery.error.message : "Unable to fetch vehicle leads";

  const filtered = visibleLeads.filter((v) => {
    if (search) {
      const q = search.toLowerCase();
      if (!v.driverName.toLowerCase().includes(q) && !v.vehicleRegistration.toLowerCase().includes(q) && !v.ownerName.toLowerCase().includes(q) && !v.mobile.includes(q)) return false;
    }
    if (stageFilter !== "all" && v.stage !== stageFilter) return false;
    if (typeFilter !== "all" && v.vehicleType !== typeFilter) return false;
    return true;
  });

  const vehicleTypes = [...new Set(visibleLeads.map((v) => v.vehicleType))];

  return (
    <div className="space-y-4">
      <PageHeader title="Vehicle Pipeline (List)" description={`${filtered.length} vehicle entries`}>
        <div className="flex items-center gap-2">
          <div className="flex items-center rounded-md border border-gray-200 p-0.5">
            <Button size="sm" variant="ghost" className="h-7 px-2 text-xs text-gray-600" asChild>
              <Link href="/vehicle-crm">
                <LayoutGrid className="h-3.5 w-3.5" />
                Board
              </Link>
            </Button>
            <Button size="sm" className="h-7 px-2 text-xs" asChild>
              <Link href="/vehicle-crm/all">
                <List className="h-3.5 w-3.5" />
                List
              </Link>
            </Button>
          </div>
          <Button size="sm" className="h-8 text-xs" asChild>
            <Link href="/vehicle-crm/new">
              <Plus className="h-3.5 w-3.5" />
              Add Vehicle
            </Link>
          </Button>
        </div>
      </PageHeader>

      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative max-w-sm">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
          <Input placeholder="Search driver, owner, vehicle..." value={search} onChange={(e) => setSearch(e.target.value)} className="h-8 pl-8 text-sm" maxLength={FIELD_LIMITS.search} />
        </div>
        <Select value={stageFilter} onValueChange={setStageFilter}>
          <SelectTrigger className="w-[160px] h-8 text-sm">
            <SelectValue placeholder="Stage" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Stages</SelectItem>
            {VEHICLE_LEAD_STAGES.map((s) => (
              <SelectItem key={s} value={s}>{VEHICLE_LEAD_STAGE_LABELS[s]}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-[150px] h-8 text-sm">
            <SelectValue placeholder="Vehicle Type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            {vehicleTypes.map((t) => (
              <SelectItem key={t} value={t}>{t}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {leadsQuery.isLoading && (
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-gray-500">Loading vehicle leads...</p>
          </CardContent>
        </Card>
      )}

      {!leadsQuery.isLoading && leadsQuery.isError && (
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-red-600">{queryError}</p>
          </CardContent>
        </Card>
      )}

      {/* Desktop table */}
      {!leadsQuery.isLoading && !leadsQuery.isError && <div className="hidden sm:block">
        <Card>
          <CardContent className="p-0">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50/50">
                  <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500">Driver</th>
                  <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500">Mobile</th>
                  <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500">Vehicle</th>
                  <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500">Route</th>
                  <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500">Rate</th>
                  <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500">Stage</th>
                  <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500">Follow-up</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filtered.map((v) => (
                  <tr key={v.id} className="hover:bg-gray-50/50 transition-colors">
                    <td className="px-4 py-3">
                      <Link href={`/vehicle-crm/${v.id}`} className="font-medium text-blue-600 hover:underline">{v.driverName}</Link>
                      {!v.isOwnerCumDriver && (
                        <p className="text-[11px] text-gray-400">Owner: {v.ownerName}</p>
                      )}
                      {v.isOwnerCumDriver && (
                        <p className="text-[11px] text-indigo-500">Owner Driver</p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-600 text-xs">{v.mobile}</td>
                    <td className="px-4 py-3 text-gray-600">
                      <p>{v.vehicleRegistration}</p>
                      <p className="text-[11px] text-gray-400">{v.vehicleType} &middot; {v.vehicleCapacity}</p>
                    </td>
                    <td className="px-4 py-3 text-gray-600 text-xs">{v.preferredRoute}</td>
                    <td className="px-4 py-3 text-gray-900 font-medium">{formatCurrency(v.marketRate)}</td>
                    <td className="px-4 py-3">
                      <Badge variant="outline" className={`border-0 text-[10px] ${STAGE_COLORS[v.stage]}`}>
                        {VEHICLE_LEAD_STAGE_LABELS[v.stage]}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-500">
                      {v.nextFollowUp ? formatDate(v.nextFollowUp) : "-"}
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-sm text-gray-400">
                      {user?.role === "sales_vehicles"
                        ? "No assigned vehicle leads found."
                        : "No vehicle leads found."}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </CardContent>
        </Card>
      </div>}

      {/* Mobile cards */}
      {!leadsQuery.isLoading && !leadsQuery.isError && <div className="sm:hidden space-y-2">
        {filtered.map((v) => (
          <Link key={v.id} href={`/vehicle-crm/${v.id}`}>
            <Card className="hover:bg-gray-50/50 transition-colors">
              <CardContent className="p-3">
                <div className="flex items-start justify-between mb-1">
                  <div>
                    <p className="text-sm font-medium text-gray-900">{v.driverName}</p>
                    <p className="text-[11px] text-gray-500">{v.vehicleRegistration} &middot; {v.vehicleType}</p>
                  </div>
                  <Badge variant="outline" className={`border-0 text-[10px] ${STAGE_COLORS[v.stage]}`}>
                    {VEHICLE_LEAD_STAGE_LABELS[v.stage]}
                  </Badge>
                </div>
                <div className="flex items-center gap-3 mt-2 text-xs text-gray-500">
                  <span className="font-medium text-gray-700">{formatCurrency(v.marketRate)}</span>
                  <span>{v.preferredRoute}</span>
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
        {filtered.length === 0 && (
          <Card>
            <CardContent className="p-4 text-center text-sm text-gray-400">
              {user?.role === "sales_vehicles"
                ? "No assigned vehicle leads found."
                : "No vehicle leads found."}
            </CardContent>
          </Card>
        )}
      </div>}
    </div>
  );
}
