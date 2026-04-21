"use client";

import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import { useDebouncedValue } from "@/lib/hooks/use-debounced-value";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/shared/empty-state";
import { SignedImagePreview } from "@/components/shared/signed-image-preview";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useAuth } from "@/lib/auth/auth-context";
import { formatCurrency, formatDate } from "@/lib/formatters";
import {
  listReceivablesByConsigner,
  getReceivablesSummary,
  recordCollection,
  getCollectionHistory,
  getConsignerOutstanding,
  bulkCollect,
  getReceivableCollectionProofUpload,
  prepareReceivableCollectionProofUpload,
  confirmReceivableCollectionProofUpload,
  getBulkReceivableCollectionProofUpload,
  prepareBulkReceivableCollectionProofUpload,
  confirmBulkReceivableCollectionProofUpload,
  type ReceivableCollectionProofSummary,
  type ConsignerReceivableGroup,
  type CollectionItem,
  type BulkCollectionResult,
} from "@/lib/api/receivables";
import { queryKeys } from "@/lib/query/keys";
import { KpiCard } from "@/components/reports/kpi-card";
import { CollectionProofUpload, hasReceivableCollectionProof } from "./_components/collection-proof-upload";
import {
  Loader2, Search, Receipt, IndianRupee, CheckCircle,
  ChevronDown, ChevronUp, Banknote, Building2, Download,
  ArrowDownWideNarrow,
} from "lucide-react";
import { cn } from "@/lib/utils";

type AgingBucket = "all" | "current" | "1-30" | "31-60" | "61-90" | "90+";
type SortKey = "outstanding_desc" | "outstanding_asc" | "most_overdue" | "oldest_due" | "newest_due";

const AGING_CHIPS: { value: AgingBucket; label: string }[] = [
  { value: "all", label: "All" },
  { value: "current", label: "Current" },
  { value: "1-30", label: "1–30d" },
  { value: "31-60", label: "31–60d" },
  { value: "61-90", label: "61–90d" },
  { value: "90+", label: "90+d" },
];

function matchesAging(daysOverdue: number, bucket: AgingBucket) {
  switch (bucket) {
    case "all": return true;
    case "current": return daysOverdue <= 0;
    case "1-30": return daysOverdue >= 1 && daysOverdue <= 30;
    case "31-60": return daysOverdue >= 31 && daysOverdue <= 60;
    case "61-90": return daysOverdue >= 61 && daysOverdue <= 90;
    case "90+": return daysOverdue > 90;
  }
}

function csvEscape(value: string | number | null | undefined): string {
  if (value == null) return "";
  const s = String(value);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

const STATUS_COLORS: Record<string, string> = {
  pending: "bg-amber-100 text-amber-700",
  partial: "bg-blue-100 text-blue-700",
  collected: "bg-emerald-100 text-emerald-700",
  written_off: "bg-gray-100 text-gray-500",
};

export default function ReceivablesPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const isAccounts = user?.role === "accounts" || user?.role === "admin" || user?.role === "super_admin";

  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search, 300);
  const [statusFilter, setStatusFilter] = useState("all");
  const [agingFilter, setAgingFilter] = useState<AgingBucket>("all");
  const [sortKey, setSortKey] = useState<SortKey>("outstanding_desc");

  // Collect dialog (per-trip)
  const [collectReceivableId, setCollectReceivableId] = useState<string | null>(null);
  const [collectInfo, setCollectInfo] = useState<{ tripNumber: string; consignerName: string; invoiceAmount: number; amountReceived: number; amountOutstanding: number } | null>(null);
  const [collectAmount, setCollectAmount] = useState("");
  const [collectDate, setCollectDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [collectMethod, setCollectMethod] = useState("bank_transfer");
  const [collectRef, setCollectRef] = useState("");
  const [collectNotes, setCollectNotes] = useState("");
  const [collectProof, setCollectProof] = useState<ReceivableCollectionProofSummary | undefined>(undefined);

  // Bulk dialog
  const [bulkConsigner, setBulkConsigner] = useState<ConsignerReceivableGroup | null>(null);
  const [bulkAmount, setBulkAmount] = useState("");
  const [bulkDate, setBulkDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [bulkMethod, setBulkMethod] = useState("bank_transfer");
  const [bulkRef, setBulkRef] = useState("");
  const [bulkNotes, setBulkNotes] = useState("");
  const [bulkResult, setBulkResult] = useState<BulkCollectionResult | null>(null);
  const [bulkProof, setBulkProof] = useState<ReceivableCollectionProofSummary | undefined>(undefined);

  // Expanded consigner
  const [expandedConsigner, setExpandedConsigner] = useState<string | null>(null);

  const summaryQuery = useQuery({
    queryKey: ["receivables", "summary"],
    queryFn: getReceivablesSummary,
    enabled: isAccounts,
    staleTime: 30_000,
    refetchInterval: 30_000,
  });

  const listQuery = useQuery({
    queryKey: ["receivables", "by-consigner", { search: debouncedSearch, status: statusFilter }],
    queryFn: () => listReceivablesByConsigner({
      search: debouncedSearch || undefined,
      status: statusFilter === "all" ? undefined : statusFilter,
    }),
    staleTime: 30_000,
    refetchInterval: 30_000,
    placeholderData: keepPreviousData,
  });

  const collectMutation = useMutation({
    mutationFn: () => {
      if (!collectReceivableId) throw new Error("No receivable selected");
      return recordCollection(collectReceivableId, {
        amount: Number(collectAmount),
        paymentDate: collectDate,
        paymentMethod: collectMethod,
        paymentReference: collectRef.trim() || undefined,
        proofObjectKey: collectProof?.objectKey ?? undefined,
        notes: collectNotes.trim() || undefined,
      });
    },
    onSuccess: () => {
      setCollectReceivableId(null);
      setCollectInfo(null);
      setCollectProof(undefined);
      setCollectAmount(""); setCollectRef(""); setCollectNotes("");
      queryClient.invalidateQueries({ queryKey: ["receivables"] });
    },
  });

  const bulkMutation = useMutation({
    mutationFn: () => {
      if (!bulkConsigner) throw new Error("No consigner");
      return bulkCollect({
        consignerProfileId: bulkConsigner.consigner_profile_id,
        totalAmount: Number(bulkAmount),
        paymentDate: bulkDate,
        paymentMethod: bulkMethod,
        paymentReference: bulkRef.trim() || undefined,
        proofObjectKey: bulkProof?.objectKey ?? undefined,
        notes: bulkNotes.trim() || undefined,
      });
    },
    onSuccess: (result) => {
      setBulkResult(result);
      queryClient.invalidateQueries({ queryKey: ["receivables"] });
    },
  });

  const consigners = listQuery.data ?? [];
  const summary = summaryQuery.data;

  // Apply the aging filter client-side and recompute group totals from
  // the filtered subset, then sort by the chosen key. Doing this client
  // side keeps the single list RPC unchanged; volumes are small enough
  // (groups of trips per consigner) that it's not a perf concern.
  const processedConsigners = useMemo(() => {
    const filtered = agingFilter === "all"
      ? consigners
      : consigners
          .map((cg) => {
            const matching = cg.receivables.filter((r) => matchesAging(r.days_overdue, agingFilter));
            if (matching.length === 0) return null;
            const total_outstanding = matching.reduce((s, r) => s + r.amount_outstanding, 0);
            const total_received = matching.reduce((s, r) => s + r.amount_received, 0);
            const total_invoiced = matching.reduce((s, r) => s + r.invoice_amount, 0);
            const total_holding = matching.reduce((s, r) => s + (r.holding_amount ?? 0), 0);
            const overdue = matching.filter(
              (r) => (r.status === "pending" || r.status === "partial") && r.days_overdue > 0,
            );
            return {
              ...cg,
              receivables: matching,
              trip_count: matching.length,
              total_outstanding,
              total_received,
              total_invoiced,
              total_holding,
              overdue_count: overdue.length,
              overdue_amount: overdue.reduce((s, r) => s + r.amount_outstanding, 0),
            } as ConsignerReceivableGroup;
          })
          .filter((cg): cg is ConsignerReceivableGroup => cg !== null);

    const sorted = [...filtered];
    sorted.sort((a, b) => {
      switch (sortKey) {
        case "outstanding_desc":
          return b.total_outstanding - a.total_outstanding;
        case "outstanding_asc":
          return a.total_outstanding - b.total_outstanding;
        case "most_overdue": {
          const aMax = Math.max(0, ...a.receivables.map((r) => r.days_overdue));
          const bMax = Math.max(0, ...b.receivables.map((r) => r.days_overdue));
          return bMax - aMax;
        }
        case "oldest_due": {
          const aMin = a.receivables.reduce(
            (min, r) => (r.due_date < min ? r.due_date : min),
            a.receivables[0]?.due_date ?? "",
          );
          const bMin = b.receivables.reduce(
            (min, r) => (r.due_date < min ? r.due_date : min),
            b.receivables[0]?.due_date ?? "",
          );
          return aMin.localeCompare(bMin);
        }
        case "newest_due": {
          const aMax = a.receivables.reduce(
            (max, r) => (r.due_date > max ? r.due_date : max),
            a.receivables[0]?.due_date ?? "",
          );
          const bMax = b.receivables.reduce(
            (max, r) => (r.due_date > max ? r.due_date : max),
            b.receivables[0]?.due_date ?? "",
          );
          return bMax.localeCompare(aMax);
        }
        default:
          return 0;
      }
    });
    return sorted;
  }, [consigners, agingFilter, sortKey]);

  function exportCsv() {
    const header = [
      "Consigner", "Trip Number", "Pickup", "Delivery",
      "Invoice Amount", "Holding Amount", "Amount Received", "Amount Outstanding",
      "Status", "Due Date", "Days Overdue",
    ];
    const rows: string[] = [header.map(csvEscape).join(",")];
    for (const cg of processedConsigners) {
      for (const r of cg.receivables) {
        rows.push([
          cg.consigner_name,
          r.trip_number,
          r.pickup_city,
          r.delivery_city,
          r.invoice_amount,
          r.holding_amount ?? 0,
          r.amount_received,
          r.amount_outstanding,
          r.status,
          r.due_date,
          r.days_overdue,
        ].map(csvEscape).join(","));
      }
    }
    const blob = new Blob([rows.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `receivables-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  function openCollect(receivable: ConsignerReceivableGroup["receivables"][0], consignerName: string) {
    setCollectReceivableId(receivable.id);
    setCollectInfo({ tripNumber: receivable.trip_number, consignerName, invoiceAmount: receivable.invoice_amount, amountReceived: receivable.amount_received, amountOutstanding: receivable.amount_outstanding });
    setCollectAmount(String(receivable.amount_outstanding));
    setCollectDate(new Date().toISOString().slice(0, 10));
    setCollectMethod("bank_transfer"); setCollectRef(""); setCollectNotes("");
    setCollectProof(undefined);
    collectMutation.reset();
  }

  function openBulk(cg: ConsignerReceivableGroup) {
    setBulkConsigner(cg);
    setBulkAmount(String(cg.total_outstanding));
    setBulkDate(new Date().toISOString().slice(0, 10));
    setBulkMethod("bank_transfer"); setBulkRef(""); setBulkNotes("");
    setBulkProof(undefined);
    setBulkResult(null); bulkMutation.reset();
  }

  function referencePlaceholder(method: string) {
    switch (method) {
      case "upi":
        return "UPI Ref / UTR";
      case "cheque":
        return "Cheque Number";
      case "bank_transfer":
        return "UTR / Bank Ref";
      case "cash":
        return "Receipt Number";
      default:
        return "Reference";
    }
  }

  return (
    <div className="space-y-4 p-4 sm:p-6">
      <PageHeader title="Receivables" description="Track consigner payments and collections" />

      {/* KPI Cards */}
      {summary && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <KpiCard label="Outstanding" value={formatCurrency(summary.total_outstanding)} helper={`${summary.receivables_count} receivable${summary.receivables_count !== 1 ? "s" : ""}`} />
          <KpiCard label="Overdue" value={formatCurrency(summary.total_overdue)} helper={`${summary.overdue_count} overdue`} />
          <KpiCard label="Collected This Month" value={formatCurrency(summary.total_collected_this_month)} />
          <Card>
            <CardContent className="p-3">
              <p className="text-xs text-gray-500">Aging</p>
              <div className="flex flex-wrap gap-x-2 gap-y-0.5 mt-1">
                {summary.aging_buckets.map((b) => (
                  <span key={b.bucket} className="text-[10px] text-gray-600">{b.bucket}: {formatCurrency(b.amount)}</span>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Filters — search + status + sort + export */}
      <div className="flex flex-wrap gap-2 items-center">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
          <Input placeholder="Search consigner or trip..." value={search}
            onChange={(e) => setSearch(e.target.value)} className="h-8 pl-8 text-sm" />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="h-8 w-[130px] text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="partial">Partial</SelectItem>
            <SelectItem value="overdue">Overdue</SelectItem>
            <SelectItem value="collected">Collected</SelectItem>
          </SelectContent>
        </Select>
        <Select value={sortKey} onValueChange={(v) => setSortKey(v as SortKey)}>
          <SelectTrigger className="h-8 w-[180px] text-xs gap-1">
            <ArrowDownWideNarrow className="h-3.5 w-3.5 text-gray-500" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="outstanding_desc">Most outstanding</SelectItem>
            <SelectItem value="outstanding_asc">Least outstanding</SelectItem>
            <SelectItem value="most_overdue">Most overdue</SelectItem>
            <SelectItem value="oldest_due">Oldest due date</SelectItem>
            <SelectItem value="newest_due">Newest due date</SelectItem>
          </SelectContent>
        </Select>
        <Button
          size="sm"
          variant="outline"
          className="h-8 text-xs gap-1.5 ml-auto"
          onClick={exportCsv}
          disabled={processedConsigners.length === 0}
        >
          <Download className="h-3.5 w-3.5" />
          Export CSV
        </Button>
      </div>

      {/* Aging bucket chips */}
      <div className="flex flex-wrap gap-1.5">
        {AGING_CHIPS.map((chip) => {
          const active = agingFilter === chip.value;
          return (
            <button
              key={chip.value}
              type="button"
              onClick={() => setAgingFilter(chip.value)}
              className={cn(
                "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                active
                  ? "border-gray-900 bg-gray-900 text-white"
                  : "border-gray-200 bg-white text-gray-700 hover:bg-gray-50",
              )}
            >
              {chip.label}
            </button>
          );
        })}
      </div>

      {/* Loading / Empty */}
      {listQuery.isLoading && (
        <Card><CardContent className="flex items-center gap-2 p-4 text-sm text-gray-500"><Loader2 className="h-4 w-4 animate-spin" /> Loading...</CardContent></Card>
      )}
      {!listQuery.isLoading && processedConsigners.length === 0 && (
        <EmptyState
          icon={Receipt}
          title={consigners.length === 0 ? "No receivables" : "Nothing matches"}
          description={
            consigners.length === 0
              ? "Receivables appear when ERP trips complete."
              : "No receivables match this filter — try switching to All."
          }
        />
      )}

      {/* Consigner Cards — 2 columns on lg+ so the card's horizontal space
          is actually used (was 80% dead whitespace). Expanded card goes
          full-width so the trip list has room to breathe. */}
      <div className="grid gap-3 lg:grid-cols-2">
      {processedConsigners.map((cg) => {
        const isExpanded = expandedConsigner === cg.consigner_profile_id;
        const hasOverdue = (cg.overdue_count ?? 0) > 0;
        const pendingRecv = cg.receivables.filter((r) => r.status === "pending" || r.status === "partial");
        const maxOverdue = cg.receivables.reduce(
          (m, r) => (r.days_overdue > m ? r.days_overdue : m),
          0,
        );

        return (
          <Card
            key={cg.consigner_profile_id}
            className={cn(hasOverdue && "border-red-200")}
          >
            <CardContent className="p-3 space-y-2">
              {/* Row 1: name + amount */}
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <Building2 className="h-4 w-4 text-gray-400 shrink-0" />
                    <span className="text-sm font-semibold text-gray-900 truncate">
                      {cg.consigner_name}
                    </span>
                    <span className="text-[10px] text-gray-400">
                      {cg.trip_count} trip{cg.trip_count !== 1 ? "s" : ""}
                    </span>
                    {hasOverdue && (
                      <Badge variant="outline" className="border-0 text-[10px] bg-red-100 text-red-700">
                        {cg.overdue_count} overdue
                      </Badge>
                    )}
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-base font-bold text-gray-900 leading-tight">
                    {formatCurrency(cg.total_outstanding)}
                  </p>
                  <p className="text-[10px] text-gray-400">
                    of {formatCurrency(cg.total_invoiced)}
                  </p>
                </div>
              </div>

              {/* Row 2: progress bar (collection %) */}
              {cg.total_invoiced > 0 && (
                <div className="h-1.5 w-full rounded-full bg-gray-100">
                  <div
                    className="h-1.5 rounded-full bg-emerald-500 transition-all"
                    style={{
                      width: `${Math.min((cg.total_received / cg.total_invoiced) * 100, 100)}%`,
                    }}
                  />
                </div>
              )}

              {/* Row 3: inline stats grid + actions */}
              <div className="flex items-end justify-between gap-2">
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 text-[11px] min-w-0">
                  {cg.total_received > 0 && (
                    <span className="text-emerald-600 whitespace-nowrap">
                      <span className="text-gray-400 font-normal">Received </span>
                      {formatCurrency(cg.total_received)}
                    </span>
                  )}
                  {maxOverdue > 0 && (
                    <span className="text-red-600 whitespace-nowrap">
                      <span className="text-gray-400 font-normal">Max overdue </span>
                      {maxOverdue}d
                    </span>
                  )}
                  {cg.total_holding > 0 && (
                    <span className="text-amber-700 whitespace-nowrap">
                      <span className="text-gray-400 font-normal">Holding </span>
                      {formatCurrency(cg.total_holding)}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  {isAccounts && cg.total_outstanding > 0 && (
                    <Button
                      size="sm"
                      className="h-7 text-[11px] gap-1"
                      onClick={() => openBulk(cg)}
                    >
                      <Banknote className="h-3 w-3" /> Record
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 p-0"
                    onClick={() =>
                      setExpandedConsigner(isExpanded ? null : cg.consigner_profile_id)
                    }
                  >
                    {isExpanded ? (
                      <ChevronUp className="h-3.5 w-3.5" />
                    ) : (
                      <ChevronDown className="h-3.5 w-3.5" />
                    )}
                  </Button>
                </div>
              </div>

              {/* Expanded: individual receivables */}
              {isExpanded && (
                <div className="mt-2 pt-2 border-t border-gray-100 space-y-1.5">
                  {cg.receivables.map((r) => {
                    const isOverdue = r.days_overdue > 0 && r.status !== "collected" && r.status !== "written_off";
                    const statusColor = STATUS_COLORS[r.status] ?? "bg-gray-100 text-gray-700";
                    return (
                      <div key={r.id} className="flex items-center justify-between rounded-md bg-gray-50 px-3 py-2">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-medium text-gray-900">{r.trip_number}</span>
                            <Badge variant="outline" className={`border-0 text-[9px] ${statusColor}`}>
                              {r.status.charAt(0).toUpperCase() + r.status.slice(1)}
                            </Badge>
                            {isOverdue && <span className="text-[10px] text-red-600 font-medium">{r.days_overdue}d overdue</span>}
                          </div>
                          <p className="text-[10px] text-gray-400">{r.pickup_city} → {r.delivery_city} · Due: {formatDate(r.due_date)}</p>
                          {r.holding_amount > 0 && (
                            <p className="text-[10px] text-amber-700">
                              incl. {formatCurrency(r.holding_amount)} holding
                            </p>
                          )}
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <div className="text-right">
                            <p className="text-xs font-medium text-gray-900">{formatCurrency(r.amount_outstanding)}</p>
                            {r.amount_received > 0 && <p className="text-[10px] text-emerald-600">{formatCurrency(r.amount_received)} paid</p>}
                          </div>
                          {isAccounts && (r.status === "pending" || r.status === "partial") && (
                            <Button variant="ghost" size="sm" className="h-6 text-[10px] px-1.5"
                              onClick={() => openCollect(r, cg.consigner_name)}>
                              <IndianRupee className="h-2.5 w-2.5" />
                            </Button>
                          )}
                        </div>
                      </div>
                    );
                  })}

                  {/* Collection history for this consigner */}
                  <ConsignerCollectionHistory consignerId={cg.consigner_profile_id} receivables={cg.receivables} />
                </div>
              )}
            </CardContent>
          </Card>
        );
      })}
      </div>

      {/* Per-Trip Collect Dialog */}
      {collectReceivableId && collectInfo && (
        <Dialog open onOpenChange={(o) => { if (!o) { setCollectReceivableId(null); setCollectProof(undefined); collectMutation.reset(); } }}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="text-base">Record Payment</DialogTitle>
              <DialogDescription>
                Payment from {collectInfo.consignerName} for {collectInfo.tripNumber}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3 py-2">
              <div className="rounded-lg bg-gray-50 p-3 space-y-1">
                <div className="flex justify-between text-sm"><span className="text-gray-500">Invoice</span><span className="font-medium">{formatCurrency(collectInfo.invoiceAmount)}</span></div>
                <div className="flex justify-between text-sm"><span className="text-gray-500">Received</span><span className="font-medium text-emerald-700">{formatCurrency(collectInfo.amountReceived)}</span></div>
                <div className="flex justify-between text-sm border-t border-gray-200 pt-1"><span className="font-medium text-gray-500">Outstanding</span><span className="font-semibold">{formatCurrency(collectInfo.amountOutstanding)}</span></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1"><Label className="text-xs">Amount *</Label>
                  <Input type="text" inputMode="decimal" className="h-8 text-sm" value={collectAmount}
                    onChange={(e) => setCollectAmount(e.target.value.replace(/[^\d.]/g, ""))} /></div>
                <div className="space-y-1"><Label className="text-xs">Date *</Label>
                  <Input type="date" className="h-8 text-sm" value={collectDate} max={new Date().toISOString().slice(0, 10)}
                    onChange={(e) => setCollectDate(e.target.value)} /></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1"><Label className="text-xs">Method *</Label>
                  <Select value={collectMethod} onValueChange={setCollectMethod}>
                    <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="bank_transfer">Bank Transfer</SelectItem>
                      <SelectItem value="cheque">Cheque</SelectItem>
                      <SelectItem value="upi">UPI</SelectItem>
                      <SelectItem value="cash">Cash</SelectItem>
                      <SelectItem value="other">Other</SelectItem>
                    </SelectContent>
                  </Select></div>
                <div className="space-y-1"><Label className="text-xs">Reference</Label>
                  <Input className="h-8 text-sm" value={collectRef} onChange={(e) => setCollectRef(e.target.value)} placeholder={referencePlaceholder(collectMethod)} /></div>
              </div>
              <CollectionProofUpload
                queryKey={queryKeys.receivableCollectionProof(collectReceivableId)}
                uploadQueryFn={() => getReceivableCollectionProofUpload(collectReceivableId)}
                prepareUpload={(payload) => prepareReceivableCollectionProofUpload(collectReceivableId, payload)}
                confirmUpload={(payload) => confirmReceivableCollectionProofUpload(collectReceivableId, payload)}
                onSummaryChange={setCollectProof}
              />
              <div className="space-y-1"><Label className="text-xs">Notes</Label>
                <Input className="h-8 text-sm" value={collectNotes} onChange={(e) => setCollectNotes(e.target.value)} maxLength={500} /></div>
              {collectMutation.isError && <p className="text-sm text-red-600">{collectMutation.error instanceof Error ? collectMutation.error.message : "Failed"}</p>}
            </div>
            <DialogFooter>
              <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => { setCollectReceivableId(null); setCollectProof(undefined); }} disabled={collectMutation.isPending}>Cancel</Button>
              <Button size="sm" className="h-8 text-xs" disabled={!collectAmount || Number(collectAmount) <= 0 || !collectDate || !hasReceivableCollectionProof(collectProof) || collectMutation.isPending}
                onClick={() => collectMutation.mutate()}>
                {collectMutation.isPending ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Banknote className="h-3.5 w-3.5 mr-1" />}
                Record
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* Bulk Collect Dialog */}
      {bulkConsigner && (
        <Dialog open onOpenChange={(o) => { if (!o) { setBulkConsigner(null); setBulkProof(undefined); bulkMutation.reset(); setBulkResult(null); } }}>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle className="text-base">Record Payment — {bulkConsigner.consigner_name}</DialogTitle>
              <DialogDescription>
                {bulkConsigner.trip_count} trip{bulkConsigner.trip_count !== 1 ? "s" : ""} · {formatCurrency(bulkConsigner.total_outstanding)} outstanding
              </DialogDescription>
            </DialogHeader>

            {bulkResult ? (
              <div className="space-y-3 py-2">
                <div className="flex items-center gap-2 text-emerald-700"><CheckCircle className="h-5 w-5" /><span className="text-sm font-medium">Payment recorded</span></div>
                <div className="rounded-lg bg-gray-50 p-3 space-y-1.5 text-sm">
                  <div className="flex justify-between"><span className="text-gray-500">Amount</span><span className="font-medium">{formatCurrency(bulkResult.total_amount)}</span></div>
                  <div className="flex justify-between"><span className="text-gray-500">Allocated</span><span className="font-medium text-emerald-700">{formatCurrency(bulkResult.amount_allocated)}</span></div>
                  {bulkResult.amount_unallocated > 0 && (
                    <div className="flex justify-between"><span className="text-gray-500">Unallocated</span><span className="font-medium text-amber-600">{formatCurrency(bulkResult.amount_unallocated)}</span></div>
                  )}
                  <div className="flex justify-between border-t border-gray-200 pt-1"><span className="text-gray-500">Trips settled</span><span className="font-medium">{bulkResult.receivables_settled} / {bulkResult.collections_created}</span></div>
                </div>
                <div className="space-y-1">
                  <p className="text-[10px] text-gray-400 uppercase font-medium">Breakdown</p>
                  {bulkResult.allocations.map((a, i) => (
                    <div key={i} className="flex justify-between text-xs bg-gray-50 rounded px-2.5 py-1">
                      <span className="text-gray-700">{a.trip_number}</span>
                      <span className="font-medium">{formatCurrency(a.allocated)}</span>
                    </div>
                  ))}
                </div>
                <DialogFooter><Button size="sm" className="h-8 text-xs" onClick={() => { setBulkConsigner(null); setBulkProof(undefined); setBulkResult(null); }}>Done</Button></DialogFooter>
              </div>
            ) : (
              <div className="space-y-3 py-2">
                {/* Outstanding preview */}
                <div className="rounded-lg bg-gray-50 p-3 space-y-1">
                  <p className="text-[10px] text-gray-400 uppercase font-medium mb-1">Outstanding (oldest first — auto-allocated)</p>
                  <div className="max-h-36 overflow-y-auto space-y-0.5">
                    {bulkConsigner.receivables.filter((r) => r.status === "pending" || r.status === "partial").map((r) => (
                      <div key={r.id} className="flex justify-between text-xs">
                        <span className="text-gray-600">{r.trip_number} {r.days_overdue > 0 && <span className="text-red-500">({r.days_overdue}d)</span>}</span>
                        <span className="font-medium">{formatCurrency(r.amount_outstanding)}</span>
                      </div>
                    ))}
                  </div>
                  <div className="flex justify-between text-sm border-t border-gray-200 pt-1 mt-1">
                    <span className="font-medium text-gray-500">Total</span>
                    <span className="font-bold">{formatCurrency(bulkConsigner.total_outstanding)}</span>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1"><Label className="text-xs">Amount Received *</Label>
                    <Input type="text" inputMode="decimal" className="h-8 text-sm" value={bulkAmount}
                      onChange={(e) => setBulkAmount(e.target.value.replace(/[^\d.]/g, ""))} /></div>
                  <div className="space-y-1"><Label className="text-xs">Date *</Label>
                    <Input type="date" className="h-8 text-sm" value={bulkDate} max={new Date().toISOString().slice(0, 10)}
                      onChange={(e) => setBulkDate(e.target.value)} /></div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1"><Label className="text-xs">Method *</Label>
                    <Select value={bulkMethod} onValueChange={setBulkMethod}>
                      <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="bank_transfer">Bank Transfer</SelectItem>
                        <SelectItem value="cheque">Cheque</SelectItem>
                        <SelectItem value="upi">UPI</SelectItem>
                        <SelectItem value="cash">Cash</SelectItem>
                        <SelectItem value="other">Other</SelectItem>
                      </SelectContent>
                    </Select></div>
                  <div className="space-y-1"><Label className="text-xs">Reference</Label>
                    <Input className="h-8 text-sm" value={bulkRef} onChange={(e) => setBulkRef(e.target.value)} placeholder={referencePlaceholder(bulkMethod)} /></div>
                </div>
                <CollectionProofUpload
                  queryKey={queryKeys.receivableBulkCollectionProof(bulkConsigner.consigner_profile_id)}
                  uploadQueryFn={() => getBulkReceivableCollectionProofUpload(bulkConsigner.consigner_profile_id)}
                  prepareUpload={(payload) => prepareBulkReceivableCollectionProofUpload(bulkConsigner.consigner_profile_id, payload)}
                  confirmUpload={(payload) => confirmBulkReceivableCollectionProofUpload(bulkConsigner.consigner_profile_id, payload)}
                  onSummaryChange={setBulkProof}
                />
                <div className="space-y-1"><Label className="text-xs">Notes</Label>
                  <Input className="h-8 text-sm" value={bulkNotes} onChange={(e) => setBulkNotes(e.target.value)} maxLength={500} /></div>

                {Number(bulkAmount) > 0 && (
                  <p className="text-xs text-gray-500">
                    {Number(bulkAmount) >= bulkConsigner.total_outstanding
                      ? <span className="text-emerald-600">Will fully settle all outstanding receivables</span>
                      : <span>Will partially allocate (oldest first)</span>}
                  </p>
                )}
                {bulkMutation.isError && <p className="text-sm text-red-600">{bulkMutation.error instanceof Error ? bulkMutation.error.message : "Failed"}</p>}

                <DialogFooter>
                  <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => { setBulkConsigner(null); setBulkProof(undefined); }} disabled={bulkMutation.isPending}>Cancel</Button>
                  <Button size="sm" className="h-8 text-xs" disabled={!bulkAmount || Number(bulkAmount) <= 0 || !bulkDate || !hasReceivableCollectionProof(bulkProof) || bulkMutation.isPending}
                    onClick={() => bulkMutation.mutate()}>
                    {bulkMutation.isPending ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Banknote className="h-3.5 w-3.5 mr-1" />}
                    Record Payment
                  </Button>
                </DialogFooter>
              </div>
            )}
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

function ConsignerCollectionHistory({ consignerId, receivables }: { consignerId: string; receivables: ConsignerReceivableGroup["receivables"] }) {
  // Fetch collection history for all receivables of this consigner
  const paidReceivables = receivables.filter((r) => r.amount_received > 0);

  if (paidReceivables.length === 0) return null;

  return (
    <div className="mt-2 pt-2 border-t border-gray-100">
      <p className="text-[10px] text-gray-400 uppercase font-medium mb-1">Payment History</p>
      {paidReceivables.map((r) => (
        <CollectionHistoryForReceivable key={r.id} receivableId={r.id} tripNumber={r.trip_number} />
      ))}
    </div>
  );
}

function CollectionHistoryForReceivable({ receivableId, tripNumber }: { receivableId: string; tripNumber: string }) {
  const q = useQuery({
    queryKey: ["receivables", "collections", receivableId],
    queryFn: () => getCollectionHistory(receivableId),
    staleTime: 60_000,
  });

  if (q.isLoading || !q.data?.length) return null;

  return (
    <div className="space-y-0.5 mb-1">
      {q.data.map((c: CollectionItem) => (
        <div key={c.id} className="flex items-center justify-between text-[11px] bg-emerald-50 rounded px-2.5 py-1">
          <div className="flex items-center gap-1.5">
            <CheckCircle className="h-2.5 w-2.5 text-emerald-500 shrink-0" />
            <span className="text-gray-600">{tripNumber}</span>
            <span className="font-medium text-gray-900">{formatCurrency(c.amount)}</span>
            <span className="text-gray-400">via {c.payment_method.replace("_", " ")}</span>
            {c.payment_reference && <span className="text-gray-400">· {c.payment_reference}</span>}
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            {c.proof_object_key && (
              <SignedImagePreview objectKey={c.proof_object_key} label={`Collection proof — ${tripNumber}`} />
            )}
            <span className="text-gray-400">{formatDate(c.payment_date)}</span>
          </div>
        </div>
      ))}
    </div>
  );
}
