"use client";

import Link from "next/link";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { PageHeader } from "@/components/shared/page-header";
import { useAuth } from "@/lib/auth/auth-context";
import { listVehicleLeads, moveVehicleLeadStage, onboardVehicleLead } from "@/lib/api/vehicle-crm";
import { queryKeys } from "@/lib/query/keys";
import { formatCurrency, formatDate } from "@/lib/formatters";
import { VEHICLE_LEAD_STAGE_LABELS } from "@/lib/types";
import type { VehicleLeadStage, VehicleLead } from "@/lib/types";
import { FIELD_LIMITS } from "@/lib/validation/client/field-limits";
import { sanitizeSingleLineInput } from "@/lib/validation/client/sanitizers";
import { sanitizePhoneInput } from "@/lib/validation/client/validators";
import { Truck, Users, CheckCircle2, LayoutGrid, List, Plus, Loader2, AlertTriangle } from "lucide-react";

const COLUMNS: VehicleLeadStage[] = ["new_entry", "contacted", "docs_pending", "onboarded", "rejected"];

export default function VehiclePipelinePage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [draggedLead, setDraggedLead] = useState<{ leadId: string; fromStage: VehicleLeadStage } | null>(null);
  const [dropStage, setDropStage] = useState<VehicleLeadStage | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  // Onboard dialog state
  const [onboardLeadId, setOnboardLeadId] = useState<string | null>(null);
  const [onboardForm, setOnboardForm] = useState({
    vendorName: "",
    vendorPhone: "",
    vendorNotes: "",
  });

  const boardQueryKey = queryKeys.vehicleCrmLeads({ view: "board" });
  const leadsQuery = useQuery({
    queryKey: boardQueryKey,
    queryFn: () => listVehicleLeads({ limit: 500, offset: 0 }),
    enabled: !!user,
  });
  const leads = leadsQuery.data ?? [];

  const moveStageMutation = useMutation({
    mutationFn: async ({ leadId, toStage }: { leadId: string; toStage: VehicleLeadStage }) =>
      moveVehicleLeadStage(leadId, { toStage }),
    onMutate: async ({ leadId, toStage }) => {
      setActionError(null);
      await queryClient.cancelQueries({ queryKey: boardQueryKey });
      const previous = queryClient.getQueryData<VehicleLead[]>(boardQueryKey) ?? [];
      queryClient.setQueryData<VehicleLead[]>(boardQueryKey, (current = []) =>
        current.map((lead) =>
          lead.id === leadId
            ? {
                ...lead,
                stage: toStage,
                updatedAt: new Date().toISOString(),
              }
            : lead,
        ),
      );
      return { previous };
    },
    onError: (error, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(boardQueryKey, context.previous);
      }
      setActionError(error instanceof Error ? error.message : "Unable to move lead");
    },
    onSettled: async () => {
      await queryClient.invalidateQueries({ queryKey: ["vehicle-crm", "leads"] });
      setDraggedLead(null);
      setDropStage(null);
    },
  });

  const onboardMutation = useMutation({
    mutationFn: async ({ leadId }: { leadId: string }) =>
      onboardVehicleLead(leadId, {
        vendorName: sanitizeSingleLineInput(onboardForm.vendorName, FIELD_LIMITS.companyName).trim(),
        vendorPhone: onboardForm.vendorPhone.trim(),
        vendorNotes: sanitizeSingleLineInput(onboardForm.vendorNotes, FIELD_LIMITS.notes).trim() || undefined,
      }),
    onSuccess: async () => {
      setOnboardLeadId(null);
      setOnboardForm({ vendorName: "", vendorPhone: "", vendorNotes: "" });
      await queryClient.invalidateQueries({ queryKey: ["vehicle-crm", "leads"] });
    },
    onError: (error) => {
      setActionError(error instanceof Error ? error.message : "Unable to onboard lead");
    },
  });

  // Pre-fill onboard form from lead data
  function openOnboardDialog(leadId: string) {
    const lead = leads.find((l) => l.id === leadId);
    if (lead) {
      setOnboardForm({
        vendorName: lead.isOwnerCumDriver ? lead.driverName : (lead.ownerName || lead.driverName),
        vendorPhone: lead.isOwnerCumDriver ? lead.mobile : (lead.ownerContact || lead.mobile),
        vendorNotes: "",
      });
    }
    setOnboardLeadId(leadId);
  }

  async function handleDrop(toStage: VehicleLeadStage) {
    if (!draggedLead || moveStageMutation.isPending) return;
    const { leadId, fromStage } = draggedLead;
    if (fromStage === toStage) {
      setDraggedLead(null);
      setDropStage(null);
      return;
    }

    // Intercept drag-to-Onboarded: open dialog
    if (toStage === "onboarded") {
      openOnboardDialog(leadId);
      setDraggedLead(null);
      setDropStage(null);
      return;
    }

    await moveStageMutation.mutateAsync({ leadId, toStage });
  }

  const totalVehicles = leads.length;
  const inPipeline = leads.filter((v) => !["onboarded", "rejected"].includes(v.stage)).length;
  const onboarded = leads.filter((v) => v.stage === "onboarded").length;
  const queryError =
    leadsQuery.error instanceof Error ? leadsQuery.error.message : "Unable to fetch vehicle leads";

  return (
    <div className="space-y-4">
      <PageHeader title="Vehicle Pipeline" description="Source and onboard drivers & vehicles">
        <div className="flex items-center gap-2">
          <div className="flex items-center rounded-md border border-gray-200 p-0.5">
            <Button size="sm" className="h-7 px-2 text-xs" asChild>
              <Link href="/vehicle-crm">
                <LayoutGrid className="h-3.5 w-3.5" />
                Board
              </Link>
            </Button>
            <Button size="sm" variant="ghost" className="h-7 px-2 text-xs text-gray-600" asChild>
              <Link href="/vehicle-crm/all">
                <List className="h-3.5 w-3.5" />
                List
              </Link>
            </Button>
          </div>
          <Button size="sm" className="h-8 text-xs" asChild>
            <Link href="/vehicle-crm/new">
              <Plus className="h-3.5 w-3.5" />
              Add Vehicle
            </Link>
          </Button>
        </div>
      </PageHeader>

      {/* Stats bar */}
      <div className="grid grid-cols-3 gap-3">
        <Card>
          <CardContent className="p-3 flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-50">
              <Truck className="h-4 w-4 text-blue-600" />
            </div>
            <div>
              <p className="text-xs text-gray-500">Total Entries</p>
              <p className="text-lg font-semibold text-gray-900">{totalVehicles}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-50">
              <Users className="h-4 w-4 text-amber-600" />
            </div>
            <div>
              <p className="text-xs text-gray-500">In Pipeline</p>
              <p className="text-lg font-semibold text-gray-900">{inPipeline}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-50">
              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
            </div>
            <div>
              <p className="text-xs text-gray-500">Onboarded</p>
              <p className="text-lg font-semibold text-gray-900">{onboarded}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {leadsQuery.isLoading && (
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-gray-500">Loading vehicle leads...</p>
          </CardContent>
        </Card>
      )}

      {!leadsQuery.isLoading && leadsQuery.isError && (
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-red-600">{queryError}</p>
          </CardContent>
        </Card>
      )}

      {actionError && (
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-red-600">{actionError}</p>
          </CardContent>
        </Card>
      )}

      {/* Kanban board */}
      {!leadsQuery.isLoading && !leadsQuery.isError && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        {COLUMNS.map((col) => {
          const colLeads = leads.filter((v) => v.stage === col);
          return (
            <div
              key={col}
              className={`space-y-2 rounded-lg p-1 transition-colors ${dropStage === col ? "bg-blue-50" : ""}`}
              onDragOver={(event) => {
                event.preventDefault();
                if (draggedLead) setDropStage(col);
              }}
              onDragLeave={() => {
                if (dropStage === col) setDropStage(null);
              }}
              onDrop={(event) => {
                event.preventDefault();
                void handleDrop(col);
              }}
            >
              <div className="flex items-center justify-between px-1">
                <h3 className="text-xs font-medium text-gray-500 uppercase tracking-wider">
                  {VEHICLE_LEAD_STAGE_LABELS[col]}
                </h3>
                <span className="text-[11px] text-gray-400">{colLeads.length}</span>
              </div>
              <div className="space-y-2">
                {colLeads.map((vl) => {
                  const isLocked = !!vl.convertedVendorId;
                  return (
                    <VehicleLeadCard
                      key={vl.id}
                      vehicleLead={vl}
                      isLocked={isLocked}
                      onDragStart={() => {
                        if (isLocked) return;
                        setActionError(null);
                        setDraggedLead({ leadId: vl.id, fromStage: vl.stage });
                      }}
                      onDragEnd={() => {
                        setDraggedLead(null);
                        setDropStage(null);
                      }}
                    />
                  );
                })}
                {colLeads.length === 0 && (
                  <div className="rounded-lg border border-dashed border-gray-200 p-4 text-center">
                    <p className="text-xs text-gray-400">
                      {user?.role === "sales_vehicles" ? "No assigned leads" : "No entries"}
                    </p>
                  </div>
                )}
              </div>
            </div>
          );
        })}
        </div>
      )}

      {/* Onboard Dialog */}
      <Dialog
        open={onboardLeadId !== null}
        onOpenChange={(open) => {
          if (!open) {
            setOnboardLeadId(null);
            setOnboardForm({ vendorName: "", vendorPhone: "", vendorNotes: "" });
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Onboard Vehicle & Vendor</DialogTitle>
            <DialogDescription className="flex items-start gap-2 pt-2">
              <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
              <span>Vendor and vehicle records will be created. This cannot be undone.</span>
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1">
              <Label className="text-xs">Vendor Name *</Label>
              <Input
                value={onboardForm.vendorName}
                onChange={(e) =>
                  setOnboardForm((p) => ({
                    ...p,
                    vendorName: sanitizeSingleLineInput(e.target.value, FIELD_LIMITS.companyName),
                  }))
                }
                className="h-8 text-sm"
                maxLength={FIELD_LIMITS.companyName}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Contact Phone *</Label>
              <Input
                value={onboardForm.vendorPhone}
                onChange={(e) =>
                  setOnboardForm((p) => ({
                    ...p,
                    vendorPhone: sanitizePhoneInput(e.target.value, FIELD_LIMITS.phoneDigits),
                  }))
                }
                className="h-8 text-sm"
                inputMode="tel"
                maxLength={FIELD_LIMITS.phoneDigits + 1}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Notes</Label>
              <Input
                value={onboardForm.vendorNotes}
                onChange={(e) =>
                  setOnboardForm((p) => ({
                    ...p,
                    vendorNotes: sanitizeSingleLineInput(e.target.value, FIELD_LIMITS.notes),
                  }))
                }
                className="h-8 text-sm"
                placeholder="Optional notes"
                maxLength={FIELD_LIMITS.notes}
              />
            </div>
          </div>
          {onboardMutation.isError && (
            <p className="text-sm text-red-600">
              {onboardMutation.error instanceof Error ? onboardMutation.error.message : "Failed to onboard"}
            </p>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setOnboardLeadId(null);
                setOnboardForm({ vendorName: "", vendorPhone: "", vendorNotes: "" });
              }}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={() => {
                if (onboardLeadId) {
                  onboardMutation.mutate({ leadId: onboardLeadId });
                }
              }}
              disabled={onboardMutation.isPending || !onboardForm.vendorName.trim() || !onboardForm.vendorPhone.trim()}
            >
              {onboardMutation.isPending && <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />}
              Confirm & Onboard
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function VehicleLeadCard({
  vehicleLead: vl,
  isLocked,
  onDragStart,
  onDragEnd,
}: {
  vehicleLead: VehicleLead;
  isLocked: boolean;
  onDragStart: () => void;
  onDragEnd: () => void;
}) {
  return (
    <div
      draggable={!isLocked}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      className={isLocked ? "cursor-default" : "cursor-grab active:cursor-grabbing"}
    >
      <Link href={`/vehicle-crm/${vl.id}`}>
        <Card className="hover:bg-gray-50/50 transition-colors cursor-pointer">
          <CardContent className="p-3">
            <div className="flex items-start justify-between mb-1">
              <p className="text-sm font-medium text-gray-900 line-clamp-1">{vl.driverName}</p>
              {vl.convertedVendorId ? (
                <Badge variant="outline" className="border-0 text-[10px] shrink-0 ml-1 bg-emerald-50 text-emerald-700">
                  Onboarded
                </Badge>
              ) : vl.isOwnerCumDriver ? (
                <Badge variant="outline" className="border-0 text-[10px] shrink-0 ml-1 bg-indigo-50 text-indigo-700">
                  Owner
                </Badge>
              ) : null}
            </div>
            <p className="text-xs text-gray-500 mb-1">{vl.vehicleRegistration}</p>
            <p className="text-xs text-gray-600 mb-1">{vl.vehicleType} &middot; {vl.vehicleCapacity}</p>
            <p className="text-[11px] text-gray-400 mb-1">{vl.preferredRoute}</p>
            <p className="text-xs font-medium text-gray-700">{formatCurrency(vl.marketRate)}</p>
            {vl.nextFollowUp && (
              <p className="text-[11px] text-blue-600 mt-1">Follow-up: {formatDate(vl.nextFollowUp)}</p>
            )}
          </CardContent>
        </Card>
      </Link>
    </div>
  );
}
