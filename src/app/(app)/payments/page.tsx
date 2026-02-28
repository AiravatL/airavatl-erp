"use client";

import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
  getPaymentObjectViewUrl,
  listPaymentQueue,
  type PaymentQueueItem,
} from "@/lib/api/payments";
import { FIELD_LIMITS } from "@/lib/validation/client/field-limits";
import { CreditCard, Eye, Loader2, Search, Upload } from "lucide-react";
import { MarkPaymentPaidDialog } from "./mark-payment-paid-dialog";

type PaymentQueueTab = "pending-payments" | "paid-history";

const STATUS_LABELS: Record<string, string> = {
  pending: "Pending",
  approved: "Approved",
  on_hold: "On Hold",
  rejected: "Rejected",
  paid: "Paid",
};

function maskAccountNumber(accountNumber: string | null) {
  if (!accountNumber) return "N/A";
  if (accountNumber.length <= 4) return accountNumber;
  return `${"*".repeat(Math.max(0, accountNumber.length - 4))}${accountNumber.slice(-4)}`;
}

function isActionable(payment: PaymentQueueItem) {
  return payment.status === "pending" || payment.status === "approved";
}

function objectKeyExtension(objectKey: string): string {
  const clean = objectKey.split("?")[0] ?? objectKey;
  const ext = clean.split(".").pop() ?? "";
  return ext.toLowerCase();
}

function isPdfObjectKey(objectKey: string): boolean {
  return objectKeyExtension(objectKey) === "pdf";
}

function SignedImagePreview({
  objectKey,
  label,
}: {
  objectKey: string;
  label: string;
}) {
  const [show, setShow] = useState(false);

  const previewQuery = useQuery({
    queryKey: ["payments", "object-view", objectKey],
    queryFn: () => getPaymentObjectViewUrl(objectKey),
    enabled: show,
    staleTime: 4 * 60_000,
    gcTime: 15 * 60_000,
  });
  const isPdf = isPdfObjectKey(objectKey);

  return (
    <>
      <div className="mt-2 flex items-center gap-2">
        <span className="text-xs text-gray-500">{label}</span>
        <Button
          size="sm"
          variant="outline"
          className="h-7 px-2 text-[11px]"
          onClick={() => setShow(true)}
          disabled={previewQuery.isLoading}
        >
          {previewQuery.isLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Eye className="h-3 w-3" />}
          <span className="ml-1">View</span>
        </Button>
      </div>

      <Dialog open={show} onOpenChange={setShow}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="text-base">{label}</DialogTitle>
          </DialogHeader>

          {previewQuery.isLoading && (
            <div className="flex h-56 items-center justify-center text-sm text-gray-500">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Loading preview...
            </div>
          )}

          {previewQuery.isError && (
            <p className="text-sm text-red-600">
              {previewQuery.error instanceof Error
                ? previewQuery.error.message
                : "Unable to load preview"}
            </p>
          )}

          {previewQuery.data?.viewUrl && !isPdf && (
            <div className="max-h-[70vh] overflow-auto rounded-md border border-gray-200 bg-gray-50 p-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={previewQuery.data.viewUrl}
                alt={label}
                className="mx-auto h-auto max-h-[64vh] w-auto rounded"
              />
            </div>
          )}

          {previewQuery.data?.viewUrl && isPdf && (
            <div className="space-y-2">
              <div className="h-[68vh] overflow-hidden rounded-md border border-gray-200 bg-gray-50">
                <iframe
                  src={previewQuery.data.viewUrl}
                  title={label}
                  className="h-full w-full"
                />
              </div>
              <div className="flex justify-end">
                <Button asChild size="sm" variant="outline" className="h-8 text-xs">
                  <a href={previewQuery.data.viewUrl} target="_blank" rel="noreferrer">
                    Open in new tab
                  </a>
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
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
  const showBankDetails = payment.paymentMethod === "bank";
  const showUpiDetails = payment.paymentMethod === "upi";

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
            </div>
            <p className="text-xs text-gray-500">Beneficiary: {payment.beneficiary || "N/A"}</p>
            <p className="text-xs text-gray-500">Trip Amount: {formatCurrency(payment.tripAmount ?? 0)}</p>
          </div>

          <div className="text-right">
            <p className="text-sm font-semibold text-gray-900">{formatCurrency(payment.amount)}</p>
            <StatusBadge
              status={payment.status}
              label={STATUS_LABELS[payment.status] ?? payment.status}
              variant="payment"
            />
          </div>
        </div>

        <div className="grid gap-2 text-xs text-gray-600 sm:grid-cols-2">
          <p>
            Method: <span className="font-medium text-gray-900 uppercase">{payment.paymentMethod ?? "N/A"}</span>
          </p>
          <p>
            Requested by: <span className="font-medium text-gray-900">{payment.requestedByName || "Unknown"}</span>
          </p>
          {showBankDetails && (
            <p>
              Bank: <span className="font-medium text-gray-900">{payment.bankName || "N/A"}</span>
            </p>
          )}
          {showBankDetails && (
            <p>
              A/C: <span className="font-medium text-gray-900">{maskAccountNumber(payment.bankAccountNumber)}</span>
            </p>
          )}
          {showUpiDetails && payment.upiId && (
            <p>
              UPI ID: <span className="font-medium text-gray-900">{payment.upiId}</span>
            </p>
          )}
          <p>
            Requested On: <span className="font-medium text-gray-900">{formatDate(payment.createdAt)}</span>
          </p>
          {payment.reviewedAt && (
            <p>
              Reviewed On: <span className="font-medium text-gray-900">{formatDate(payment.reviewedAt)}</span>
            </p>
          )}
        </div>

        {payment.upiQrObjectKey && (
          <SignedImagePreview objectKey={payment.upiQrObjectKey} label="UPI QR" />
        )}

        {payment.paidProofObjectKey && (
          <SignedImagePreview objectKey={payment.paidProofObjectKey} label="Payment Proof" />
        )}

        <div className="mt-3 flex items-center justify-between border-t border-gray-100 pt-2">
          <p className="text-[11px] text-gray-400">{payment.notes || "No notes"}</p>
          {canMarkPaid && isActionable(payment) && (
            <Button
              size="sm"
              className="h-7 gap-1 text-[11px]"
              onClick={() => onMarkPaid(payment)}
            >
              <Upload className="h-3 w-3" />
              Upload Proof + Mark Paid
            </Button>
          )}
        </div>
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
    () => pendingPayments.filter((payment) => payment.type === "balance").length,
    [pendingPayments],
  );
  const paidHistory = useMemo(
    () =>
      queue
        .filter((payment) => payment.status === "paid")
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
