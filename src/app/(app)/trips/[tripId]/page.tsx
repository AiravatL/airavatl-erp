"use client";

import { use, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { StatusBadge } from "@/components/shared/status-badge";
import { useAuth } from "@/lib/auth/auth-context";
import {
  acceptTripRequest,
  getTripPaymentSummary,
  getTripById,
  listTripLoadingProofs,
  listTripPaymentRequests,
  listTripTimeline,
} from "@/lib/api/trips";
import { listTickets, type TicketItem } from "@/lib/api/tickets";
import { queryKeys } from "@/lib/query/keys";
import {
  TRIP_STAGE_LABELS,
  TRIP_STAGES,
  type ExpenseEntry,
  type OdometerCheckpoint,
  type QuoteVersion,
  type Ticket,
} from "@/lib/types";
import { ArrowLeft, Loader2, CheckCircle2, Pencil, Truck, Send, Wallet } from "lucide-react";
import { OverviewTab } from "./overview-tab";
import { QuoteTab } from "./quote-tab";
import { DocsTab } from "./docs-tab";
import { PaymentsTab } from "./payments-tab";
import { ExpensesTab } from "./expenses-tab";
import { CheckpointsTab } from "./checkpoints-tab";
import { TicketsTab } from "./tickets-tab";
import { TimelineTab } from "./timeline-tab";
import { ConfirmTripDialog } from "./confirm-trip-dialog";
import { AssignVehicleDialog } from "./assign-vehicle-dialog";
import { LoadingProofUploadDialog } from "./loading-proof-upload-dialog";
import { PodProofUploadDialog } from "./pod-proof-upload-dialog";
import { AdvanceRequestDialog } from "./advance-request-dialog";
import { FinalPaymentRequestDialog } from "./final-payment-request-dialog";

function mapTicketItemToTripTicket(ticket: TicketItem): Ticket {
  return {
    id: ticket.id,
    tripId: ticket.tripId,
    tripCode: ticket.tripCode,
    issueType: ticket.issueType,
    title: ticket.title,
    description: ticket.description,
    status: ticket.status,
    assignedTo: ticket.assignedToId,
    assignedToName: ticket.assignedToName,
    assignedRole: ticket.assignedRole as Ticket["assignedRole"],
    createdBy: ticket.createdById,
    createdByName: ticket.createdByName ?? "Unknown",
    resolvedById: ticket.resolvedById,
    resolvedByName: ticket.resolvedByName,
    resolvedAt: ticket.resolvedAt,
    sourceType: ticket.sourceType,
    sourceId: ticket.sourceId,
    createdAt: ticket.createdAt,
    updatedAt: ticket.updatedAt,
  };
}

export default function TripDetailPage({ params }: { params: Promise<{ tripId: string }> }) {
  const { tripId } = use(params);
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [showAssignDialog, setShowAssignDialog] = useState(false);
  const [showLoadingProofDialog, setShowLoadingProofDialog] = useState(false);
  const [showPodProofDialog, setShowPodProofDialog] = useState(false);
  const [showAdvanceDialog, setShowAdvanceDialog] = useState(false);
  const [showFinalDialog, setShowFinalDialog] = useState(false);

  const tripQuery = useQuery({
    queryKey: queryKeys.trip(tripId),
    queryFn: () => getTripById(tripId),
    enabled: !!user,
  });

  const acceptMutation = useMutation({
    mutationFn: () => acceptTripRequest(tripId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.trip(tripId) });
      await queryClient.invalidateQueries({ queryKey: ["trips", "list"] });
      await queryClient.invalidateQueries({ queryKey: queryKeys.tripTimeline(tripId) });
    },
  });

  const loadingProofsQuery = useQuery({
    queryKey: queryKeys.tripLoadingProofs(tripId),
    queryFn: () => listTripLoadingProofs(tripId),
    enabled: !!user,
  });

  const paymentRequestsQuery = useQuery({
    queryKey: queryKeys.tripPaymentRequests(tripId),
    queryFn: () => listTripPaymentRequests(tripId),
    enabled: !!user,
  });

  const paymentSummaryQuery = useQuery({
    queryKey: queryKeys.tripPaymentSummary(tripId),
    queryFn: () => getTripPaymentSummary(tripId),
    enabled: !!user,
  });
  const tripTicketsQuery = useQuery({
    queryKey: queryKeys.tickets({
      search: tripQuery.data?.tripCode ?? "",
      status: "all",
      limit: 200,
      offset: 0,
    }),
    queryFn: () =>
      listTickets({
        search: tripQuery.data?.tripCode ?? "",
        status: "all",
        limit: 200,
        offset: 0,
      }),
    enabled: !!user && Boolean(tripQuery.data?.tripCode),
  });
  const tripTimelineQuery = useQuery({
    queryKey: queryKeys.tripTimeline(tripId),
    queryFn: () => listTripTimeline(tripId),
    enabled: !!user,
  });

  if (tripQuery.isLoading) {
    return (
      <div className="p-6 flex items-center gap-2 text-sm text-gray-500">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading trip...
      </div>
    );
  }

  if (tripQuery.isError || !tripQuery.data) {
    return (
      <div className="p-6 text-center">
        <p className="text-sm text-red-600">
          {tripQuery.error instanceof Error ? tripQuery.error.message : "Trip not found"}
        </p>
        <Link href="/trips" className="text-sm text-blue-600 hover:underline mt-2 inline-block">
          Back to trips
        </Link>
      </div>
    );
  }

  const trip = tripQuery.data;
  const stageIndex = TRIP_STAGES.indexOf(trip.currentStage);

  // Role-based controls
  const isOpsConsigner = user?.role === "operations_consigner";
  const isOpsVehicles = user?.role === "operations_vehicles";
  const isAdmin = user?.role === "admin" || user?.role === "super_admin";
  const isVehicleOpsOwner = isOpsVehicles && user?.id === trip.opsVehiclesOwnerId;
  const isOpsOrAdmin = isOpsConsigner || isAdmin;

  const isRequestReceived = trip.currentStage === "request_received";
  const isQuoted = trip.currentStage === "quoted";
  const isConfirmed = trip.currentStage === "confirmed";
  const isRequester = user?.id === trip.requestedById;

  const canAccept = isRequestReceived && isOpsOrAdmin;
  const canEdit = isRequestReceived && (isRequester || isAdmin);
  const canConfirm = isQuoted && isOpsOrAdmin;
  const canAssignVehicle = isConfirmed && (isOpsVehicles || isAdmin);
  const canRunVehicleOpsFlow = isAdmin || isVehicleOpsOwner;
  const loadingProofAllowedStages = new Set([
    "vehicle_assigned",
    "at_loading",
    "loaded_docs_ok",
    "advance_paid",
    "in_transit",
    "delivered",
  ]);
  const advanceAllowedStages = new Set([
    "vehicle_assigned",
    "at_loading",
    "loaded_docs_ok",
    "advance_paid",
    "in_transit",
  ]);

  const canUploadLoadingProof = canRunVehicleOpsFlow && loadingProofAllowedStages.has(trip.currentStage);
  const podProofAllowedStages = new Set(["in_transit", "delivered", "closed"]);
  const canUploadPodProof = canRunVehicleOpsFlow && podProofAllowedStages.has(trip.currentStage);
  const advanceRequests = (paymentRequestsQuery.data ?? [])
    .filter((payment) => payment.type === "advance")
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  const latestAdvanceRequest = advanceRequests[0] ?? null;
  const hasAnyAdvanceRequest = advanceRequests.length > 0;
  const canCreateAdvance =
    canRunVehicleOpsFlow &&
    advanceAllowedStages.has(trip.currentStage) &&
    !hasAnyAdvanceRequest;
  const paymentSummary = paymentSummaryQuery.data ?? null;
  const hasActiveFinalRequest = paymentRequestsQuery.data?.some(
    (payment) => payment.type === "balance" && (payment.status === "pending" || payment.status === "approved"),
  ) ?? false;
  const canCreateFinal =
    canRunVehicleOpsFlow &&
    Boolean(paymentSummary) &&
    (paymentSummary?.paidAdvanceTotal ?? 0) > 0 &&
    (paymentSummary?.suggestedFinalAmount ?? 0) > 0 &&
    !hasActiveFinalRequest &&
    !paymentSummary?.isTripCompleted;

  let paymentActionHint: string | null = null;
  if (canRunVehicleOpsFlow && !canCreateAdvance && !canCreateFinal) {
    if (paymentSummary?.isTripCompleted || trip.currentStage === "closed") {
      paymentActionHint = "Trip is already completed.";
    } else if (hasAnyAdvanceRequest && (paymentSummary?.paidAdvanceTotal ?? 0) <= 0) {
      if (latestAdvanceRequest?.status === "rejected") {
        paymentActionHint = "Advance request was rejected.";
      } else if (latestAdvanceRequest?.status === "on_hold") {
        paymentActionHint = "Advance request is on hold.";
      } else if (latestAdvanceRequest?.status === "approved") {
        paymentActionHint = "Advance request approved. Waiting for accounts to mark payment.";
      } else {
        paymentActionHint = "Advance request sent. Waiting for accounts/admin review.";
      }
    } else if ((paymentSummary?.paidAdvanceTotal ?? 0) <= 0) {
      paymentActionHint = "Final payment request is available only after advance is marked paid by accounts.";
    } else if ((paymentSummary?.suggestedFinalAmount ?? 0) <= 0) {
      paymentActionHint = "No final amount is pending for this trip.";
    } else if (hasActiveFinalRequest) {
      paymentActionHint = "A final payment request is already pending review.";
    }
  } else if (!canRunVehicleOpsFlow) {
    paymentActionHint = "Only assigned vehicle ops owner or admin can create payment requests.";
  }

  const finalDefaultPaymentMethod =
    latestAdvanceRequest?.paymentMethod === "upi" ? "upi" : "bank";
  const finalDefaultUpiId =
    finalDefaultPaymentMethod === "upi" ? (latestAdvanceRequest?.upiId ?? "") : "";
  const finalDefaultUpiQrObjectKey =
    finalDefaultPaymentMethod === "upi" ? (latestAdvanceRequest?.upiQrObjectKey ?? "") : "";

  // TODO(backend): wire quote versions API for trip detail.
  const quotes: QuoteVersion[] = [];
  const docs = loadingProofsQuery.data ?? [];
  const payments = paymentRequestsQuery.data ?? [];
  // TODO(backend): wire expense entries API for trip detail.
  const expenses: ExpenseEntry[] = [];
  // TODO(backend): wire odometer checkpoints API for trip detail.
  const checkpoints: OdometerCheckpoint[] = [];
  const tickets = (tripTicketsQuery.data?.items ?? [])
    .filter((ticket) => ticket.tripId === tripId)
    .map(mapTicketItemToTripTicket);
  const auditEntries = tripTimelineQuery.data ?? [];

  return (
    <div className="p-4 sm:p-6 space-y-4">
      {/* Header */}
      <div className="flex items-start gap-3">
        <Link href="/trips" className="mt-1 text-gray-400 hover:text-gray-600">
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2 mb-1">
            <h1 className="text-lg font-semibold text-gray-900">{trip.tripCode}</h1>
            <StatusBadge status={trip.currentStage} label={TRIP_STAGE_LABELS[trip.currentStage]} variant="stage" />
            {trip.leasedFlag && (
              <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-indigo-200 text-indigo-600">
                Leased
              </Badge>
            )}
          </div>
          <p className="text-sm text-gray-500">{trip.customerName} &middot; {trip.route || "No route"}</p>
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-2 shrink-0">
          {canEdit && (
            <Button size="sm" variant="outline" className="h-8 text-xs hidden sm:flex" asChild>
              <Link href={`/trips/${tripId}/edit`}>
                <Pencil className="h-3.5 w-3.5 mr-1" />
                Edit Request
              </Link>
            </Button>
          )}
          {canAccept && (
            <Button
              size="sm"
              className="h-8 text-xs hidden sm:flex"
              onClick={() => acceptMutation.mutate()}
              disabled={acceptMutation.isPending}
            >
              {acceptMutation.isPending ? (
                <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
              ) : (
                <CheckCircle2 className="h-3.5 w-3.5 mr-1" />
              )}
              Accept Request
            </Button>
          )}
          {canConfirm && (
            <Button
              size="sm"
              className="h-8 text-xs hidden sm:flex"
              onClick={() => setShowConfirmDialog(true)}
            >
              <Send className="h-3.5 w-3.5 mr-1" />
              Confirm & Request Vehicle
            </Button>
          )}
          {canAssignVehicle && (
            <Button
              size="sm"
              className="h-8 text-xs hidden sm:flex"
              onClick={() => setShowAssignDialog(true)}
            >
              <Truck className="h-3.5 w-3.5 mr-1" />
              Assign Vehicle
            </Button>
          )}
          {canCreateAdvance && (
            <Button
              size="sm"
              variant="outline"
              className="h-8 text-xs hidden sm:flex"
              onClick={() => setShowAdvanceDialog(true)}
            >
              <Wallet className="h-3.5 w-3.5 mr-1" />
              Get Advance
            </Button>
          )}
          {canCreateFinal && (
            <Button
              size="sm"
              variant="outline"
              className="h-8 text-xs hidden sm:flex"
              onClick={() => setShowFinalDialog(true)}
            >
              <Wallet className="h-3.5 w-3.5 mr-1" />
              Get Final Payment
            </Button>
          )}
        </div>
      </div>

      {/* Accept error */}
      {acceptMutation.isError && (
        <Card>
          <CardContent className="p-3">
            <p className="text-sm text-red-600">
              {acceptMutation.error instanceof Error ? acceptMutation.error.message : "Failed to accept request"}
            </p>
          </CardContent>
        </Card>
      )}
      {(loadingProofsQuery.isError ||
        paymentRequestsQuery.isError ||
        paymentSummaryQuery.isError ||
        tripTicketsQuery.isError ||
        tripTimelineQuery.isError) && (
        <Card>
          <CardContent className="p-3 space-y-1">
            {loadingProofsQuery.isError && (
              <p className="text-sm text-red-600">
                {loadingProofsQuery.error instanceof Error
                  ? loadingProofsQuery.error.message
                  : "Failed to load trip proofs"}
              </p>
            )}
            {paymentRequestsQuery.isError && (
              <p className="text-sm text-red-600">
                {paymentRequestsQuery.error instanceof Error
                  ? paymentRequestsQuery.error.message
                  : "Failed to load payment requests"}
              </p>
            )}
            {paymentSummaryQuery.isError && (
              <p className="text-sm text-red-600">
                {paymentSummaryQuery.error instanceof Error
                  ? paymentSummaryQuery.error.message
                  : "Failed to load payment summary"}
              </p>
            )}
            {tripTicketsQuery.isError && (
              <p className="text-sm text-red-600">
                {tripTicketsQuery.error instanceof Error
                  ? tripTicketsQuery.error.message
                  : "Failed to load trip tickets"}
              </p>
            )}
            {tripTimelineQuery.isError && (
              <p className="text-sm text-red-600">
                {tripTimelineQuery.error instanceof Error
                  ? tripTimelineQuery.error.message
                  : "Failed to load trip timeline"}
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Stage progress */}
      <Card>
        <CardContent className="p-3">
          <div className="flex items-center gap-1 overflow-x-auto pb-1">
            {TRIP_STAGES.map((stage, i) => (
              <div key={stage} className="flex items-center shrink-0">
                <div
                  className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-medium ${
                    i <= stageIndex ? "bg-gray-900 text-white" : "bg-gray-100 text-gray-400"
                  }`}
                >
                  {i + 1}
                </div>
                {i < TRIP_STAGES.length - 1 && (
                  <div className={`h-0.5 w-4 sm:w-6 ${i < stageIndex ? "bg-gray-900" : "bg-gray-200"}`} />
                )}
              </div>
            ))}
          </div>
          <p className="text-[11px] text-gray-500 mt-1.5">
            Stage {stageIndex + 1} of {TRIP_STAGES.length}: {TRIP_STAGE_LABELS[trip.currentStage]}
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-medium text-gray-600">Vehicle Requirement</span>
            <Badge variant="outline" className="text-[10px] border-gray-200 bg-gray-50 text-gray-700">
              {trip.vehicleType || "Any type"}
            </Badge>
            <Badge variant="outline" className="text-[10px] border-gray-200 bg-gray-50 text-gray-700">
              {trip.vehicleLength || "Any length"}
            </Badge>
          </div>
        </CardContent>
      </Card>

      {/* Tabs */}
      <Tabs defaultValue="overview">
        <TabsList className="w-full justify-start overflow-x-auto bg-transparent border-b border-gray-200 rounded-none h-auto p-0 gap-0">
          {[
            { value: "overview", label: "Overview" },
            { value: "quote", label: "Quote" },
            { value: "docs", label: "Docs" },
            { value: "payments", label: "Payments" },
            ...(trip.leasedFlag
              ? [
                  { value: "expenses", label: "Expenses" },
                  { value: "checkpoints", label: "Checkpoints" },
                ]
              : []),
            { value: "tickets", label: `Tickets (${tickets.length})` },
            { value: "timeline", label: "Timeline" },
          ].map((tab) => (
            <TabsTrigger
              key={tab.value}
              value={tab.value}
              className="rounded-none border-b-2 border-transparent data-[state=active]:border-gray-900 data-[state=active]:bg-transparent data-[state=active]:shadow-none px-3 py-2 text-xs font-medium text-gray-500 data-[state=active]:text-gray-900"
            >
              {tab.label}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="overview" className="mt-4">
          <OverviewTab trip={trip} />
        </TabsContent>
        <TabsContent value="quote" className="mt-4">
          <QuoteTab quotes={quotes} />
        </TabsContent>
        <TabsContent value="docs" className="mt-4">
          <DocsTab
            proofs={docs}
            isLoading={loadingProofsQuery.isLoading}
            canUploadLoadingProof={canUploadLoadingProof}
            canUploadPodProof={canUploadPodProof}
            onUploadLoadingProof={() => setShowLoadingProofDialog(true)}
            onUploadPodProof={() => setShowPodProofDialog(true)}
          />
        </TabsContent>
        <TabsContent value="payments" className="mt-4">
          <PaymentsTab
            payments={payments}
            isLoading={paymentRequestsQuery.isLoading}
            paymentSummary={paymentSummary}
            summaryLoading={paymentSummaryQuery.isLoading}
            canCreateAdvance={canCreateAdvance}
            canCreateFinal={canCreateFinal}
            actionHint={paymentActionHint}
            onCreateAdvance={() => setShowAdvanceDialog(true)}
            onCreateFinal={() => setShowFinalDialog(true)}
          />
        </TabsContent>
        {trip.leasedFlag && (
          <>
            <TabsContent value="expenses" className="mt-4">
              <ExpensesTab expenses={expenses} />
            </TabsContent>
            <TabsContent value="checkpoints" className="mt-4">
              <CheckpointsTab checkpoints={checkpoints} />
            </TabsContent>
          </>
        )}
        <TabsContent value="tickets" className="mt-4">
          <TicketsTab tickets={tickets} />
        </TabsContent>
        <TabsContent value="timeline" className="mt-4">
          <TimelineTab entries={auditEntries} isLoading={tripTimelineQuery.isLoading} />
        </TabsContent>
      </Tabs>

      {/* Mobile action buttons */}
      <div className="fixed bottom-4 left-4 right-4 sm:hidden flex gap-2">
        {canEdit && (
          <Button variant="outline" className="flex-1 h-10 text-sm" asChild>
            <Link href={`/trips/${tripId}/edit`}>Edit Request</Link>
          </Button>
        )}
        {canAccept && (
          <Button
            className="flex-1 h-10 text-sm"
            onClick={() => acceptMutation.mutate()}
            disabled={acceptMutation.isPending}
          >
            {acceptMutation.isPending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
            Accept Request
          </Button>
        )}
        {canConfirm && (
          <Button className="flex-1 h-10 text-sm" onClick={() => setShowConfirmDialog(true)}>
            Confirm & Request Vehicle
          </Button>
        )}
        {canAssignVehicle && (
          <Button className="flex-1 h-10 text-sm" onClick={() => setShowAssignDialog(true)}>
            Assign Vehicle
          </Button>
        )}
        {canCreateAdvance && (
          <Button variant="outline" className="flex-1 h-10 text-sm" onClick={() => setShowAdvanceDialog(true)}>
            Get Advance
          </Button>
        )}
        {canCreateFinal && (
          <Button variant="outline" className="flex-1 h-10 text-sm" onClick={() => setShowFinalDialog(true)}>
            Get Final Payment
          </Button>
        )}
      </div>

      {/* Dialogs */}
      {showConfirmDialog && (
        <ConfirmTripDialog
          trip={trip}
          onClose={() => setShowConfirmDialog(false)}
          onSuccess={async () => {
            setShowConfirmDialog(false);
            await Promise.all([
              queryClient.invalidateQueries({ queryKey: queryKeys.trip(tripId) }),
              queryClient.invalidateQueries({ queryKey: ["trips", "list"] }),
              queryClient.invalidateQueries({ queryKey: queryKeys.tripTimeline(tripId) }),
            ]);
          }}
        />
      )}
      {showAssignDialog && (
        <AssignVehicleDialog
          tripId={tripId}
          vehicleType={trip.vehicleType}
          onClose={() => setShowAssignDialog(false)}
          onSuccess={async () => {
            setShowAssignDialog(false);
            await Promise.all([
              queryClient.invalidateQueries({ queryKey: queryKeys.trip(tripId) }),
              queryClient.invalidateQueries({ queryKey: ["trips", "list"] }),
              queryClient.invalidateQueries({ queryKey: queryKeys.tripTimeline(tripId) }),
            ]);
          }}
        />
      )}
      {showLoadingProofDialog && (
        <LoadingProofUploadDialog
          tripId={tripId}
          onClose={() => setShowLoadingProofDialog(false)}
          onSuccess={async () => {
            setShowLoadingProofDialog(false);
            await Promise.all([
              queryClient.invalidateQueries({ queryKey: queryKeys.tripLoadingProofs(tripId) }),
              queryClient.invalidateQueries({ queryKey: queryKeys.tripTimeline(tripId) }),
            ]);
          }}
        />
      )}
      {showPodProofDialog && (
        <PodProofUploadDialog
          tripId={tripId}
          onClose={() => setShowPodProofDialog(false)}
          onSuccess={async () => {
            setShowPodProofDialog(false);
            await Promise.all([
              queryClient.invalidateQueries({ queryKey: queryKeys.tripLoadingProofs(tripId) }),
              queryClient.invalidateQueries({ queryKey: queryKeys.tripTimeline(tripId) }),
            ]);
          }}
        />
      )}
      {showAdvanceDialog && (
        <AdvanceRequestDialog
          tripId={tripId}
          onClose={() => setShowAdvanceDialog(false)}
          onSuccess={async () => {
            setShowAdvanceDialog(false);
            await Promise.all([
              queryClient.invalidateQueries({ queryKey: queryKeys.tripPaymentRequests(tripId) }),
              queryClient.invalidateQueries({ queryKey: queryKeys.tripPaymentSummary(tripId) }),
              queryClient.invalidateQueries({ queryKey: queryKeys.trip(tripId) }),
              queryClient.invalidateQueries({ queryKey: ["trips", "list"] }),
              queryClient.invalidateQueries({ queryKey: queryKeys.tripTimeline(tripId) }),
            ]);
          }}
        />
      )}
      {showFinalDialog && paymentSummary && (
        <FinalPaymentRequestDialog
          tripId={tripId}
          suggestedAmount={paymentSummary.suggestedFinalAmount}
          tripAmount={paymentSummary.tripAmount}
          paidAdvanceTotal={paymentSummary.paidAdvanceTotal}
          initialPaymentMethod={finalDefaultPaymentMethod}
          initialUpiId={finalDefaultUpiId}
          initialUpiQrObjectKey={finalDefaultUpiQrObjectKey}
          onClose={() => setShowFinalDialog(false)}
          onSuccess={async () => {
            setShowFinalDialog(false);
            await Promise.all([
              queryClient.invalidateQueries({ queryKey: queryKeys.tripPaymentRequests(tripId) }),
              queryClient.invalidateQueries({ queryKey: queryKeys.tripPaymentSummary(tripId) }),
              queryClient.invalidateQueries({ queryKey: queryKeys.trip(tripId) }),
              queryClient.invalidateQueries({ queryKey: ["trips", "list"] }),
              queryClient.invalidateQueries({ queryKey: queryKeys.tripTimeline(tripId) }),
            ]);
          }}
        />
      )}
    </div>
  );
}
