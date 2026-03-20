"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/shared/page-header";
import { useAuth } from "@/lib/auth/auth-context";
import { getAppOverview } from "@/lib/api/app-reports";
import { listAppTrips, type AppTripItem } from "@/lib/api/app-reports";
import { formatCurrency } from "@/lib/formatters";
import { queryKeys } from "@/lib/query/keys";
import type { Role } from "@/lib/types";
import {
  Truck, CreditCard, Receipt, ArrowRight, Plus,
  TicketCheck, Users, TrendingUp, PackagePlus,
  MapPin, BarChart3,
} from "lucide-react";

const ROLE_DESCRIPTIONS: Record<Role, string> = {
  super_admin: "Full overview of operations, approvals, and analytics",
  admin: "Full overview of operations, approvals, and analytics",
  operations: "Trip dispatch, fleet management, and driver coordination",
  sales_vehicles: "Vehicle sourcing, partner onboarding, and market rates",
  sales_consigner: "Your customers, auctions, and collection follow-ups",
  accounts: "Payments, settlements, and receivable aging",
  support: "Open tickets and follow-up tasks",
};

function prettify(s: string) {
  return s.split("_").map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join(" ");
}

const STATUS_COLORS: Record<string, string> = {
  pending: "bg-gray-100 text-gray-700",
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

export default function DashboardPage() {
  const { user } = useAuth();
  const role = user?.role ?? "super_admin";

  // Overview metrics (single lightweight RPC)
  const overviewQuery = useQuery({
    queryKey: queryKeys.appOverview({}),
    queryFn: () => getAppOverview(),
    enabled: !!user,
    staleTime: 60_000,
  });

  // Active trips (small page, just for the list)
  const tripsQuery = useQuery({
    queryKey: queryKeys.appTrips({ limit: 6 }),
    queryFn: () => listAppTrips({ limit: 6 }),
    enabled: !!user,
    staleTime: 30_000,
  });

  const metrics = overviewQuery.data?.metrics;
  const activeTrips = (tripsQuery.data?.items ?? []).filter(
    (t) => !["completed", "cancelled", "driver_rejected"].includes(t.status),
  );

  // Quick actions by role
  const quickActions = getQuickActions(role);
  const showFinancials = false; // Financial stats removed from dashboard — use Reports > Financial instead

  return (
    <div className="p-4 sm:p-6 space-y-5">
      <PageHeader
        title={`Welcome, ${user?.fullName?.split(" ")[0] ?? "User"}`}
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
        <StatCard icon={Truck} iconBg="bg-blue-50" iconColor="text-blue-600"
          value={metrics?.tripsCreated ?? 0} label="Trips (30d)" />
        <StatCard icon={PackagePlus} iconBg="bg-indigo-50" iconColor="text-indigo-600"
          value={metrics?.deliveryRequests ?? 0} label="Auctions (30d)" />
        <StatCard icon={Users} iconBg="bg-emerald-50" iconColor="text-emerald-600"
          value={metrics?.totalUsers ?? 0} label="Total Users" />
        <StatCard icon={MapPin} iconBg="bg-cyan-50" iconColor="text-cyan-600"
          value={metrics?.liveDrivers ?? 0} label="Live Drivers" />
      </div>

      {showFinancials && metrics && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <StatCard icon={CreditCard} iconBg="bg-purple-50" iconColor="text-purple-600"
            value={metrics.paymentsCount} label="Payments (30d)" isAmount={false} />
          <StatCard icon={Receipt} iconBg="bg-amber-50" iconColor="text-amber-600"
            value={metrics.paymentsVolume} label="Volume (30d)" isAmount />
          <StatCard icon={TrendingUp} iconBg="bg-green-50" iconColor="text-green-600"
            value={metrics.platformRevenue} label="Revenue (30d)" isAmount />
        </div>
      )}

      {/* Main content */}
      <div className="grid gap-4 lg:grid-cols-5">
        {/* Active Trips */}
        <Card className="lg:col-span-3">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium text-gray-900">Active Trips</CardTitle>
              <Link href="/trips" className="text-xs text-gray-500 hover:text-gray-700 flex items-center gap-1">
                View all <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {tripsQuery.isLoading ? (
              <div className="px-4 py-6 text-center text-sm text-gray-400">Loading...</div>
            ) : activeTrips.length === 0 ? (
              <div className="px-4 py-6 text-center">
                <Truck className="h-8 w-8 text-gray-200 mx-auto mb-2" />
                <p className="text-sm text-gray-400">No active trips</p>
              </div>
            ) : (
              <div className="divide-y divide-gray-100">
                {activeTrips.slice(0, 5).map((trip) => (
                  <Link key={trip.id} href={`/trips/${trip.id}`}
                    className="flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition-colors">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="text-sm font-medium text-gray-900">{trip.tripNumber}</span>
                      </div>
                      <p className="text-xs text-gray-500 truncate">
                        {trip.consignerName} · {trip.pickupCity} → {trip.deliveryCity}
                      </p>
                    </div>
                    <Badge variant="outline" className={`border-0 text-[10px] font-medium shrink-0 ${STATUS_COLORS[trip.status] ?? "bg-gray-100 text-gray-600"}`}>
                      {prettify(trip.status)}
                    </Badge>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Right panel — Quick links */}
        <Card className="lg:col-span-2">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-gray-900">Quick Navigation</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <QuickLink href="/delivery-requests" icon={PackagePlus} label="Auctions" description="Manage delivery request auctions" />
            <QuickLink href="/trips" icon={Truck} label="Trips" description="Track active and completed trips" />
            <QuickLink href="/customers" icon={Users} label="Customers" description="ERP and app consigners" />
            <QuickLink href="/fleet/live-map" icon={MapPin} label="Live Map" description="Real-time driver locations" />
            <QuickLink href="/reports" icon={BarChart3} label="Reports" description="Analytics and data insights" />
            {showFinancials && (
              <QuickLink href="/payments" icon={CreditCard} label="Payments" description="Payment queue and proof uploads" />
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function StatCard({ icon: Icon, iconBg, iconColor, value, label, isAmount }: {
  icon: React.ComponentType<{ className?: string }>;
  iconBg: string;
  iconColor: string;
  value: number;
  label: string;
  isAmount?: boolean;
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center gap-3">
          <div className={`flex h-9 w-9 items-center justify-center rounded-lg ${iconBg}`}>
            <Icon className={`h-4 w-4 ${iconColor}`} />
          </div>
          <div>
            <p className="text-xl font-semibold text-gray-900">
              {isAmount ? formatCurrency(value) : value.toLocaleString("en-IN")}
            </p>
            <p className="text-xs text-gray-500">{label}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function QuickLink({ href, icon: Icon, label, description }: {
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  description: string;
}) {
  return (
    <Link href={href}
      className="flex items-center gap-3 rounded-lg border border-gray-100 p-2.5 hover:bg-gray-50 transition-colors">
      <div className="flex h-8 w-8 items-center justify-center rounded-md bg-gray-100 text-gray-600">
        <Icon className="h-4 w-4" />
      </div>
      <div>
        <p className="text-sm font-medium text-gray-900">{label}</p>
        <p className="text-[11px] text-gray-400">{description}</p>
      </div>
    </Link>
  );
}

function getQuickActions(role: Role) {
  switch (role) {
    case "sales_consigner":
      return [
        { label: "New Auction", href: "/delivery-requests/new", icon: Plus },
        { label: "Customers", href: "/customers", icon: Users },
        { label: "CRM", href: "/consigner-crm", icon: TrendingUp },
      ];
    case "sales_vehicles":
      return [
        { label: "Fleet", href: "/vendors", icon: Users },
        { label: "Verification", href: "/verification", icon: Truck },
        { label: "Rate Library", href: "/rates", icon: Receipt },
      ];
    case "operations":
      return [
        { label: "Trips", href: "/trips", icon: Truck },
        { label: "Live Map", href: "/fleet/live-map", icon: MapPin },
        { label: "Verification", href: "/verification", icon: Users },
      ];
    case "accounts":
      return [
        { label: "Payments", href: "/payments", icon: CreditCard },
        { label: "Reports", href: "/reports", icon: BarChart3 },
        { label: "Customers", href: "/customers", icon: Users },
      ];
    case "support":
      return [
        { label: "Tickets", href: "/tickets", icon: TicketCheck },
        { label: "Trips", href: "/trips", icon: Truck },
        { label: "Customers", href: "/customers", icon: Users },
      ];
    default:
      return [
        { label: "New Auction", href: "/delivery-requests/new", icon: Plus },
        { label: "Payments", href: "/payments", icon: CreditCard },
        { label: "Reports", href: "/reports", icon: BarChart3 },
      ];
  }
}
