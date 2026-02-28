"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/shared/page-header";
import { StatusBadge } from "@/components/shared/status-badge";
import { useAuth } from "@/lib/auth/auth-context";
import { listTrips } from "@/lib/api/trips";
import { listPaymentQueue } from "@/lib/api/payments";
import { listTickets } from "@/lib/api/tickets";
import { formatCurrency } from "@/lib/formatters";
import { queryKeys } from "@/lib/query/keys";
import { TRIP_STAGE_LABELS } from "@/lib/types";
import type { Role } from "@/lib/types";
import {
  Truck, AlertTriangle, CreditCard, Receipt,
  Clock, ArrowRight, FileWarning, Fuel,
  Plus, TicketCheck, Users, TrendingUp,
} from "lucide-react";

const SEVERITY_ICON: Record<string, React.ComponentType<{ className?: string }>> = {
  missing_docs: FileWarning,
  pending_approval: Clock,
  pod_overdue: FileWarning,
  overdue_receivable: Receipt,
  fuel_variance: Fuel,
  sla_breach: AlertTriangle,
};

const ROLE_DESCRIPTIONS: Record<Role, string> = {
  super_admin: "Full overview of operations, approvals, and analytics",
  admin: "Full overview of operations, approvals, and analytics",
  operations_consigner: "Trip dispatch, documents, and payment requests",
  operations_vehicles: "Fleet management, vendor coordination, and market rates",
  sales_vehicles: "Vehicle sourcing, vendor onboarding, and market rates",
  sales_consigner: "Your customers, quotes, and collection follow-ups",
  accounts: "Payments, settlements, and receivable aging",
  support: "Open tickets and follow-up tasks",
};

interface DashboardAlert {
  id: string;
  type: string;
  title: string;
  description: string;
  severity: "low" | "medium" | "high";
  tripId?: string | null;
  tripCode?: string | null;
}

export default function DashboardPage() {
  const { user } = useAuth();
  const role = user?.role || "super_admin";

  const tripsQuery = useQuery({
    queryKey: queryKeys.trips({}),
    queryFn: () => listTrips({ limit: 300, offset: 0 }),
    enabled: !!user,
  });
  const paymentsQuery = useQuery({
    queryKey: queryKeys.paymentsQueue({}),
    queryFn: () => listPaymentQueue({ limit: 300, offset: 0 }),
    enabled: !!user,
  });
  const ticketsQuery = useQuery({
    queryKey: queryKeys.tickets({ status: "all", limit: 300, offset: 0 }),
    queryFn: () => listTickets({ status: "all", limit: 300, offset: 0 }),
    enabled: !!user,
  });

  const allTrips = tripsQuery.data ?? [];
  const activeTrips = allTrips.filter((trip) => trip.currentStage !== "closed");
  const pendingPayments = (paymentsQuery.data ?? []).filter(
    (payment) => payment.status === "pending" || payment.status === "approved",
  );
  const openTickets = (ticketsQuery.data?.items ?? []).filter((ticket) => ticket.status !== "resolved");

  // TODO(backend): replace with receivables dashboard aggregate API.
  const overdueReceivables: Array<{
    id: string;
    customerName: string;
    amount: number;
    agingBucket: string;
    tripCode: string;
  }> = [];
  // TODO(backend): replace with alerts dashboard API.
  const allAlerts: DashboardAlert[] = [];

  // Role-specific alert filtering
  const roleAlerts = allAlerts.filter((a) => {
    if (role === "super_admin" || role === "admin") return true;
    if (role === "sales_consigner" || role === "sales_vehicles") return ["overdue_receivable", "pod_overdue"].includes(a.type);
    if (role === "operations_consigner" || role === "operations_vehicles") return ["missing_docs", "sla_breach", "pod_overdue"].includes(a.type);
    if (role === "accounts") return ["pending_approval", "overdue_receivable", "fuel_variance"].includes(a.type);
    if (role === "support") return true;
    return false;
  });

  // Quick actions by role
  const quickActions: { label: string; href: string; icon: React.ComponentType<{ className?: string }> }[] = (() => {
    switch (role) {
      case "sales_consigner":
        return [
          { label: "New Trip", href: "/trips/new", icon: Plus },
          { label: "Customers", href: "/customers", icon: Users },
          { label: "Receivables", href: "/receivables", icon: Receipt },
        ];
      case "sales_vehicles":
        return [
          { label: "Vendors", href: "/vendors", icon: Users },
          { label: "Vehicle CRM", href: "/vehicle-crm", icon: Truck },
          { label: "Rate Library", href: "/rates", icon: Receipt },
        ];
      case "operations_consigner":
        return [
          { label: "New Trip", href: "/trips/new", icon: Plus },
          { label: "All Trips", href: "/trips", icon: Truck },
          { label: "Payments", href: "/payments", icon: CreditCard },
        ];
      case "operations_vehicles":
        return [
          { label: "Vendors", href: "/vendors", icon: Users },
          { label: "Trips", href: "/trips", icon: Truck },
          { label: "Rate Library", href: "/rates", icon: Receipt },
        ];
      case "accounts":
        return [
          { label: "Payments Queue", href: "/payments", icon: CreditCard },
          { label: "Receivables", href: "/receivables", icon: Receipt },
          { label: "Reports", href: "/reports", icon: TrendingUp },
        ];
      case "support":
        return [
          { label: "New Ticket", href: "/tickets", icon: Plus },
          { label: "All Tickets", href: "/tickets", icon: TicketCheck },
          { label: "Trips", href: "/trips", icon: Truck },
        ];
      default:
        return [
          { label: "New Trip", href: "/trips/new", icon: Plus },
          { label: "Payments", href: "/payments", icon: CreditCard },
          { label: "Reports", href: "/reports", icon: TrendingUp },
        ];
    }
  })();

  // Stats visible per role
  const showPayments = ["super_admin", "admin", "operations_consigner", "operations_vehicles", "accounts"].includes(role);
  const showReceivables = ["super_admin", "admin", "sales_consigner", "sales_vehicles", "accounts"].includes(role);
  const showTickets = ["super_admin", "admin", "support"].includes(role);

  return (
    <div className="p-4 sm:p-6 space-y-6">
      <PageHeader
        title={`Welcome, ${user?.fullName.split(" ")[0]}`}
        description={ROLE_DESCRIPTIONS[role]}
      />

      {/* Quick actions */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {quickActions.map((action) => (
          <Link key={action.href + action.label} href={action.href}>
            <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5 shrink-0">
              <action.icon className="h-3.5 w-3.5" />
              {action.label}
            </Button>
          </Link>
        ))}
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard icon={Truck} iconBg="bg-blue-50" iconColor="text-blue-600" value={activeTrips.length} label="Active Trips" />
        <StatCard icon={AlertTriangle} iconBg="bg-amber-50" iconColor="text-amber-600" value={roleAlerts.length} label="Alerts" />
        {showPayments && (
          <StatCard icon={CreditCard} iconBg="bg-purple-50" iconColor="text-purple-600" value={pendingPayments.length} label="Pending Payments" />
        )}
        {showReceivables && (
          <StatCard icon={Receipt} iconBg="bg-red-50" iconColor="text-red-600" value={overdueReceivables.length} label="Overdue Receivables" />
        )}
        {showTickets && (
          <StatCard icon={TicketCheck} iconBg="bg-cyan-50" iconColor="text-cyan-600" value={openTickets.length} label="Open Tickets" />
        )}
        {!showPayments && !showTickets && (
          <StatCard icon={Truck} iconBg="bg-emerald-50" iconColor="text-emerald-600" value={allTrips.length} label="Total Trips" />
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-5">
        {/* Active Trips */}
        <Card className="lg:col-span-3">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium text-gray-900">
                {role === "sales_consigner" ? "My Active Trips" : "Active Trips"}
              </CardTitle>
              <Link href="/trips" className="text-xs text-gray-500 hover:text-gray-700 flex items-center gap-1">
                View all <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y divide-gray-100">
              {activeTrips.slice(0, 5).map((trip) => (
                <Link
                  key={trip.id}
                  href={`/trips/${trip.id}`}
                  className="flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition-colors"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="text-sm font-medium text-gray-900">{trip.tripCode}</span>
                      {trip.leasedFlag && (
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-indigo-200 text-indigo-600">
                          Leased
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-gray-500 truncate">
                      {trip.customerName} &middot; {trip.route}
                    </p>
                  </div>
                  <StatusBadge
                    status={trip.currentStage}
                    label={TRIP_STAGE_LABELS[trip.currentStage]}
                    variant="stage"
                  />
                </Link>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Right panel - changes by role */}
        <Card className="lg:col-span-2">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-gray-900">
              {role === "accounts" ? "Pending Actions" : role === "support" ? "Recent Tickets" : "Alerts"}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {role === "support" ? (
              <div className="divide-y divide-gray-100">
                {openTickets.slice(0, 5).map((t) => (
                  <div key={t.id} className="flex gap-3 px-4 py-3">
                    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-cyan-50">
                      <TicketCheck className="h-3.5 w-3.5 text-cyan-500" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-medium text-gray-900">{t.title}</p>
                      <p className="text-[11px] text-gray-500">
                        {t.issueType} &middot; {t.assignedToName ?? "Unassigned"}
                      </p>
                      {t.tripCode && (
                        <Link href={`/trips/${t.tripId ?? ""}`} className="text-[11px] text-blue-600 hover:underline">
                          {t.tripCode}
                        </Link>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : role === "accounts" ? (
              <div className="divide-y divide-gray-100">
                {pendingPayments.slice(0, 3).map((p) => (
                  <div key={p.id} className="flex gap-3 px-4 py-3">
                    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-purple-50">
                      <CreditCard className="h-3.5 w-3.5 text-purple-500" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-medium text-gray-900">{formatCurrency(p.amount)} - {p.beneficiary}</p>
                      <p className="text-[11px] text-gray-500">{p.tripCode} &middot; {p.status}</p>
                    </div>
                  </div>
                ))}
                {overdueReceivables.slice(0, 2).map((r) => (
                  <div key={r.id} className="flex gap-3 px-4 py-3">
                    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-red-50">
                      <Receipt className="h-3.5 w-3.5 text-red-500" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-medium text-gray-900">{r.customerName} - {formatCurrency(r.amount)}</p>
                      <p className="text-[11px] text-gray-500">Overdue {r.agingBucket} &middot; {r.tripCode}</p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="divide-y divide-gray-100">
                {roleAlerts.map((alert) => {
                  const Icon = SEVERITY_ICON[alert.type] || AlertTriangle;
                  return (
                    <div key={alert.id} className="flex gap-3 px-4 py-3">
                      <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${
                        alert.severity === "high" ? "bg-red-50" : "bg-amber-50"
                      }`}>
                        <Icon className={`h-3.5 w-3.5 ${
                          alert.severity === "high" ? "text-red-500" : "text-amber-500"
                        }`} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-medium text-gray-900">{alert.title}</p>
                        <p className="text-[11px] text-gray-500 line-clamp-2">{alert.description}</p>
                        {alert.tripCode && alert.tripId && (
                          <Link href={`/trips/${alert.tripId}`} className="text-[11px] text-blue-600 hover:underline">
                            {alert.tripCode}
                          </Link>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function StatCard({ icon: Icon, iconBg, iconColor, value, label }: {
  icon: React.ComponentType<{ className?: string }>;
  iconBg: string;
  iconColor: string;
  value: number;
  label: string;
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center gap-3">
          <div className={`flex h-9 w-9 items-center justify-center rounded-lg ${iconBg}`}>
            <Icon className={`h-4 w-4 ${iconColor}`} />
          </div>
          <div>
            <p className="text-2xl font-semibold text-gray-900">{value}</p>
            <p className="text-xs text-gray-500">{label}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
