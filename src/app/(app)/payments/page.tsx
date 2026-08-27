"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { StatusBadge } from "@/components/shared/status-badge";
import { useAuth } from "@/lib/auth/auth-context";
import { formatCurrency } from "@/lib/formatters";
import { queryKeys } from "@/lib/query/keys";
import {
  listPaymentQueue,
  type PaymentQueueItem,
} from "@/lib/api/payments";
import { FIELD_LIMITS } from "@/lib/validation/client/field-limits";
import { SignedImagePreview } from "@/components/shared/signed-image-preview";
import { CreditCard, Loader2, Search, Upload } from "lucide-react";
import { MarkPaymentPaidDialog } from "./mark-payment-paid-dialog";

type PaymentQueueTab = "pending-payments" | "paid-history";

const STATUS_LABELS: Record<string, string> = {
  pending: "Pending",
  processing: "Processing",
  approved: "Approved",
  on_hold: "On Hold",
  rejected: "Rejected",
  paid: "Paid",
  completed: "Paid",
  failed: "Failed",
};

function isActionable(payment: PaymentQueueItem) {
  return payment.status === "pending" || payment.status === "approved" || payment.status === "processing";
}

function isPaid(payment: PaymentQueueItem) {
  return payment.status === "paid" || payment.status === "completed";
}

// Source now comes from the trip itself. It used to be inferred from
// paymentMethod === "bank_transfer", which worked only while ERP trips were the
// sole occupants of this queue — app-trip payouts also settle by bank transfer,
// so that proxy would label them "ERP".
function isErpPayment(payment: PaymentQueueItem) {
  return payment.tripSource !== "app";
}

/** driver_payment_method spells manual UPI "upi_manual"; older rows just "upi". */
function prefersUpi(payment: PaymentQueueItem) {
  return payment.paymentMethod === "upi" || payment.paymentMethod === "upi_manual";
}

function prefersBank(payment: PaymentQueueItem) {
  return payment.paymentMethod === "bank" || payment.paymentMethod === "bank_transfer";
}

interface SourceSplit {
  appCount: number;
  erpCount: number;
  appAmount: number;
  erpAmount: number;
}

/**
 * Counts and totals broken out by where the payout came from. App rows are
 * raised automatically when the consigner pays; ERP rows are raised by
 * operations. Accounts settles both, but only the app side arrives without a
 * person having asked for it — so it's the side that can quietly pile up.
 *
 * amountOf differs by tab: pending rows are worth their requested amount,
 * settled rows the amount actually paid.
 */
function splitBySource(
  items: PaymentQueueItem[],
  amountOf: (payment: PaymentQueueItem) => number,
): SourceSplit {
  const split: SourceSplit = { appCount: 0, erpCount: 0, appAmount: 0, erpAmount: 0 };
  for (const payment of items) {
    const amount = amountOf(payment);
    if (isErpPayment(payment)) {
      split.erpCount += 1;
      split.erpAmount += amount;
    } else {
      split.appCount += 1;
      split.appAmount += amount;
    }
  }
  return split;
}

/** APP/ERP chips under a KPI, in the same colours the queue cards use. */
function SourceSplitLine({
  app,
  erp,
  format,
}: {
  app: number;
  erp: number;
  format?: (value: number) => string;
}) {
  const render = format ?? ((value: number) => String(value));
  return (
    <div className="mt-1.5 flex flex-wrap items-center gap-1">
      <span
        className="rounded bg-[#E4D8FB] px-1.5 py-0.5 text-[10px] font-medium text-[#4C1D95]"
        title="Raised automatically when the consigner paid"
      >
        APP {render(app)}
      </span>
      <span
        className="rounded bg-indigo-50 px-1.5 py-0.5 text-[10px] font-medium text-indigo-600"
        title="Raised by operations"
      >
        ERP {render(erp)}
      </span>
    </div>
  );
}

export default function PaymentsPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState<PaymentQueueTab>("pending-payments");
  const [selectedPayment, setSelectedPayment] = useState<PaymentQueueItem | null>(null);

  const canManagePayments =
    user?.role === "accounts" || user?.role === "admin" || user?.role === "super_admin";

  const queueQuery = useQuery({
    queryKey: queryKeys.paymentsQueue({ search: search.trim() || undefined }),
    queryFn: () =>
      listPaymentQueue({
        search: search.trim() || undefined,
        limit: 200,
      }),
    enabled: canManagePayments,
    staleTime: 15_000,
    refetchInterval: 15_000,
    placeholderData: keepPreviousData,
  });

  const queue = useMemo(() => queueQuery.data ?? [], [queueQuery.data]);

  const pendingPayments = useMemo(
    () => queue.filter((payment) => isActionable(payment)),
    [queue],
  );
  const pendingAdvanceCount = useMemo(
    () => pendingPayments.filter((payment) => payment.type === "advance").length,
    [pendingPayments],
  );
  const pendingFinalCount = useMemo(
    () => pendingPayments.filter((payment) => payment.type === "final" || payment.type === "balance").length,
    [pendingPayments],
  );
  const paidHistory = useMemo(
    () =>
      queue
        .filter((payment) => isPaid(payment))
        .sort((a, b) => new Date(b.reviewedAt ?? b.createdAt).getTime() - new Date(a.reviewedAt ?? a.createdAt).getTime()),
    [queue],
  );


  const activeList = activeTab === "pending-payments" ? pendingPayments : paidHistory;

  const pendingSplit = useMemo(
    () => splitBySource(pendingPayments, (payment) => payment.amount),
    [pendingPayments],
  );
  const paidSplit = useMemo(
    () => splitBySource(paidHistory, (payment) => payment.paidAmount ?? payment.amount),
    [paidHistory],
  );

  const totalPendingAmount = pendingSplit.appAmount + pendingSplit.erpAmount;
  const totalPaidAmount = paidSplit.appAmount + paidSplit.erpAmount;

  if (!canManagePayments) {
    return (
      <div className="p-4 sm:p-6">
        <PageHeader title="Payments Queue" description="Accounts/Admin access only" />
        <Card>
          <CardContent className="p-6 text-sm text-gray-600">
            Payments queue actions are available only for `accounts`, `admin`, and `super_admin`.
            Vehicle ops should use the Trip Payments tab for `Get Advance` and `Get Final Payment`.
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-4 p-4 sm:p-6">
      <PageHeader title="Payments Queue" description="Accounts fulfillment workflow" />

      {/* h-full + flex so the APP/ERP chip lines sit on a common baseline even
          when one headline number wraps and its neighbours don't. */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Card className="h-full">
          <CardContent className="flex flex-1 flex-col p-3">
            <p className="text-xs text-gray-500">Pending Payments</p>
            <p className="text-lg font-semibold text-amber-600">{pendingPayments.length}</p>
            <div className="mt-auto">
              <SourceSplitLine app={pendingSplit.appCount} erp={pendingSplit.erpCount} />
            </div>
          </CardContent>
        </Card>
        <Card className="h-full">
          <CardContent className="flex flex-1 flex-col p-3">
            <p className="text-xs text-gray-500">Pending Split</p>
            <p className="text-sm font-semibold text-blue-600">
              A: {pendingAdvanceCount} | F: {pendingFinalCount}
            </p>
            <p className="mt-auto pt-1.5 text-[10px] text-gray-400">Advance / Final</p>
          </CardContent>
        </Card>
        <Card className="h-full">
          <CardContent className="flex flex-1 flex-col p-3">
            <p className="text-xs text-gray-500">Total Pending</p>
            <p className="text-sm font-semibold text-gray-900">{formatCurrency(totalPendingAmount)}</p>
            <div className="mt-auto">
              <SourceSplitLine
                app={pendingSplit.appAmount}
                erp={pendingSplit.erpAmount}
                format={formatCurrency}
              />
            </div>
          </CardContent>
        </Card>
        <Card className="h-full">
          <CardContent className="flex flex-1 flex-col p-3">
            <p className="text-xs text-gray-500">Total Paid</p>
            <p className="text-sm font-semibold text-emerald-700">{formatCurrency(totalPaidAmount)}</p>
            <div className="mt-auto">
              <SourceSplitLine
                app={paidSplit.appAmount}
                erp={paidSplit.erpAmount}
                format={formatCurrency}
              />
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
        <Input
          placeholder="Search by trip, beneficiary, consigner..."
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          className="h-8 pl-8 text-sm"
          maxLength={FIELD_LIMITS.search}
        />
      </div>

      <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as PaymentQueueTab)}>
        <TabsList className="grid h-auto w-full grid-cols-2 bg-transparent p-0">
          <TabsTrigger
            value="pending-payments"
            className="rounded-none border-b-2 border-transparent py-2 text-xs data-[state=active]:border-gray-900 data-[state=active]:bg-transparent"
          >
            Pending Payments ({pendingPayments.length})
          </TabsTrigger>
          <TabsTrigger
            value="paid-history"
            className="rounded-none border-b-2 border-transparent py-2 text-xs data-[state=active]:border-gray-900 data-[state=active]:bg-transparent"
          >
            Paid History ({paidHistory.length})
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {queueQuery.isLoading && (
        <Card>
          <CardContent className="flex items-center gap-2 p-4 text-sm text-gray-500">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading payments queue...
          </CardContent>
        </Card>
      )}

      {queueQuery.isError && (
        <Card>
          <CardContent className="p-4 text-sm text-red-600">
            {queueQuery.error instanceof Error ? queueQuery.error.message : "Unable to load payments queue"}
          </CardContent>
        </Card>
      )}

      {!queueQuery.isLoading && !queueQuery.isError && activeList.length === 0 && (
        <EmptyState
          icon={CreditCard}
          title="No payment requests"
          description={
            activeTab === "pending-payments"
              ? "No pending payments found."
              : "No paid records found."
          }
        />
      )}

      {!queueQuery.isLoading && !queueQuery.isError && activeList.length > 0 && (
        // Cards sit in a grid rather than one full-width column per trip. The
        // content is narrow — a trip code, a couple of amounts and a payout
        // destination — so a full-bleed row left most of the line empty and
        // pushed the queue off the fold.
        //
        // Cells stretch (the grid default) and each Card is h-full, so every
        // card in a row is the same height however much it carries. The payout
        // block is pushed to the bottom with mt-auto, which keeps the "Mark
        // Paid" buttons and destinations on a common line across the row
        // instead of floating at whatever height the text above ended.
        <div className="grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
          {(() => {
            // Group payments by trip
            const grouped = new Map<string, PaymentQueueItem[]>();
            for (const p of activeList) {
              const key = p.tripId || p.id;
              if (!grouped.has(key)) grouped.set(key, []);
              grouped.get(key)!.push(p);
            }
            return [...grouped.entries()].map(([tripId, payments]) => {
              const first = payments[0];
              const erp = isErpPayment(first);
              const route = first.pickupCity || first.deliveryCity
                ? `${first.pickupCity || "?"} → ${first.deliveryCity || "?"}`
                : null;
              // App payouts wear the partner app's purple so accounts can pick
              // them out at a glance — they arrive on their own, without an
              // operations person having raised anything.
              const surface = erp
                ? undefined
                : "border-[#D7C7F5] bg-[#F7F3FE]";
              const inset = erp ? "bg-gray-50" : "bg-white/70";
              return (
                <Card key={tripId} className={`h-full ${surface ?? ""}`}>
                  <CardContent className="flex flex-1 flex-col p-3 sm:p-4">
                    {/* Trip header — code + source tag + route */}
                    <div className="mb-1 flex flex-wrap items-center gap-x-2 gap-y-1">
                      <Link
                        href={`/trips/${tripId}`}
                        className="text-sm font-semibold text-gray-900 hover:text-primary"
                      >
                        {first.tripCode}
                      </Link>
                      <span
                        className={
                          erp
                            ? "rounded bg-indigo-50 px-1.5 py-0.5 text-[10px] font-medium text-indigo-600"
                            : "rounded bg-[#E4D8FB] px-1.5 py-0.5 text-[10px] font-medium text-[#4C1D95]"
                        }
                        title={
                          erp
                            ? "Raised by operations"
                            : "Raised automatically when the consigner paid"
                        }
                      >
                        {erp ? "ERP" : "APP"}
                      </span>
                      {route && (
                        <span className="truncate text-[11px] font-medium text-gray-700">
                          {route}
                        </span>
                      )}
                    </div>

                    <p className="mb-1 text-xs text-gray-500">
                      Pay to:{" "}
                      <span className="font-medium text-gray-900">
                        {first.beneficiary || "N/A"}
                      </span>
                    </p>

                    {/* Consigner info */}
                    {(first.consignerName || first.consignerBusinessName || first.consignerPhone) && (
                      <div className="mb-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-gray-500">
                        <span>
                          Consigner:{" "}
                          <span className="font-medium text-gray-700">
                            {first.consignerBusinessName || first.consignerName || "—"}
                          </span>
                          {first.consignerBusinessName && first.consignerName && (
                            <span className="text-gray-400"> · {first.consignerName}</span>
                          )}
                          {first.consignerPhone && (
                            <span className="text-gray-400"> · {first.consignerPhone}</span>
                          )}
                        </span>
                      </div>
                    )}

                    {/* Requester / Reviewer trail */}
                    <div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-gray-500">
                      {first.requestedByName && (
                        <span>
                          Requested by <span className="font-medium text-gray-700">{first.requestedByName}</span>
                          {first.requestedByRole && <span className="text-gray-400"> · {first.requestedByRole}</span>}
                        </span>
                      )}
                      {first.reviewedByName && (
                        <span>
                          Marked paid by <span className="font-medium text-gray-700">{first.reviewedByName}</span>
                          {first.reviewedByRole && <span className="text-gray-400"> · {first.reviewedByRole}</span>}
                        </span>
                      )}
                    </div>

                    {/* Payment rows inside this trip. mt-auto anchors this and
                        the payout block below to the bottom of the card, so
                        they line up across a row of unequal-length headers. */}
                    <div className="mt-auto space-y-1.5">
                      {payments.map((payment) => (
                        <div
                          key={payment.id}
                          className={`flex flex-wrap items-center justify-between gap-x-2 gap-y-1.5 rounded-md px-3 py-2 ${inset}`}
                        >
                          <div className="flex min-w-0 flex-wrap items-center gap-2">
                            <span className="rounded bg-gray-200 px-1.5 py-0.5 text-[10px] font-medium capitalize text-gray-600">{payment.type.replace("_", " ")}</span>
                            <span className="text-sm font-semibold text-gray-900">{formatCurrency(payment.amount)}</span>
                            <StatusBadge
                              status={payment.status === "completed" ? "paid" : payment.status}
                              label={STATUS_LABELS[payment.status] ?? payment.status}
                              variant="payment"
                            />
                          </div>
                          <div className="flex shrink-0 items-center gap-2">
                            {payment.paidProofObjectKey && (
                              <SignedImagePreview
                                objectKey={payment.paidProofObjectKey}
                                label="Proof"
                                mimeType={payment.paidProofMimeType}
                              />
                            )}
                            {canManagePayments && isActionable(payment) && (
                              <Button size="sm" className="h-7 gap-1 text-[11px]" onClick={() => setSelectedPayment(payment)}>
                                <Upload className="h-3 w-3" /> Mark Paid
                              </Button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Payout destination (show once per trip) */}
                    {(first.bankAccountNumber || first.upiId) && (
                      <div className={`mt-2 space-y-1 rounded-md p-2 text-xs ${inset}`}>
                        {first.bankAccountHolder && (
                          <div className="flex justify-between gap-2">
                            <span className="shrink-0 text-gray-500">
                              Account
                              {prefersBank(first) && <span className="ml-1 text-[#6D28D9]">· preferred</span>}
                            </span>
                            <span className="truncate font-medium text-gray-900">{first.bankAccountHolder} · {first.bankAccountNumber}</span>
                          </div>
                        )}
                        {first.bankIfsc && (
                          <div className="flex justify-between gap-2">
                            <span className="shrink-0 text-gray-500">IFSC</span>
                            <span className="truncate font-medium text-gray-900">{first.bankIfsc}</span>
                          </div>
                        )}
                        {first.upiId && (
                          <div className="flex justify-between gap-2">
                            <span className="shrink-0 text-gray-500">
                              UPI
                              {prefersUpi(first) && <span className="ml-1 text-[#6D28D9]">· preferred</span>}
                            </span>
                            <span className="truncate font-medium text-gray-900">{first.upiId}</span>
                          </div>
                        )}
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            });
          })()}
        </div>
      )}

      {selectedPayment && (
        <MarkPaymentPaidDialog
          payment={selectedPayment}
          onClose={() => setSelectedPayment(null)}
          onSuccess={async () => {
            setSelectedPayment(null);
            await queryClient.invalidateQueries({ queryKey: ["payments", "queue"] });
            await queryClient.invalidateQueries({ queryKey: ["trips", "list"] });
            await queryClient.invalidateQueries({ queryKey: ["trips"] });
          }}
        />
      )}
    </div>
  );
}
