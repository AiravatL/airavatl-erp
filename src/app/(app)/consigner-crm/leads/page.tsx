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
import { listConsignerLeads } from "@/lib/api/consigner-crm";
import { queryKeys } from "@/lib/query/keys";
import { formatCurrency, formatDate } from "@/lib/formatters";
import { LEAD_STAGE_LABELS, LEAD_STAGES } from "@/lib/types";
import type { LeadStage } from "@/lib/types";
import { FIELD_LIMITS } from "@/lib/validation/client/field-limits";
import { Search, LayoutGrid, List, Plus } from "lucide-react";

const PRIORITY_COLORS: Record<string, string> = {
  high: "bg-red-50 text-red-700",
  medium: "bg-amber-50 text-amber-700",
  low: "bg-gray-100 text-gray-600",
};

const STAGE_COLORS: Record<LeadStage, string> = {
  new_enquiry: "bg-gray-100 text-gray-700",
  contacted: "bg-blue-50 text-blue-700",
  quote_sent: "bg-purple-50 text-purple-700",
  negotiation: "bg-amber-50 text-amber-700",
  won: "bg-emerald-50 text-emerald-700",
  lost: "bg-red-50 text-red-700",
};

export default function AllLeadsPage() {
  const { user } = useAuth();
  const [search, setSearch] = useState("");
  const [stageFilter, setStageFilter] = useState<string>("all");
  const [priorityFilter, setPriorityFilter] = useState<string>("all");

  const leadsQuery = useQuery({
    queryKey: queryKeys.consignerCrmLeads({
      view: "list",
      stage: stageFilter,
      search,
      priority: priorityFilter,
    }),
    queryFn: () =>
      listConsignerLeads({
        search: search || undefined,
        stage: stageFilter === "all" ? undefined : (stageFilter as LeadStage),
        priority: priorityFilter === "all" ? undefined : (priorityFilter as "high" | "medium" | "low"),
        limit: 500,
        offset: 0,
      }),
    enabled: !!user,
  });

  const filtered = leadsQuery.data ?? [];

  return (
    <div className="space-y-4">
      <PageHeader title="All Leads" description={`${filtered.length} leads`}>
        <div className="flex items-center gap-2">
          <div className="flex items-center rounded-md border border-gray-200 p-0.5">
            <Button size="sm" variant="ghost" className="h-7 px-2 text-xs text-gray-600" asChild>
              <Link href="/consigner-crm">
                <LayoutGrid className="h-3.5 w-3.5" />
                Board
              </Link>
            </Button>
            <Button size="sm" className="h-7 px-2 text-xs" asChild>
              <Link href="/consigner-crm/leads">
                <List className="h-3.5 w-3.5" />
                List
              </Link>
            </Button>
          </div>
          <Button size="sm" className="h-8 text-xs" asChild>
            <Link href="/consigner-crm/new">
              <Plus className="h-3.5 w-3.5" />
              Add Lead
            </Link>
          </Button>
        </div>
      </PageHeader>

      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative max-w-sm">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
          <Input placeholder="Search leads..." value={search} onChange={(e) => setSearch(e.target.value)} className="h-8 pl-8 text-sm" maxLength={FIELD_LIMITS.search} />
        </div>
        <Select value={stageFilter} onValueChange={setStageFilter}>
          <SelectTrigger className="w-[160px] h-8 text-sm">
            <SelectValue placeholder="Stage" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Stages</SelectItem>
            {LEAD_STAGES.map((s) => (
              <SelectItem key={s} value={s}>{LEAD_STAGE_LABELS[s]}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={priorityFilter} onValueChange={setPriorityFilter}>
          <SelectTrigger className="w-[140px] h-8 text-sm">
            <SelectValue placeholder="Priority" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Priority</SelectItem>
            <SelectItem value="high">High</SelectItem>
            <SelectItem value="medium">Medium</SelectItem>
            <SelectItem value="low">Low</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {leadsQuery.isLoading && (
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-gray-500">Loading leads...</p>
          </CardContent>
        </Card>
      )}

      {!leadsQuery.isLoading && leadsQuery.isError && (
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-red-600">
              {leadsQuery.error instanceof Error ? leadsQuery.error.message : "Unable to fetch leads"}
            </p>
          </CardContent>
        </Card>
      )}

      {!leadsQuery.isLoading && !leadsQuery.isError && (
        <>
          {/* Desktop table */}
          <div className="hidden sm:block">
            <Card>
              <CardContent className="p-0">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100 bg-gray-50/50">
                      <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500">Company</th>
                      <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500">Contact</th>
                      <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500">Route</th>
                      <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500">Value</th>
                      <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500">Stage</th>
                      <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500">Priority</th>
                      <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500">Follow-up</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {filtered.map((l) => (
                      <tr key={l.id} className="hover:bg-gray-50/50 transition-colors">
                        <td className="px-4 py-3">
                          <Link href={`/consigner-crm/${l.id}`} className="font-medium text-blue-600 hover:underline">{l.companyName}</Link>
                        </td>
                        <td className="px-4 py-3 text-gray-600">
                          <p>{l.contactPerson}</p>
                          <p className="text-[11px] text-gray-400">{l.phone}</p>
                        </td>
                        <td className="px-4 py-3 text-gray-600">{l.route}</td>
                        <td className="px-4 py-3 text-gray-900 font-medium">{formatCurrency(l.estimatedValue)}</td>
                        <td className="px-4 py-3">
                          <Badge variant="outline" className={`border-0 text-[10px] ${STAGE_COLORS[l.stage]}`}>
                            {LEAD_STAGE_LABELS[l.stage]}
                          </Badge>
                        </td>
                        <td className="px-4 py-3">
                          <Badge variant="outline" className={`border-0 text-[10px] ${PRIORITY_COLORS[l.priority]}`}>
                            {l.priority}
                          </Badge>
                        </td>
                        <td className="px-4 py-3 text-xs text-gray-500">
                          {l.nextFollowUp ? formatDate(l.nextFollowUp) : "-"}
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
            {filtered.map((l) => (
              <Link key={l.id} href={`/consigner-crm/${l.id}`}>
                <Card className="hover:bg-gray-50/50 transition-colors">
                  <CardContent className="p-3">
                    <div className="flex items-start justify-between mb-1">
                      <div>
                        <p className="text-sm font-medium text-gray-900">{l.companyName}</p>
                        <p className="text-[11px] text-gray-500">{l.contactPerson}</p>
                      </div>
                      <Badge variant="outline" className={`border-0 text-[10px] ${STAGE_COLORS[l.stage]}`}>
                        {LEAD_STAGE_LABELS[l.stage]}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-3 mt-2 text-xs text-gray-500">
                      <span className="font-medium text-gray-700">{formatCurrency(l.estimatedValue)}</span>
                      <span>{l.route}</span>
                      <Badge variant="outline" className={`border-0 text-[10px] ${PRIORITY_COLORS[l.priority]}`}>
                        {l.priority}
                      </Badge>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
