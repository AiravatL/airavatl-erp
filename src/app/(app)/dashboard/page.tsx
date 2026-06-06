"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/shared/page-header";
import { useAuth } from "@/lib/auth/auth-context";
import { getAppOverview } from "@/lib/api/app-reports";
import { queryKeys } from "@/lib/query/keys";
import type { Role } from "@/lib/types";
import { StatCard } from "./_components/dashboard-panel";
import {
  TripRequestsPanel, ActiveTripsPanel, VerificationPanel,
  PayoutOnboardingPanel, PaymentQueuePanel, TicketsPanel,
} from "./_components/role-panels";
import {
  Truck, CreditCard, Receipt, Plus, TicketCheck, Users,
  PackagePlus, MapPin, BarChart3, ShieldCheck, ClipboardList,
} from "lucide-react";

const ROLE_DESCRIPTIONS: Record<Role, string> = {
  super_admin: "Full overview of operations, approvals, and analytics",
  admin: "Full overview of operations, approvals, and analytics",
  operations: "Trip dispatch, fleet management, and driver coordination",
  sales_vehicles: "Partner verification, onboarding, and fleet sourcing",
  sales_consigner: "Customer CRM, consigner management, and collections",
  accounts: "Payments, settlements, and receivable aging",
  support: "Open tickets and follow-up tasks",
};

export default function DashboardPage() {
  const { user } = useAuth();
  const role = user?.role ?? "super_admin";

  const overviewQuery = useQuery({
    queryKey: queryKeys.appOverview({}),
    queryFn: () => getAppOverview(),
    enabled: !!user,
    staleTime: 60_000,
  });
  const metrics = overviewQuery.data?.metrics;
  const quickActions = getQuickActions(role);

  return (
    <div className="p-4 sm:p-6 space-y-5">
      <PageHeader
        title={`Welcome, ${user?.fullName?.split(" ")[0] ?? "User"}`}
        description={ROLE_DESCRIPTIONS[role]}
      />

      {/* Quick actions */}
      {quickActions.length > 0 && (
        <div className="flex gap-2 overflow-x-auto pb-1">
          {quickActions.map((action) => (
            <Link key={action.href + action.label} href={action.href}>
              <Button variant="outline" size="sm" className="h-8 shrink-0 gap-1.5 text-xs">
                <action.icon className="h-3.5 w-3.5" />
                {action.label}
              </Button>
            </Link>
          ))}
        </div>
      )}

      {/* Stat cards — role-aware */}
      {role === "sales_vehicles" ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <StatCard icon={ShieldCheck} iconBg="bg-amber-50" iconColor="text-amber-600"
            value={metrics?.pendingVerifications ?? 0} label="Pending Verifications" />
          <StatCard icon={Users} iconBg="bg-emerald-50" iconColor="text-emerald-600"
            value={metrics?.totalUsers ?? 0} label="Total Partners" />
          <StatCard icon={MapPin} iconBg="bg-cyan-50" iconColor="text-cyan-600"
            value={metrics?.liveDrivers ?? 0} label="Live Drivers" />
        </div>
      ) : role === "accounts" ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <StatCard icon={CreditCard} iconBg="bg-purple-50" iconColor="text-purple-600"
            value={metrics?.paymentsCount ?? 0} label="Payments (30d)" />
          <StatCard icon={Truck} iconBg="bg-blue-50" iconColor="text-blue-600"
            value={metrics?.tripsCreated ?? 0} label="Trips (30d)" />
          <StatCard icon={Users} iconBg="bg-emerald-50" iconColor="text-emerald-600"
            value={metrics?.totalUsers ?? 0} label="Total Users" />
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard icon={Truck} iconBg="bg-blue-50" iconColor="text-blue-600"
            value={metrics?.tripsCreated ?? 0} label="Trips (30d)" />
          <StatCard icon={PackagePlus} iconBg="bg-indigo-50" iconColor="text-indigo-600"
            value={metrics?.deliveryRequests ?? 0} label="Auctions (30d)" />
          <StatCard icon={Users} iconBg="bg-emerald-50" iconColor="text-emerald-600"
            value={metrics?.totalUsers ?? 0} label="Total Users" />
          <StatCard icon={MapPin} iconBg="bg-cyan-50" iconColor="text-cyan-600"
            value={metrics?.liveDrivers ?? 0} label="Live Drivers" />
        </div>
      )}

      {/* Main content — role-specific panels */}
      <RolePanels role={role} />
    </div>
  );
}

/** Renders the main content panels relevant to each role. */
function RolePanels({ role }: { role: Role }) {
  switch (role) {
    case "sales_vehicles":
      return (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <VerificationPanel />
          <PayoutOnboardingPanel />
        </div>
      );
    case "accounts":
      return (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <PaymentQueuePanel />
          <ActiveTripsPanel />
        </div>
      );
    case "support":
      return (
        <div className="grid grid-cols-1 gap-4">
          <TicketsPanel />
        </div>
      );
    case "sales_consigner":
      return (
        <div className="grid grid-cols-1 gap-4">
          <TripRequestsPanel />
        </div>
      );
    default:
      // super_admin, admin, operations
      return (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <TripRequestsPanel />
          <ActiveTripsPanel />
        </div>
      );
  }
}

function getQuickActions(role: Role) {
  switch (role) {
    case "sales_consigner":
      return [
        { label: "New Trip Request", href: "/trip-requests/new", icon: Plus },
        { label: "Trip Requests", href: "/trip-requests", icon: ClipboardList },
      ];
    case "sales_vehicles":
      return [
        { label: "Verification", href: "/verification", icon: ShieldCheck },
        { label: "Fleet", href: "/fleet", icon: Users },
        { label: "Rate Library", href: "/rates", icon: Receipt },
      ];
    case "operations":
      return [
        { label: "New Auction", href: "/delivery-requests/new", icon: Plus },
        { label: "Trip Requests", href: "/trip-requests", icon: ClipboardList },
        { label: "Trips", href: "/trips", icon: Truck },
        { label: "Live Map", href: "/fleet/live-map", icon: MapPin },
      ];
    case "accounts":
      return [
        { label: "Payments", href: "/payments", icon: CreditCard },
        { label: "Receivables", href: "/receivables", icon: Receipt },
      ];
    case "support":
      return [
        { label: "Tickets", href: "/tickets", icon: TicketCheck },
      ];
    default:
      return [
        { label: "New Auction", href: "/delivery-requests/new", icon: Plus },
        { label: "Payments", href: "/payments", icon: CreditCard },
        { label: "Reports", href: "/reports", icon: BarChart3 },
      ];
  }
}
