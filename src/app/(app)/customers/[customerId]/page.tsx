"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { useAuth } from "@/lib/auth/auth-context";
import { formatCurrency, formatDate } from "@/lib/formatters";
import { getCustomerById, listCustomerReceivables, listCustomerTrips, updateCustomer } from "@/lib/api/customers";
import { APP_TRIP_STATUS_LABELS } from "@/lib/types";
import { queryKeys } from "@/lib/query/keys";
import {
  ArrowLeft, Phone, Mail, MapPin, Building2,
  Truck, Loader2, FileText, Tag, Pencil, Save,
} from "lucide-react";

const RECEIVABLE_STATUS_COLORS: Record<string, string> = {
  pending: "bg-amber-100 text-amber-700",
  partial: "bg-blue-100 text-blue-700",
  collected: "bg-emerald-100 text-emerald-700",
  overdue: "bg-red-100 text-red-700",
  written_off: "bg-gray-100 text-gray-500",
};

const TRIP_STATUS_COLORS: Record<string, string> = {
  completed: "bg-emerald-100 text-emerald-700",
  cancelled: "bg-red-100 text-red-700",
  driver_rejected: "bg-gray-100 text-gray-600",
  in_transit: "bg-blue-100 text-blue-700",
  waiting_for_advance: "bg-amber-100 text-amber-700",
  waiting_for_final: "bg-amber-100 text-amber-700",
};

function prettify(s: string) { return s.split("_").map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join(" "); }

export default function CustomerDetailPage() {
  const params = useParams();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const customerId = params.customerId as string;
  const isAdmin = user?.role === "super_admin" || user?.role === "admin";

  const [editOpen, setEditOpen] = useState(false);
  const [editForm, setEditForm] = useState({
    registeredName: "", billingAddress: "", gstin: "", panNumber: "",
    natureOfBusiness: "", contactDesignation: "", routeSummary: "",
    creditDays: "", creditLimit: "", internalNotes: "",
  });

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

  const editMutation = useMutation({
    mutationFn: () => updateCustomer(customerId, {
      registeredName: editForm.registeredName.trim() || undefined,
      billingAddress: editForm.billingAddress.trim() || undefined,
      gstin: editForm.gstin.trim() || undefined,
      panNumber: editForm.panNumber.trim() || undefined,
      natureOfBusiness: editForm.natureOfBusiness.trim() || undefined,
      contactDesignation: editForm.contactDesignation.trim() || undefined,
      routeSummary: editForm.routeSummary.trim() || undefined,
      creditDays: editForm.creditDays ? Number(editForm.creditDays) : undefined,
      creditLimit: editForm.creditLimit ? Number(editForm.creditLimit) : undefined,
      internalNotes: editForm.internalNotes.trim() || undefined,
    }),
    onSuccess: () => {
      setEditOpen(false);
      queryClient.invalidateQueries({ queryKey: queryKeys.customer(customerId) });
    },
  });

  function openEdit() {
    const c = customerQuery.data;
    if (!c) return;
    setEditForm({
      registeredName: c.name ?? "",
      billingAddress: c.address ?? "",
      gstin: c.gstin ?? "",
      panNumber: c.panNumber ?? "",
      natureOfBusiness: c.natureOfBusiness ?? "",
      contactDesignation: c.contactDesignation ?? "",
      routeSummary: c.routeSummary ?? "",
      creditDays: String(c.creditDays ?? 0),
      creditLimit: String(c.creditLimit ?? 0),
      internalNotes: c.internalNotes ?? "",
    });
    setEditOpen(true);
    editMutation.reset();
  }

  if (customerQuery.isLoading) {
    return <div className="flex items-center justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-gray-400" /></div>;
  }

  if (customerQuery.isError || !customerQuery.data) {
    return (
      <div className="p-4 sm:p-6 text-center">
        <p className="text-sm text-red-600">{customerQuery.error instanceof Error ? customerQuery.error.message : "Customer not found"}</p>
        <Link href="/customers" className="text-sm text-blue-600 hover:underline mt-2 inline-block">Back to customers</Link>
      </div>
    );
  }

  const c = customerQuery.data;
  const trips = tripsQuery.data ?? [];
  const receivables = receivablesQuery.data ?? [];

  return (
    <div className="p-4 sm:p-6 space-y-4">
      {/* Header */}
      <div className="flex items-start gap-3">
        <Link href="/customers" className="mt-1 text-gray-400 hover:text-gray-600"><ArrowLeft className="h-4 w-4" /></Link>
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <h1 className="text-lg font-semibold text-gray-900">{c.name}</h1>
            <Badge variant="outline" className={`text-[10px] border-0 ${c.active ? "bg-emerald-50 text-emerald-700" : "bg-gray-100 text-gray-500"}`}>
              {c.active ? "Active" : "Inactive"}
            </Badge>
            {c.source && (
              <Badge variant="outline" className="text-[10px] border-0 bg-gray-100 text-gray-600">{prettify(c.source)}</Badge>
            )}
          </div>
          {c.businessName && c.businessName !== c.name && (
            <p className="text-sm text-gray-500">{c.businessName}</p>
          )}
        </div>
        {isAdmin && (
          <Button size="sm" variant="outline" className="h-8 text-xs gap-1 shrink-0" onClick={openEdit}>
            <Pencil className="h-3.5 w-3.5" /> Edit
          </Button>
        )}
      </div>

      {/* Info Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Left: Company Details */}
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold">Company Details</CardTitle></CardHeader>
          <CardContent className="space-y-2.5 text-sm">
            {c.contactName && (
              <InfoRow icon={<Building2 className="h-3.5 w-3.5 text-gray-400" />} label="Contact" value={`${c.contactName}${c.contactDesignation ? ` · ${c.contactDesignation}` : ""}`} />
            )}
            {c.phone && <InfoRow icon={<Phone className="h-3.5 w-3.5 text-gray-400" />} label="Phone" value={c.phone} />}
            {c.email && <InfoRow icon={<Mail className="h-3.5 w-3.5 text-gray-400" />} label="Email" value={c.email} />}
            {c.address && <InfoRow icon={<MapPin className="h-3.5 w-3.5 text-gray-400" />} label="Address" value={c.address} />}
            {c.natureOfBusiness && <InfoRow icon={<FileText className="h-3.5 w-3.5 text-gray-400" />} label="Business" value={c.natureOfBusiness} />}
            {c.routeSummary && <InfoRow icon={<Truck className="h-3.5 w-3.5 text-gray-400" />} label="Routes" value={c.routeSummary} />}
            {c.gstin && <InfoRow icon={<FileText className="h-3.5 w-3.5 text-gray-400" />} label="GSTIN" value={c.gstin} />}
            {c.panNumber && <InfoRow icon={<FileText className="h-3.5 w-3.5 text-gray-400" />} label="PAN" value={c.panNumber} />}
            {c.vehicleRequirements.length > 0 && (
              <div className="flex items-start gap-2 text-gray-600">
                <Truck className="h-3.5 w-3.5 text-gray-400 mt-0.5 shrink-0" />
                <div>
                  <p className="text-[11px] text-gray-400">Vehicle Requirements</p>
                  <div className="flex flex-wrap gap-1 mt-0.5">
                    {c.vehicleRequirements.map((v) => (
                      <Badge key={v} variant="outline" className="text-[10px] border-0 bg-gray-100">{v}</Badge>
                    ))}
                  </div>
                </div>
              </div>
            )}
            {c.tags.length > 0 && (
              <div className="flex items-start gap-2 text-gray-600">
                <Tag className="h-3.5 w-3.5 text-gray-400 mt-0.5 shrink-0" />
                <div className="flex flex-wrap gap-1">
                  {c.tags.map((t) => <Badge key={t} variant="outline" className="text-[10px] border-0 bg-blue-50 text-blue-700">{t}</Badge>)}
                </div>
              </div>
            )}
            {c.salesOwnerName && <InfoRow icon={<Building2 className="h-3.5 w-3.5 text-gray-400" />} label="Sales Owner" value={c.salesOwnerName} />}
            {c.internalNotes && (
              <div className="pt-2 border-t border-gray-100">
                <p className="text-[11px] text-gray-400">Internal Notes</p>
                <p className="text-xs text-gray-600 mt-0.5">{c.internalNotes}</p>
              </div>
            )}
            <div className="pt-2 border-t border-gray-100 text-[11px] text-gray-400">
              <p>Created: {formatDate(c.createdAt)}</p>
            </div>
          </CardContent>
        </Card>

        {/* Right: Financial + Trips */}
        <div className="lg:col-span-2 space-y-4">
          {/* Financial KPIs */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Card><CardContent className="p-3">
              <p className="text-xs text-gray-500">Credit Terms</p>
              <p className="text-sm font-semibold text-gray-900">{c.creditDays}d / {formatCurrency(c.creditLimit)}</p>
            </CardContent></Card>
            <Card><CardContent className="p-3">
              <p className="text-xs text-gray-500">Total Billed</p>
              <p className="text-sm font-semibold text-gray-900">{formatCurrency(c.totalBilled)}</p>
              <p className="text-[10px] text-gray-400">{c.totalTripsCount} trips</p>
            </CardContent></Card>
            <Card><CardContent className="p-3">
              <p className="text-xs text-gray-500">Outstanding</p>
              <p className="text-sm font-semibold text-amber-700">{formatCurrency(c.outstandingAmount)}</p>
              {c.overdueAmount > 0 && <p className="text-[10px] text-red-600">{formatCurrency(c.overdueAmount)} overdue</p>}
            </CardContent></Card>
            <Card><CardContent className="p-3">
              <p className="text-xs text-gray-500">Collected</p>
              <p className="text-sm font-semibold text-emerald-700">{formatCurrency(c.totalReceived)}</p>
            </CardContent></Card>
          </div>

          {/* Trip History */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-gray-900">Trip History ({trips.length})</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {tripsQuery.isLoading && <p className="px-4 py-3 text-sm text-gray-500">Loading...</p>}
              {tripsQuery.isError && <p className="px-4 py-3 text-sm text-red-600">{tripsQuery.error instanceof Error ? tripsQuery.error.message : "Error"}</p>}
              {!tripsQuery.isLoading && !tripsQuery.isError && trips.length === 0 && (
                <p className="px-4 py-3 text-sm text-gray-500">No trips yet.</p>
              )}
              {trips.length > 0 && (
                <div className="divide-y divide-gray-50">
                  {trips.map((trip) => (
                    <div key={trip.id} className="flex items-center justify-between px-4 py-2.5">
                      <div>
                        <span className="text-sm font-medium text-gray-900">{trip.tripCode}</span>
                        <p className="text-xs text-gray-500">{trip.route || "—"}</p>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-sm font-medium text-gray-900">{formatCurrency(trip.tripAmount)}</span>
                        <Badge variant="outline" className={`border-0 text-[10px] ${TRIP_STATUS_COLORS[trip.currentStage] ?? "bg-gray-100 text-gray-600"}`}>
                          {APP_TRIP_STATUS_LABELS[trip.currentStage as keyof typeof APP_TRIP_STATUS_LABELS] ?? prettify(trip.currentStage)}
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Receivables */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-gray-900">Receivables ({receivables.length})</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {receivablesQuery.isLoading && <p className="px-4 py-3 text-sm text-gray-500">Loading...</p>}
              {receivablesQuery.isError && <p className="px-4 py-3 text-sm text-red-600">{receivablesQuery.error instanceof Error ? receivablesQuery.error.message : "Error"}</p>}
              {!receivablesQuery.isLoading && !receivablesQuery.isError && receivables.length === 0 && (
                <p className="px-4 py-3 text-sm text-gray-500">No receivables yet.</p>
              )}
              {receivables.length > 0 && (
                <div className="divide-y divide-gray-50">
                  {receivables.map((r) => (
                    <div key={r.id} className="flex items-center justify-between px-4 py-2.5">
                      <div>
                        <span className="text-sm text-gray-900">{r.tripCode || "—"}</span>
                        <p className="text-xs text-gray-500">
                          Due: {r.dueDate ? formatDate(r.dueDate) : "—"}
                          {r.amountReceived > 0 && <span className="text-emerald-600 ml-2">Received: {formatCurrency(r.amountReceived)}</span>}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-medium text-gray-900">{formatCurrency(r.amountOutstanding ?? r.amount)}</p>
                        <Badge variant="outline" className={`text-[10px] border-0 ${RECEIVABLE_STATUS_COLORS[r.collectedStatus] ?? "bg-gray-100 text-gray-700"}`}>
                          {prettify(r.collectedStatus)}
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Edit Dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader><DialogTitle className="text-base">Edit Customer</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2 max-h-[60vh] overflow-y-auto">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1"><Label className="text-xs">Registered Name</Label>
                <Input className="h-8 text-sm" value={editForm.registeredName} onChange={(e) => setEditForm((p) => ({ ...p, registeredName: e.target.value }))} /></div>
              <div className="space-y-1"><Label className="text-xs">Contact Designation</Label>
                <Input className="h-8 text-sm" value={editForm.contactDesignation} onChange={(e) => setEditForm((p) => ({ ...p, contactDesignation: e.target.value }))} /></div>
            </div>
            <div className="space-y-1"><Label className="text-xs">Billing Address</Label>
              <Input className="h-8 text-sm" value={editForm.billingAddress} onChange={(e) => setEditForm((p) => ({ ...p, billingAddress: e.target.value }))} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1"><Label className="text-xs">GSTIN</Label>
                <Input className="h-8 text-sm" value={editForm.gstin} onChange={(e) => setEditForm((p) => ({ ...p, gstin: e.target.value.toUpperCase() }))} maxLength={15} /></div>
              <div className="space-y-1"><Label className="text-xs">PAN</Label>
                <Input className="h-8 text-sm" value={editForm.panNumber} onChange={(e) => setEditForm((p) => ({ ...p, panNumber: e.target.value.toUpperCase() }))} maxLength={10} /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1"><Label className="text-xs">Nature of Business</Label>
                <Input className="h-8 text-sm" value={editForm.natureOfBusiness} onChange={(e) => setEditForm((p) => ({ ...p, natureOfBusiness: e.target.value }))} /></div>
              <div className="space-y-1"><Label className="text-xs">Route Summary</Label>
                <Input className="h-8 text-sm" value={editForm.routeSummary} onChange={(e) => setEditForm((p) => ({ ...p, routeSummary: e.target.value }))} /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1"><Label className="text-xs">Credit Days</Label>
                <Input type="number" className="h-8 text-sm" value={editForm.creditDays} onChange={(e) => setEditForm((p) => ({ ...p, creditDays: e.target.value }))} /></div>
              <div className="space-y-1"><Label className="text-xs">Credit Limit (₹)</Label>
                <Input type="number" className="h-8 text-sm" value={editForm.creditLimit} onChange={(e) => setEditForm((p) => ({ ...p, creditLimit: e.target.value }))} /></div>
            </div>
            <div className="space-y-1"><Label className="text-xs">Internal Notes</Label>
              <Textarea className="text-sm resize-none" rows={2} value={editForm.internalNotes} onChange={(e) => setEditForm((p) => ({ ...p, internalNotes: e.target.value }))} maxLength={500} /></div>
            {editMutation.isError && <p className="text-sm text-red-600">{editMutation.error instanceof Error ? editMutation.error.message : "Failed"}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => setEditOpen(false)} disabled={editMutation.isPending}>Cancel</Button>
            <Button size="sm" className="h-8 text-xs" disabled={editMutation.isPending} onClick={() => editMutation.mutate()}>
              {editMutation.isPending ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Save className="h-3.5 w-3.5 mr-1" />}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function InfoRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-start gap-2 text-gray-600">
      <div className="mt-0.5 shrink-0">{icon}</div>
      <div>
        <p className="text-[11px] text-gray-400">{label}</p>
        <p className="text-sm text-gray-700">{value}</p>
      </div>
    </div>
  );
}
