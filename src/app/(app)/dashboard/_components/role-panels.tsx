"use client";

import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { queryKeys } from "@/lib/query/keys";
import { formatCurrency } from "@/lib/formatters";
import { listAppTrips } from "@/lib/api/app-reports";
import { listTripRequests } from "@/lib/api/trip-requests";
import {
  listPendingVerifications,
  listPendingPayoutOnboarding,
} from "@/lib/api/verification";
import { listPaymentQueue } from "@/lib/api/payments";
import { listTickets } from "@/lib/api/tickets";
import { DashboardPanel, PanelRow, RowChip } from "./dashboard-panel";
import {
  Truck, ClipboardList, ShieldCheck, Banknote, CreditCard, TicketCheck,
} from "lucide-react";

function prettify(s: string) {
  return s.split("_").map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join(" ");
}

const TRIP_STATUS_COLORS: Record<string, string> = {
  waiting_driver_acceptance: "bg-amber-100 text-amber-700",
  driver_assigned: "bg-blue-100 text-blue-700",
  en_route_to_pickup: "bg-cyan-100 text-cyan-700",
  at_pickup: "bg-cyan-100 text-cyan-700",
  loading: "bg-indigo-100 text-indigo-700",
  in_transit: "bg-purple-100 text-purple-700",
  at_delivery: "bg-purple-100 text-purple-700",
  unloading: "bg-violet-100 text-violet-700",
  waiting_for_advance: "bg-amber-100 text-amber-700",
  waiting_for_final: "bg-amber-100 text-amber-700",
};

const KIND_LABEL: Record<string, string> = {
  individual_driver: "Individual Driver",
  transporter: "Transporter",
  employee_driver: "Employee Driver",
  vehicle: "Vehicle",
};

const KIND_ACCENT: Record<string, "blue" | "purple" | "cyan" | "amber"> = {
  individual_driver: "blue",
  transporter: "purple",
  employee_driver: "cyan",
  vehicle: "amber",
};

function verificationHref(kind: string, id: string) {
  if (kind === "employee_driver") return `/verification/employee-driver/${id}`;
  if (kind === "vehicle") return `/verification/vehicle/${id}`;
  return `/verification/${id}`;
}

export function TripRequestsPanel() {
  const q = useQuery({
    queryKey: queryKeys.tripRequests({ status: "pending_review", limit: 6 }),
    queryFn: () => listTripRequests({ status: "pending_review", limit: 6 }),
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
  const items = q.data?.items ?? [];
  return (
    <DashboardPanel
      title="Pending Trip Requests" accent="indigo" count={q.data?.total}
      viewAllHref="/trip-requests" emptyIcon={ClipboardList} emptyLabel="No pending requests"
      isLoading={q.isLoading} isEmpty={items.length === 0}
    >
      {items.slice(0, 5).map((req) => (
        <PanelRow
          key={req.id} href={`/trip-requests/${req.id}`}
          title={
            <span className="flex items-center gap-2">
              {req.request_number}
              <Badge variant="outline" className={`border-0 text-[10px] font-medium ${
                req.source === "enterprise_portal" ? "bg-blue-50 text-blue-700" : "bg-purple-50 text-purple-700"
              }`}>
                {req.source === "enterprise_portal" ? "Portal" : "Sales"}
              </Badge>
            </span>
          }
          subtitle={`${req.consigner_display ?? "—"} · ${req.pickup_city ?? req.pickup_address} → ${req.delivery_city ?? req.delivery_address}`}
        />
      ))}
    </DashboardPanel>
  );
}

export function ActiveTripsPanel() {
  const q = useQuery({
    queryKey: queryKeys.appTrips({ limit: 6 }),
    queryFn: () => listAppTrips({ limit: 6 }),
    staleTime: 30_000,
  });
  const items = (q.data?.items ?? []).filter(
    (t) => !["completed", "cancelled", "driver_rejected"].includes(t.status),
  );
  return (
    <DashboardPanel
      title="Active Trips" accent="blue" viewAllHref="/trips"
      emptyIcon={Truck} emptyLabel="No active trips"
      isLoading={q.isLoading} isEmpty={items.length === 0}
    >
      {items.slice(0, 5).map((trip) => (
        <PanelRow
          key={trip.id} href={`/trips/${trip.id}`}
          title={trip.tripNumber}
          subtitle={`${trip.consignerName} · ${trip.pickupCity} → ${trip.deliveryCity}`}
          trailing={
            <Badge variant="outline" className={`border-0 text-[10px] font-medium ${TRIP_STATUS_COLORS[trip.status] ?? "bg-gray-100 text-gray-600"}`}>
              {prettify(trip.status)}
            </Badge>
          }
        />
      ))}
    </DashboardPanel>
  );
}

export function VerificationPanel() {
  const q = useQuery({
    queryKey: queryKeys.verificationPending({ limit: 6 }),
    queryFn: () => listPendingVerifications({ limit: 6 }),
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
  const items = q.data?.items ?? [];
  return (
    <DashboardPanel
      title="Pending Verifications" accent="amber" count={q.data?.total}
      viewAllHref="/verification" emptyIcon={ShieldCheck} emptyLabel="Nothing awaiting verification"
      isLoading={q.isLoading} isEmpty={items.length === 0}
    >
      {items.slice(0, 5).map((p) => (
        <PanelRow
          key={`${p.kind}-${p.id}`} href={verificationHref(p.kind, p.id)}
          leading={<RowChip label={p.title} accent={KIND_ACCENT[p.kind] ?? "blue"} />}
          title={p.title}
          subtitle={[KIND_LABEL[p.kind] ?? p.kind, p.city].filter(Boolean).join(" · ")}
        />
      ))}
    </DashboardPanel>
  );
}

export function PayoutOnboardingPanel() {
  const q = useQuery({
    queryKey: queryKeys.pendingPayoutOnboarding,
    queryFn: () => listPendingPayoutOnboarding(),
    staleTime: 30_000,
  });
  const items = q.data?.items ?? [];
  return (
    <DashboardPanel
      title="Payout Onboarding Pending" accent="violet" count={q.data?.total}
      viewAllHref="/verification/pending-payout-onboarding" emptyIcon={Banknote}
      emptyLabel="All partners onboarded for payouts"
      isLoading={q.isLoading} isEmpty={items.length === 0}
    >
      {items.slice(0, 5).map((p) => (
        <PanelRow
          key={p.userId} href="/verification/pending-payout-onboarding"
          leading={<RowChip label={p.fullName} accent="violet" />}
          title={p.fullName}
          subtitle={[prettify(p.userType), p.city].filter(Boolean).join(" · ")}
        />
      ))}
    </DashboardPanel>
  );
}

export function PaymentQueuePanel() {
  const q = useQuery({
    queryKey: queryKeys.paymentsQueue({}),
    queryFn: () => listPaymentQueue({}),
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
  const items = q.data ?? [];
  return (
    <DashboardPanel
      title="Payment Queue" accent="purple" count={items.length}
      viewAllHref="/payments" emptyIcon={CreditCard} emptyLabel="No payments awaiting action"
      isLoading={q.isLoading} isEmpty={items.length === 0}
    >
      {items.slice(0, 5).map((p) => (
        <PanelRow
          key={p.id} href="/payments"
          leading={<RowChip label={p.beneficiary} accent="purple" />}
          title={p.beneficiary}
          subtitle={`${p.tripCode} · ${prettify(p.type)}`}
          trailing={
            <span className="text-sm font-semibold text-gray-900">{formatCurrency(p.amount)}</span>
          }
        />
      ))}
    </DashboardPanel>
  );
}

export function TicketsPanel() {
  const q = useQuery({
    queryKey: queryKeys.tickets({ status: "open", limit: 6 }),
    queryFn: () => listTickets({ status: "open", limit: 6 }),
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
  const items = q.data?.items ?? [];
  return (
    <DashboardPanel
      title="Open Tickets" accent="rose" count={q.data?.counts?.open}
      viewAllHref="/tickets" emptyIcon={TicketCheck} emptyLabel="No open tickets"
      isLoading={q.isLoading} isEmpty={items.length === 0}
    >
      {items.slice(0, 5).map((t) => (
        <PanelRow
          key={t.id} href="/tickets"
          title={t.title}
          subtitle={[prettify(t.issueType), t.tripCode].filter(Boolean).join(" · ")}
          trailing={
            <Badge variant="outline" className="border-0 bg-rose-50 text-[10px] font-medium text-rose-700">
              {prettify(t.status)}
            </Badge>
          }
        />
      ))}
    </DashboardPanel>
  );
}
