"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/shared/status-badge";
import { useAuth } from "@/lib/auth/auth-context";
import { formatCurrency, formatDate } from "@/lib/formatters";
import {
  getCustomerById,
  listCustomerReceivables,
  listCustomerTrips,
} from "@/lib/api/customers";
import { queryKeys } from "@/lib/query/keys";
import { TRIP_STAGE_LABELS } from "@/lib/types";
import { ArrowLeft, Plus } from "lucide-react";

const RECEIVABLE_STATUS_COLORS: Record<string, string> = {
  pending: "bg-amber-50 text-amber-700",
  partial: "bg-blue-50 text-blue-700",
  collected: "bg-emerald-50 text-emerald-700",
  overdue: "bg-red-50 text-red-700",
};

function formatStatusLabel(status: string) {
  return status
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export default function CustomerDetailPage() {
  const params = useParams();
  const { user } = useAuth();
  const customerId = params.customerId as string;

  const customerQuery = useQuery({
    queryKey: queryKeys.customer(customerId),
    queryFn: () => getCustomerById(customerId),
    enabled: !!user && !!customerId,
  });

  const tripsQuery = useQuery({
    queryKey: queryKeys.customerTrips(customerId, { limit: 100, offset: 0 }),
    queryFn: () => listCustomerTrips(customerId, { limit: 100, offset: 0 }),
    enabled: !!user && !!customerId,
  });

  const receivablesQuery = useQuery({
    queryKey: queryKeys.customerReceivables(customerId, { limit: 100, offset: 0 }),
    queryFn: () => listCustomerReceivables(customerId, { limit: 100, offset: 0 }),
    enabled: !!user && !!customerId,
  });

  if (customerQuery.isLoading) {
    return (
      <div className="p-4 sm:p-6">
        <p className="text-sm text-gray-500">Loading customer...</p>
      </div>
    );
  }

  if (customerQuery.isError || !customerQuery.data) {
    return (
      <div className="p-4 sm:p-6 text-center">
        <p className="text-sm text-red-600">
          {customerQuery.error instanceof Error ? customerQuery.error.message : "Customer not found"}
        </p>
        <Link href="/customers" className="text-sm text-blue-600 hover:underline mt-2 inline-block">
          Back to customers
        </Link>
      </div>
    );
  }

  const customer = customerQuery.data;
  const trips = tripsQuery.data ?? [];
  const receivables = receivablesQuery.data ?? [];

  return (
    <div className="p-4 sm:p-6 space-y-4">
      <div className="flex items-start gap-3">
        <Link href="/customers" className="mt-1 text-gray-400 hover:text-gray-600">
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <h1 className="text-lg font-semibold text-gray-900">{customer.name}</h1>
            <Badge
              variant="outline"
              className={`text-[10px] border-0 ${customer.active ? "bg-emerald-50 text-emerald-700" : "bg-gray-100 text-gray-500"}`}
            >
              {customer.active ? "Active" : "Inactive"}
            </Badge>
          </div>
          <p className="text-sm text-gray-500">{customer.address || "No address"}</p>
        </div>
        <Link href="/trips/new">
          <Button size="sm" className="h-8 text-xs gap-1.5">
            <Plus className="h-3.5 w-3.5" /> New Trip
          </Button>
        </Link>
      </div>

      <div className="grid gap-3 sm:grid-cols-4">
        <Card>
          <CardContent className="p-3">
            <p className="text-xs text-gray-500">GSTIN</p>
            <p className="text-sm font-medium text-gray-900 mt-0.5">{customer.gstin || "-"}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <p className="text-xs text-gray-500">Credit Terms</p>
            <p className="text-sm font-medium text-gray-900 mt-0.5">
              {customer.creditDays} days / {formatCurrency(customer.creditLimit)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <p className="text-xs text-gray-500">Outstanding</p>
            <p className="text-sm font-semibold text-gray-900 mt-0.5">{formatCurrency(customer.outstandingAmount)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <p className="text-xs text-gray-500">Sales Owner</p>
            <p className="text-sm font-medium text-gray-900 mt-0.5">{customer.salesOwnerName || "-"}</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium text-gray-900">Trip History ({trips.length})</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {tripsQuery.isLoading && <p className="px-4 py-3 text-sm text-gray-500">Loading trips...</p>}
          {!tripsQuery.isLoading && tripsQuery.isError && (
            <p className="px-4 py-3 text-sm text-red-600">
              {tripsQuery.error instanceof Error ? tripsQuery.error.message : "Unable to load trips"}
            </p>
          )}
          {!tripsQuery.isLoading && !tripsQuery.isError && trips.length === 0 && (
            <p className="px-4 py-3 text-sm text-gray-500">No trips found.</p>
          )}
          {!tripsQuery.isLoading && !tripsQuery.isError && trips.length > 0 && (
            <div className="divide-y divide-gray-50">
              {trips.map((trip) => (
                <Link key={trip.id} href={`/trips/${trip.id}`} className="flex items-center justify-between px-4 py-2.5 hover:bg-gray-50 transition-colors">
                  <div>
                    <span className="text-sm font-medium text-blue-600">{trip.tripCode}</span>
                    <p className="text-xs text-gray-500">{trip.route || "-"}</p>
                  </div>
                  <StatusBadge
                    status={trip.currentStage}
                    label={TRIP_STAGE_LABELS[trip.currentStage] ?? formatStatusLabel(trip.currentStage)}
                    variant="stage"
                  />
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium text-gray-900">Receivables</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {receivablesQuery.isLoading && <p className="px-4 py-3 text-sm text-gray-500">Loading receivables...</p>}
          {!receivablesQuery.isLoading && receivablesQuery.isError && (
            <p className="px-4 py-3 text-sm text-red-600">
              {receivablesQuery.error instanceof Error ? receivablesQuery.error.message : "Unable to load receivables"}
            </p>
          )}
          {!receivablesQuery.isLoading && !receivablesQuery.isError && receivables.length === 0 && (
            <p className="px-4 py-3 text-sm text-gray-500">No receivables found.</p>
          )}
          {!receivablesQuery.isLoading && !receivablesQuery.isError && receivables.length > 0 && (
            <div className="divide-y divide-gray-50">
              {receivables.map((receivable) => (
                <div key={receivable.id} className="flex items-center justify-between px-4 py-2.5">
                  <div>
                    <span className="text-sm text-gray-900">{receivable.tripCode || "-"}</span>
                    <p className="text-xs text-gray-500">
                      Due {receivable.dueDate ? formatDate(receivable.dueDate) : "-"} 
                      <span className="ml-1">({receivable.agingBucket})</span>
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-medium text-gray-900">{formatCurrency(receivable.amount)}</p>
                    <Badge
                      variant="outline"
                      className={`text-[10px] border-0 ${RECEIVABLE_STATUS_COLORS[receivable.collectedStatus] ?? "bg-gray-100 text-gray-700"}`}
                    >
                      {formatStatusLabel(receivable.collectedStatus)}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
