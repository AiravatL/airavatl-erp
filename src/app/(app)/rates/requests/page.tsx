"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, CheckCircle2, Clock, ClipboardList, Loader2, MessageSquare, Plus, Truck, XCircle } from "lucide-react";
import { useAuth } from "@/lib/auth/auth-context";
import {
  decideRateRequestQuote,
  listRateRequests,
  submitRateRequestQuote,
  type SubmitRateRequestQuoteInput,
} from "@/lib/api/rate-requests";
import { queryKeys } from "@/lib/query/keys";
import type { RateCategory, RateRequest, Role } from "@/lib/types";
import { RATE_CATEGORY_LABELS } from "@/lib/types";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { sanitizeDecimalInput } from "@/lib/validation/client/validators";
import { sanitizeMultilineInput, sanitizeSingleLineInput } from "@/lib/validation/client/sanitizers";
import { FIELD_LIMITS } from "@/lib/validation/client/field-limits";

const REQUEST_ROLES: Role[] = ["sales_consigner", "operations_consigner", "admin", "super_admin"];
const PRICING_ROLES: Role[] = ["sales_vehicles", "operations_vehicles", "admin", "super_admin"];
const REVIEW_ROLES: Role[] = ["operations_vehicles", "admin", "super_admin"];

const STATUS_FILTERS = [
  { value: "all", label: "All" },
  { value: "open", label: "Open" },
  { value: "fulfilled", label: "Fulfilled" },
  { value: "cancelled", label: "Cancelled" },
] as const;

const REQUEST_STATUS_LABELS: Record<string, string> = {
  open: "Open",
  fulfilled: "Fulfilled",
  cancelled: "Cancelled",
};

const REQUEST_STATUS_COLORS: Record<string, string> = {
  open: "bg-amber-50 text-amber-700",
  fulfilled: "bg-emerald-50 text-emerald-700",
  cancelled: "bg-gray-100 text-gray-600",
};

const QUOTE_STATUS_LABELS: Record<string, string> = {
  pending_review: "Pending Review",
  approved: "Approved",
  rejected: "Rejected",
};

const QUOTE_STATUS_COLORS: Record<string, string> = {
  pending_review: "bg-blue-50 text-blue-700",
  approved: "bg-emerald-50 text-emerald-700",
  rejected: "bg-red-50 text-red-700",
};

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(value);
}

export default function RateRequestsPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const canRequest = Boolean(user && REQUEST_ROLES.includes(user.role));
  const canPrice = Boolean(user && PRICING_ROLES.includes(user.role));
  const canReview = Boolean(user && REVIEW_ROLES.includes(user.role));

  const [statusFilter, setStatusFilter] = useState<(typeof STATUS_FILTERS)[number]["value"]>("open");
  const [search, setSearch] = useState("");
  const [selectedForQuote, setSelectedForQuote] = useState<RateRequest | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const queryFilters = useMemo(
    () => ({
      status: statusFilter === "all" ? undefined : statusFilter,
      search: search.trim() || undefined,
      limit: 200,
      offset: 0,
    }),
    [search, statusFilter],
  );

  const requestsQuery = useQuery({
    queryKey: queryKeys.rateRequests(queryFilters),
    queryFn: () => listRateRequests(queryFilters),
    enabled: Boolean(user && (canRequest || canPrice)),
  });

  const quoteDecisionMutation = useMutation({
    mutationFn: ({ quoteId, action, reviewRemarks }: { quoteId: string; action: "approve" | "reject"; reviewRemarks?: string }) =>
      decideRateRequestQuote(quoteId, { action, reviewRemarks }),
    onSuccess: async () => {
      setActionError(null);
      await queryClient.invalidateQueries({ queryKey: ["rate-requests"] });
      await queryClient.invalidateQueries({ queryKey: ["rates", "approved"] });
      await queryClient.invalidateQueries({ queryKey: ["rates", "review"] });
    },
    onError: (error) => {
      setActionError(error instanceof Error ? error.message : "Unable to review quote");
    },
  });

  if (!user || (!canRequest && !canPrice)) {
    return (
      <EmptyState
        icon={ClipboardList}
        title="Access restricted"
        description="Rate requests are available to Consigner roles and Vehicle team roles."
      />
    );
  }

  const requests = requestsQuery.data ?? [];

  async function handleReject(request: RateRequest) {
    if (!request.latestQuoteId || !canReview) return;
    const reviewRemarks = window.prompt("Enter rejection reason:", "")?.trim() ?? "";
    if (!reviewRemarks) {
      setActionError("Rejection reason is required.");
      return;
    }
    try {
      await quoteDecisionMutation.mutateAsync({
        quoteId: request.latestQuoteId,
        action: "reject",
        reviewRemarks,
      });
    } catch {
      // Error message handled in mutation onError.
    }
  }

  return (
    <div className="space-y-4">
      <PageHeader title="Rate Requests" description="Track requests and pricing workflow">
        {canRequest && (
          <Button size="sm" className="h-8 text-xs" asChild>
            <Link href="/rates/request">
              <Plus className="mr-1 h-3.5 w-3.5" />
              Request Rate
            </Link>
          </Button>
        )}
      </PageHeader>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <Input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search by route or vehicle"
          className="h-9 text-sm sm:max-w-sm"
          maxLength={FIELD_LIMITS.search}
        />
        <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value as (typeof STATUS_FILTERS)[number]["value"])}>
          <SelectTrigger className="h-9 w-full text-sm sm:w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {STATUS_FILTERS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {actionError && (
        <Card>
          <CardContent className="p-3 text-sm text-red-600">{actionError}</CardContent>
        </Card>
      )}

      {requestsQuery.isLoading ? (
        <Card>
          <CardContent className="flex items-center gap-2 p-4 text-sm text-gray-500">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading rate requests...
          </CardContent>
        </Card>
      ) : requestsQuery.isError ? (
        <Card>
          <CardContent className="p-4 text-sm text-red-600">
            {requestsQuery.error instanceof Error ? requestsQuery.error.message : "Unable to load rate requests"}
          </CardContent>
        </Card>
      ) : requests.length === 0 ? (
        <EmptyState icon={ClipboardList} title="No requests" description="No rate requests match the current filters." />
      ) : (
        <div className="space-y-3">
          {requests.map((request) => {
            const canSubmitQuote = canPrice && request.status === "open" && request.latestQuoteStatus !== "pending_review";
            const canApproveLatest = canReview && request.latestQuoteStatus === "pending_review" && !!request.latestQuoteId;

            return (
              <Card key={request.id}>
                <CardContent className="space-y-3 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="space-y-1">
                      <div className="flex items-center gap-1.5 text-sm">
                        <span className="font-medium text-gray-900">{request.fromLocation}</span>
                        <ArrowRight className="h-3 w-3 text-gray-400" />
                        <span className="font-medium text-gray-900">{request.toLocation}</span>
                      </div>
                      <p className="flex items-center gap-1 text-xs text-gray-500">
                        <Truck className="h-3.5 w-3.5" />
                        {request.vehicleType} • {RATE_CATEGORY_LABELS[request.rateCategory as RateCategory]}
                      </p>
                      <p className="text-xs text-gray-500">
                        Requested by {request.requestedByName} ({request.requestedByRole})
                      </p>
                    </div>

                    <div className="flex flex-wrap gap-1.5">
                      <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium", REQUEST_STATUS_COLORS[request.status] ?? "bg-gray-100 text-gray-700")}>
                        {REQUEST_STATUS_LABELS[request.status] ?? request.status}
                      </span>
                      {request.latestQuoteStatus && (
                        <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium", QUOTE_STATUS_COLORS[request.latestQuoteStatus] ?? "bg-gray-100 text-gray-700")}>
                          {QUOTE_STATUS_LABELS[request.latestQuoteStatus] ?? request.latestQuoteStatus}
                        </span>
                      )}
                    </div>
                  </div>

                  {request.notes && (
                    <p className="rounded-md border border-gray-200 bg-gray-50 px-2.5 py-2 text-xs text-gray-600">
                      <MessageSquare className="mr-1 inline h-3.5 w-3.5 text-gray-400" />
                      {request.notes}
                    </p>
                  )}

                  <div className="grid grid-cols-1 gap-2 text-xs text-gray-500 sm:grid-cols-3">
                    <p>Created: {new Date(request.createdAt).toLocaleString()}</p>
                    <p>
                      Latest Quote: {request.latestFreightRate ? formatCurrency(request.latestFreightRate) : "Not quoted yet"}
                    </p>
                    <p>
                      Published Rate: {request.publishedRateId ? (
                        <Link href={`/rates/${request.publishedRateId}/edit`} className="text-blue-600 hover:underline">
                          View
                        </Link>
                      ) : "Not published"}
                    </p>
                  </div>

                  <div className="flex flex-wrap gap-2 border-t border-gray-100 pt-2">
                    {canSubmitQuote && (
                      <Button size="sm" className="h-8 text-xs" onClick={() => setSelectedForQuote(request)}>
                        <Plus className="mr-1 h-3.5 w-3.5" />
                        Add Quote
                      </Button>
                    )}

                    {canApproveLatest && (
                      <>
                        <Button
                          size="sm"
                          className="h-8 bg-emerald-600 text-xs hover:bg-emerald-700"
                          disabled={quoteDecisionMutation.isPending}
                          onClick={() => {
                            if (!request.latestQuoteId) return;
                            quoteDecisionMutation.mutate({ quoteId: request.latestQuoteId, action: "approve" });
                          }}
                        >
                          <CheckCircle2 className="mr-1 h-3.5 w-3.5" />
                          Approve Quote
                        </Button>

                        <Button
                          size="sm"
                          variant="outline"
                          className="h-8 text-xs"
                          disabled={quoteDecisionMutation.isPending}
                          onClick={() => handleReject(request)}
                        >
                          <XCircle className="mr-1 h-3.5 w-3.5" />
                          Reject Quote
                        </Button>
                      </>
                    )}

                    {request.latestQuoteStatus === "pending_review" && !canReview && (
                      <span className="inline-flex items-center rounded-md border border-blue-200 bg-blue-50 px-2 py-1 text-[11px] text-blue-700">
                        <Clock className="mr-1 h-3.5 w-3.5" />
                        Awaiting vehicle ops review
                      </span>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {selectedForQuote && (
        <AddQuoteDialog
          request={selectedForQuote}
          onClose={() => setSelectedForQuote(null)}
          onSuccess={async () => {
            setSelectedForQuote(null);
            await queryClient.invalidateQueries({ queryKey: ["rate-requests"] });
            await queryClient.invalidateQueries({ queryKey: ["rates", "approved"] });
            await queryClient.invalidateQueries({ queryKey: ["rates", "review"] });
          }}
        />
      )}
    </div>
  );
}

function AddQuoteDialog({
  request,
  onClose,
  onSuccess,
}: {
  request: RateRequest;
  onClose: () => void;
  onSuccess: () => Promise<void>;
}) {
  const [freightRate, setFreightRate] = useState("");
  const [ratePerTon, setRatePerTon] = useState("");
  const [ratePerKg, setRatePerKg] = useState("");
  const [confidenceLevel, setConfidenceLevel] = useState("");
  const [source, setSource] = useState("");
  const [remarks, setRemarks] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: (input: SubmitRateRequestQuoteInput) => submitRateRequestQuote(request.id, input),
    onError: (error) => {
      setLocalError(error instanceof Error ? error.message : "Unable to submit quote");
    },
  });

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setLocalError(null);

    const parsedFreight = Number(freightRate);
    const parsedPerTon = ratePerTon ? Number(ratePerTon) : null;
    const parsedPerKg = ratePerKg ? Number(ratePerKg) : null;

    if (!Number.isFinite(parsedFreight) || parsedFreight <= 0) {
      setLocalError("Freight rate must be a positive number.");
      return;
    }

    if (parsedPerTon !== null && (!Number.isFinite(parsedPerTon) || parsedPerTon < 0)) {
      setLocalError("Rate per ton must be non-negative.");
      return;
    }

    if (parsedPerKg !== null && (!Number.isFinite(parsedPerKg) || parsedPerKg < 0)) {
      setLocalError("Rate per kg must be non-negative.");
      return;
    }

    try {
      await mutation.mutateAsync({
        freightRate: parsedFreight,
        ratePerTon: parsedPerTon,
        ratePerKg: parsedPerKg,
        confidenceLevel: confidenceLevel ? (confidenceLevel as "low" | "medium" | "high") : null,
        source: source.trim() || null,
        remarks: remarks.trim() || null,
      });

      await onSuccess();
    } catch {
      // Error message handled in mutation onError.
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Add Quote</DialogTitle>
          <DialogDescription>
            {request.fromLocation} → {request.toLocation} • {request.vehicleType}
          </DialogDescription>
        </DialogHeader>

        <form className="space-y-3" onSubmit={handleSubmit}>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="space-y-1.5 sm:col-span-3">
              <Label>Freight Rate (₹) *</Label>
              <Input
                type="text"
                inputMode="decimal"
                value={freightRate}
                onChange={(event) => setFreightRate(sanitizeDecimalInput(event.target.value, {
                  maxIntegerDigits: FIELD_LIMITS.currencyDigits,
                  maxFractionDigits: 2,
                }))}
                placeholder="e.g. 85000"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Rate/Ton</Label>
              <Input
                type="text"
                inputMode="decimal"
                value={ratePerTon}
                onChange={(event) => setRatePerTon(sanitizeDecimalInput(event.target.value, {
                  maxIntegerDigits: FIELD_LIMITS.currencyDigits,
                  maxFractionDigits: 2,
                }))}
                placeholder="Optional"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Rate/Kg</Label>
              <Input
                type="text"
                inputMode="decimal"
                value={ratePerKg}
                onChange={(event) => setRatePerKg(sanitizeDecimalInput(event.target.value, {
                  maxIntegerDigits: FIELD_LIMITS.currencyDigits,
                  maxFractionDigits: 2,
                }))}
                placeholder="Optional"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Confidence</Label>
              <Select value={confidenceLevel} onValueChange={setConfidenceLevel}>
                <SelectTrigger>
                  <SelectValue placeholder="Optional" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="low">Low</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Source</Label>
            <Input
              value={source}
              onChange={(event) => setSource(sanitizeSingleLineInput(event.target.value, FIELD_LIMITS.source))}
              placeholder="Optional"
              maxLength={FIELD_LIMITS.source}
            />
          </div>

          <div className="space-y-1.5">
            <Label>Remarks</Label>
            <Textarea
              value={remarks}
              onChange={(event) => setRemarks(sanitizeMultilineInput(event.target.value, FIELD_LIMITS.remarks))}
              placeholder="Optional"
              maxLength={FIELD_LIMITS.remarks}
            />
          </div>

          {localError && (
            <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-600">{localError}</p>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
              Submit Quote
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
