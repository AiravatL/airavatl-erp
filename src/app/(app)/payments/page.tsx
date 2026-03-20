"use client";

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
import { formatCurrency, formatDate } from "@/lib/formatters";
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

function maskAccountNumber(accountNumber: string | null) {
  if (!accountNumber) return "N/A";
  if (accountNumber.length <= 4) return accountNumber;
  return `${"*".repeat(Math.max(0, accountNumber.length - 4))}${accountNumber.slice(-4)}`;
}

function isActionable(payment: PaymentQueueItem) {
  return payment.status === "pending" || payment.status === "approved" || payment.status === "processing";
}

function isPaid(payment: PaymentQueueItem) {
  return payment.status === "paid" || payment.status === "completed";
}

function isErpPayment(payment: PaymentQueueItem) {
  return payment.paymentMethod === "bank_transfer";
}

function QueueCard({
  payment,
  canMarkPaid,
  onMarkPaid,
}: {
  payment: PaymentQueueItem;
  canMarkPaid: boolean;
  onMarkPaid: (payment: PaymentQueueItem) => void;
}) {
  const showBankDetails = payment.paymentMethod === "bank" || payment.paymentMethod === "bank_transfer";
  const showUpiDetails = payment.paymentMethod === "upi";
  const erp = isErpPayment(payment);

  return (
    <Card>
      <CardContent className="p-3 sm:p-4">
        <div className="mb-2 flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="mb-1 flex items-center gap-2">
              <span className="text-sm font-semibold text-gray-900">{payment.tripCode}</span>
              <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] text-gray-600 capitalize">
                {payment.type.replace("_", " ")}
              </span>
              {erp && (
                <span className="rounded bg-indigo-50 px-1.5 py-0.5 text-[10px] text-indigo-600 font-medium">
                  ERP
                </span>
              )}
            </div>
            <p className="text-xs text-gray-500">Pay to: <span className="font-medium text-gray-900">{payment.beneficiary || "N/A"}</span></p>
          </div>

          <div className="text-right">
            <p className="text-sm font-semibold text-gray-900">{formatCurrency(payment.amount)}</p>
            <StatusBadge
              status={payment.status === "completed" ? "paid" : payment.status}
              label={STATUS_LABELS[payment.status] ?? payment.status}
              variant="payment"
            />
          </div>
        </div>

        {/* Payment Details */}
        <div className="rounded-md bg-gray-50 p-2.5 mb-2 space-y-1.5">
          {showBankDetails && (
            <>
              {payment.bankAccountHolder && (
                <div className="flex justify-between text-xs">
                  <span className="text-gray-500">Account Holder</span>
                  <span className="font-medium text-gray-900">{payment.bankAccountHolder}</span>
                </div>
              )}
              {payment.bankAccountNumber && (
                <div className="flex justify-between text-xs">
                  <span className="text-gray-500">Account Number</span>
                  <span className="font-medium text-gray-900">{payment.bankAccountNumber}</span>
                </div>
              )}
              {payment.bankIfsc && (
                <div className="flex justify-between text-xs">
                  <span className="text-gray-500">IFSC Code</span>
                  <span className="font-medium text-gray-900">{payment.bankIfsc}</span>
                </div>
              )}
              {payment.bankName && payment.bankName !== "" && (
                <div className="flex justify-between text-xs">
                  <span className="text-gray-500">Bank</span>
                  <span className="font-medium text-gray-900">{payment.bankName}</span>
                </div>
              )}
              {!payment.bankAccountNumber && !payment.bankAccountHolder && (
                <p className="text-xs text-amber-600">Bank details not available</p>
              )}
            </>
          )}
          {showUpiDetails && (
            <>
              {payment.upiId ? (
                <div className="flex justify-between text-xs">
                  <span className="text-gray-500">UPI ID</span>
                  <span className="font-medium text-gray-900">{payment.upiId}</span>
                </div>
              ) : (
                <p className="text-xs text-amber-600">UPI details not available</p>
              )}
            </>
          )}
          <div className="flex justify-between text-xs">
            <span className="text-gray-500">Created</span>
            <span className="text-gray-700">{formatDate(payment.createdAt)}</span>
          </div>
        </div>

        {payment.upiQrObjectKey && (
          <SignedImagePreview objectKey={payment.upiQrObjectKey} label="UPI QR" />
        )}

        {payment.paidProofObjectKey && (
          <SignedImagePreview objectKey={payment.paidProofObjectKey} label="Payment Proof" />
        )}

        {canMarkPaid && isActionable(payment) && (
          <div className="mt-2 flex items-center justify-between border-t border-gray-100 pt-2">
            <p className="text-[11px] text-gray-400">{payment.notes || ""}</p>
            <Button
              size="sm"
              className="h-7 gap-1 text-[11px]"
              onClick={() => onMarkPaid(payment)}
            >
              <Upload className="h-3 w-3" />
              Upload Proof &amp; Mark Paid
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
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

  const totalPendingAmount = pendingPayments.reduce((sum, payment) => sum + payment.amount, 0);
  const totalPaidAmount = paidHistory.reduce((sum, payment) => sum + (payment.paidAmount ?? payment.amount), 0);

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

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Card>
          <CardContent className="p-3">
            <p className="text-xs text-gray-500">Pending Payments</p>
            <p className="text-lg font-semibold text-amber-600">{pendingPayments.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <p className="text-xs text-gray-500">Pending Split</p>
            <p className="text-sm font-semibold text-blue-600">
              A: {pendingAdvanceCount} | F: {pendingFinalCount}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <p className="text-xs text-gray-500">Total Pending</p>
            <p className="text-sm font-semibold text-gray-900">{formatCurrency(totalPendingAmount)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <p className="text-xs text-gray-500">Total Paid</p>
            <p className="text-sm font-semibold text-emerald-700">{formatCurrency(totalPaidAmount)}</p>
          </CardContent>
        </Card>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
        <Input
          placeholder="Search by trip, beneficiary, requester..."
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
        <div className="space-y-2">
          {activeList.map((payment) => (
            <QueueCard
              key={payment.id}
              payment={payment}
              canMarkPaid={canManagePayments}
              onMarkPaid={setSelectedPayment}
            />
          ))}
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
