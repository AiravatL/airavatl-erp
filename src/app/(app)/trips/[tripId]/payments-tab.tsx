import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/empty-state";
import { StatusBadge } from "@/components/shared/status-badge";
import { formatCurrency, formatDate } from "@/lib/formatters";
import type { TripPaymentRequestItem, TripPaymentSummary } from "@/lib/api/trips";
import { CreditCard, Plus } from "lucide-react";

interface Props {
  payments: TripPaymentRequestItem[];
  isLoading: boolean;
  paymentSummary: TripPaymentSummary | null;
  summaryLoading: boolean;
  canCreateAdvance: boolean;
  canCreateFinal: boolean;
  actionHint: string | null;
  onCreateAdvance: () => void;
  onCreateFinal: () => void;
}

const TYPE_LABELS: Record<string, string> = {
  advance: "Advance",
  balance: "Balance",
  other: "Other",
};

const STATUS_LABELS: Record<string, string> = {
  pending: "Pending",
  approved: "Approved",
  on_hold: "On Hold",
  rejected: "Rejected",
  paid: "Paid",
};

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  bank: "Bank",
  upi: "UPI",
};

function FlowStep({ label, done }: { label: string; done: boolean }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className={`h-2 w-2 rounded-full ${done ? "bg-emerald-500" : "bg-gray-300"}`} />
      <span className={`text-[11px] ${done ? "text-emerald-700" : "text-gray-500"}`}>{label}</span>
    </div>
  );
}

export function PaymentsTab({
  payments,
  isLoading,
  paymentSummary,
  summaryLoading,
  canCreateAdvance,
  canCreateFinal,
  actionHint,
  onCreateAdvance,
  onCreateFinal,
}: Props) {
  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-4 text-sm text-gray-500">Loading payment requests...</CardContent>
      </Card>
    );
  }

  if (payments.length === 0) {
    return (
      <div className="space-y-3">
        {paymentSummary && (
          <Card>
            <CardContent className="p-3 grid gap-2 sm:grid-cols-3">
              <div>
                <p className="text-[11px] text-gray-500">Trip Total</p>
                <p className="text-sm font-semibold text-gray-900">{formatCurrency(paymentSummary.tripAmount)}</p>
              </div>
              <div>
                <p className="text-[11px] text-gray-500">Paid Advance</p>
                <p className="text-sm font-semibold text-gray-900">{formatCurrency(paymentSummary.paidAdvanceTotal)}</p>
              </div>
              <div>
                <p className="text-[11px] text-gray-500">Suggested Final</p>
                <p className="text-sm font-semibold text-gray-900">{formatCurrency(paymentSummary.suggestedFinalAmount)}</p>
              </div>
            </CardContent>
          </Card>
        )}
        <EmptyState
          icon={CreditCard}
          title="No payment requests"
          description="Create an advance request when trip funds are required."
          action={
            canCreateAdvance ? (
              <Button size="sm" className="h-8 gap-1 text-xs" onClick={onCreateAdvance}>
                <Plus className="h-3.5 w-3.5" />
                Get Advance
              </Button>
            ) : undefined
          }
        />
      </div>
    );
  }

  const hasAdvanceRequested = payments.some((payment) => payment.type === "advance");
  const hasFinalRequested = payments.some((payment) => payment.type === "balance");
  const hasFinalPaid = (paymentSummary?.paidBalanceTotal ?? 0) > 0;
  const isCompleted = Boolean(paymentSummary?.isTripCompleted || paymentSummary?.currentStage === "closed");
  const hasAdvancePaid = (paymentSummary?.paidAdvanceTotal ?? 0) > 0;

  return (
    <div className="space-y-2">
      <Card>
        <CardContent className="p-3 space-y-3">
          <div className="grid gap-2 sm:grid-cols-3">
            <div>
              <p className="text-[11px] text-gray-500">Trip Total</p>
              <p className="text-sm font-semibold text-gray-900">
                {summaryLoading ? "Loading..." : formatCurrency(paymentSummary?.tripAmount ?? 0)}
              </p>
            </div>
            <div>
              <p className="text-[11px] text-gray-500">Paid Advance</p>
              <p className="text-sm font-semibold text-gray-900">
                {summaryLoading ? "Loading..." : formatCurrency(paymentSummary?.paidAdvanceTotal ?? 0)}
              </p>
            </div>
            <div>
              <p className="text-[11px] text-gray-500">Suggested Final</p>
              <p className="text-sm font-semibold text-gray-900">
                {summaryLoading ? "Loading..." : formatCurrency(paymentSummary?.suggestedFinalAmount ?? 0)}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap gap-3 border-t border-gray-100 pt-2">
            <FlowStep label="Vehicle Assigned" done />
            <FlowStep label="Advance Requested" done={hasAdvanceRequested} />
            <FlowStep label="Advance Paid" done={hasAdvancePaid} />
            <FlowStep label="Final Requested" done={hasFinalRequested} />
            <FlowStep label="Final Paid" done={hasFinalPaid} />
            <FlowStep label="Completed" done={isCompleted} />
          </div>

          <div className="flex flex-wrap gap-2">
            {canCreateAdvance && (
              <Button size="sm" className="h-8 gap-1 text-xs" onClick={onCreateAdvance}>
                <Plus className="h-3.5 w-3.5" />
                Get Advance
              </Button>
            )}
            {canCreateFinal && (
              <Button size="sm" className="h-8 gap-1 text-xs" onClick={onCreateFinal}>
                <Plus className="h-3.5 w-3.5" />
                Get Final Payment
              </Button>
            )}
          </div>
          {actionHint && <p className="text-xs text-amber-700">{actionHint}</p>}
        </CardContent>
      </Card>

      {!canCreateAdvance && !canCreateFinal && actionHint && (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
          {actionHint}
        </div>
      )}

      {payments.map((payment) => (
        <Card key={payment.id}>
          <CardContent className="p-3">
            <div className="mb-2 flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="mb-0.5 flex items-center gap-2">
                  <span className="text-sm font-medium text-gray-900">{formatCurrency(payment.amount)}</span>
                  <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] text-gray-600">
                    {TYPE_LABELS[payment.type] ?? payment.type}
                  </span>
                  {payment.paymentMethod && (
                    <span className="rounded border border-gray-200 px-1.5 py-0.5 text-[10px] text-gray-600">
                      {PAYMENT_METHOD_LABELS[payment.paymentMethod] ?? payment.paymentMethod}
                    </span>
                  )}
                </div>
                <p className="truncate text-xs text-gray-500">Beneficiary: {payment.beneficiary}</p>
                {payment.paymentMethod === "upi" && payment.upiId && (
                  <p className="truncate text-xs text-gray-500">UPI: {payment.upiId}</p>
                )}
              </div>

              <StatusBadge
                status={payment.status}
                label={STATUS_LABELS[payment.status] ?? payment.status}
                variant="payment"
              />
            </div>

            {payment.notes && <p className="mb-2 text-xs text-gray-500">{payment.notes}</p>}

            <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-gray-400">
              <span>
                Requested by {payment.requestedByName || "Unknown"} on {formatDate(payment.createdAt)}
              </span>
              {payment.reviewedAt && (
                <span>
                  Reviewed by {payment.reviewedByName || "Unknown"} on {formatDate(payment.reviewedAt)}
                </span>
              )}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
