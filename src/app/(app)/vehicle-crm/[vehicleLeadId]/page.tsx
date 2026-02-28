"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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
import { listFleetVendors } from "@/lib/api/fleet";
import {
  addVehicleLeadActivity,
  getVehicleLeadById,
  listVehicleLeadActivities,
  moveVehicleLeadStage,
  onboardVehicleLead,
} from "@/lib/api/vehicle-crm";
import { queryKeys } from "@/lib/query/keys";
import { formatCurrency, formatDate } from "@/lib/formatters";
import { VEHICLE_LEAD_STAGES, VEHICLE_LEAD_STAGE_LABELS } from "@/lib/types";
import type { Role, VehicleLeadStage, VehicleLeadActivityType, VehicleLeadActivity } from "@/lib/types";
import { FIELD_LIMITS } from "@/lib/validation/client/field-limits";
import { sanitizeMultilineInput, sanitizeSingleLineInput } from "@/lib/validation/client/sanitizers";
import { sanitizePhoneInput } from "@/lib/validation/client/validators";
import {
  ArrowLeft, Phone, MapPin, Truck, Calendar, User, Home,
  MessageSquare, PhoneCall, MessageCircle, Video, StickyNote, ArrowRightLeft, FileUp,
  Loader2, AlertTriangle,
} from "lucide-react";

const STAGE_COLORS: Record<VehicleLeadStage, string> = {
  new_entry: "bg-gray-100 text-gray-700",
  contacted: "bg-blue-50 text-blue-700",
  docs_pending: "bg-amber-50 text-amber-700",
  onboarded: "bg-emerald-50 text-emerald-700",
  rejected: "bg-red-50 text-red-700",
};

const ACTIVITY_ICONS: Record<VehicleLeadActivityType, typeof PhoneCall> = {
  call: PhoneCall,
  whatsapp: MessageCircle,
  meeting: Video,
  note: StickyNote,
  stage_change: ArrowRightLeft,
  doc_upload: FileUp,
};

const ACTIVITY_COLORS: Record<VehicleLeadActivityType, string> = {
  call: "bg-blue-100 text-blue-700",
  whatsapp: "bg-green-100 text-green-700",
  meeting: "bg-emerald-100 text-emerald-700",
  note: "bg-gray-100 text-gray-700",
  stage_change: "bg-amber-100 text-amber-700",
  doc_upload: "bg-purple-100 text-purple-700",
};

const VEHICLE_CRM_ALLOWED_ROLES: Role[] = ["sales_vehicles", "admin", "super_admin"];

export default function VehicleLeadDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const vehicleLeadId = params.vehicleLeadId as string;
  const [newActivity, setNewActivity] = useState("");
  const [activityType, setActivityType] = useState<VehicleLeadActivityType>("note");
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionInfo, setActionInfo] = useState<string | null>(null);
  const hasRoleAccess = !!user && VEHICLE_CRM_ALLOWED_ROLES.includes(user.role);

  // Onboard dialog state
  const [showOnboard, setShowOnboard] = useState(false);
  const [onboardForm, setOnboardForm] = useState({
    onboardMode: "create_new_vendor" as "create_new_vendor" | "attach_to_existing_vendor",
    existingVendorId: "",
    vendorName: "",
    vendorPhone: "",
    vendorNotes: "",
  });

  const leadQuery = useQuery({
    queryKey: queryKeys.vehicleCrmLead(vehicleLeadId),
    queryFn: () => getVehicleLeadById(vehicleLeadId),
    enabled: hasRoleAccess && !!vehicleLeadId,
  });

  const activitiesQuery = useQuery({
    queryKey: queryKeys.vehicleCrmLeadActivities(vehicleLeadId),
    queryFn: () => listVehicleLeadActivities(vehicleLeadId),
    enabled: hasRoleAccess && !!vehicleLeadId,
  });

  const onboardVendorsQuery = useQuery({
    queryKey: queryKeys.fleetVendors({}),
    queryFn: () => listFleetVendors({ limit: 300 }),
    enabled: hasRoleAccess && showOnboard && onboardForm.onboardMode === "attach_to_existing_vendor",
  });

  const addActivityMutation = useMutation({
    mutationFn: async () =>
      addVehicleLeadActivity(vehicleLeadId, {
        type: activityType,
        description: newActivity.trim(),
      }),
    onMutate: () => {
      setActionError(null);
      setActionInfo(null);
    },
    onSuccess: async () => {
      setNewActivity("");
      setActionInfo("Activity added.");
      await queryClient.invalidateQueries({ queryKey: queryKeys.vehicleCrmLeadActivities(vehicleLeadId) });
    },
    onError: (error) => {
      setActionError(error instanceof Error ? error.message : "Unable to add activity");
    },
  });

  const moveStageMutation = useMutation({
    mutationFn: async ({ toStage, note }: { toStage: VehicleLeadStage; note?: string }) =>
      moveVehicleLeadStage(vehicleLeadId, { toStage, note }),
    onMutate: () => {
      setActionError(null);
      setActionInfo(null);
    },
    onSuccess: async (updated) => {
      queryClient.setQueryData(queryKeys.vehicleCrmLead(vehicleLeadId), updated);
      setActionInfo(`Lead moved to ${VEHICLE_LEAD_STAGE_LABELS[updated.stage]}.`);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["vehicle-crm", "leads"] }),
        queryClient.invalidateQueries({ queryKey: queryKeys.vehicleCrmLeadActivities(vehicleLeadId) }),
      ]);
    },
    onError: (error) => {
      setActionError(error instanceof Error ? error.message : "Unable to move stage");
    },
  });

  const onboardMutation = useMutation({
    mutationFn: async () =>
      onboardVehicleLead(vehicleLeadId, {
        onboardMode: onboardForm.onboardMode,
        existingVendorId:
          onboardForm.onboardMode === "attach_to_existing_vendor" ? onboardForm.existingVendorId : undefined,
        vendorName:
          onboardForm.onboardMode === "create_new_vendor"
            ? sanitizeSingleLineInput(onboardForm.vendorName, FIELD_LIMITS.companyName).trim()
            : undefined,
        vendorPhone: onboardForm.onboardMode === "create_new_vendor" ? onboardForm.vendorPhone.trim() : undefined,
        vendorNotes: sanitizeSingleLineInput(onboardForm.vendorNotes, FIELD_LIMITS.notes).trim() || undefined,
      }),
    onSuccess: async () => {
      setShowOnboard(false);
      setOnboardForm({
        onboardMode: "create_new_vendor",
        existingVendorId: "",
        vendorName: "",
        vendorPhone: "",
        vendorNotes: "",
      });
      setActionInfo("Vehicle and vendor onboarded successfully.");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.vehicleCrmLead(vehicleLeadId) }),
        queryClient.invalidateQueries({ queryKey: ["vehicle-crm", "leads"] }),
        queryClient.invalidateQueries({ queryKey: queryKeys.vehicleCrmLeadActivities(vehicleLeadId) }),
      ]);
    },
    onError: (error) => {
      setActionError(error instanceof Error ? error.message : "Unable to onboard");
    },
  });

  if (!hasRoleAccess) {
    return (
      <div className="p-4 sm:p-6">
        <PageHeader title="Vehicle CRM" description="Access denied" />
        <p className="text-sm text-gray-500 mt-2">
          Vehicle CRM is available only to Vehicle Sales and Admin roles.
        </p>
      </div>
    );
  }

  if (leadQuery.isLoading) {
    return (
      <div className="p-4 sm:p-6">
        <p className="text-sm text-gray-500">Loading vehicle entry...</p>
      </div>
    );
  }

  if (leadQuery.isError) {
    return (
      <div className="p-4 sm:p-6 space-y-2">
        <p className="text-sm text-red-600">
          {leadQuery.error instanceof Error ? leadQuery.error.message : "Unable to fetch vehicle entry."}
        </p>
        <Link href="/vehicle-crm" className="text-sm text-blue-600 hover:underline">
          Back to pipeline
        </Link>
      </div>
    );
  }

  const vl = leadQuery.data;
  if (!vl) {
    return (
      <div className="p-4 sm:p-6">
        <p className="text-sm text-gray-500">Vehicle entry not found or not assigned to you.</p>
        <Link href="/vehicle-crm" className="text-sm text-blue-600 hover:underline">Back to pipeline</Link>
      </div>
    );
  }

  const activities = activitiesQuery.data ?? [];
  const isConverted = !!vl.convertedVendorId;

  // Build stage action buttons (excluding onboarded — must use dialog)
  const nextActions = isConverted
    ? []
    : VEHICLE_LEAD_STAGES
        .filter((stage) => stage !== vl.stage && stage !== "onboarded")
        .map((stage) => ({
          toStage: stage,
          label: `Move to ${VEHICLE_LEAD_STAGE_LABELS[stage]}`,
          tone: stage === "rejected" ? "danger" : "default",
        }));

  const isBusy = addActivityMutation.isPending || moveStageMutation.isPending || onboardMutation.isPending;

  function openOnboardDialog() {
    setOnboardForm({
      onboardMode: "create_new_vendor",
      existingVendorId: "",
      vendorName: vl!.isOwnerCumDriver ? vl!.driverName : (vl!.ownerName || vl!.driverName),
      vendorPhone: vl!.isOwnerCumDriver ? vl!.mobile : (vl!.ownerContact || vl!.mobile),
      vendorNotes: "",
    });
    setShowOnboard(true);
  }

  async function handleAddActivity() {
    if (!newActivity.trim()) return;
    await addActivityMutation.mutateAsync();
  }

  async function handleStageMove(toStage: VehicleLeadStage) {
    // Intercept onboarded → open dialog
    if (toStage === "onboarded") {
      openOnboardDialog();
      return;
    }

    let note = "";
    if (toStage === "rejected") {
      const reason = window.prompt("Optional rejection note:", "");
      if (reason === null) return;
      note = reason.trim();
    }
    await moveStageMutation.mutateAsync({ toStage, note: note || undefined });
  }

  const isAttachMode = onboardForm.onboardMode === "attach_to_existing_vendor";

  return (
    <div className="p-4 sm:p-6 space-y-4">
      {/* Back nav + header */}
      <div className="flex items-center gap-2 text-sm">
        <button onClick={() => router.push("/vehicle-crm")} className="flex items-center gap-1 text-gray-500 hover:text-gray-700">
          <ArrowLeft className="h-4 w-4" />
          Pipeline
        </button>
        <span className="text-gray-300">/</span>
        <span className="text-gray-700">{vl.driverName}</span>
      </div>

      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <h1 className="text-lg font-semibold text-gray-900">{vl.driverName}</h1>
            <Badge variant="outline" className={`border-0 text-xs ${STAGE_COLORS[vl.stage]}`}>
              {VEHICLE_LEAD_STAGE_LABELS[vl.stage]}
            </Badge>
            {vl.isOwnerCumDriver && (
              <Badge variant="outline" className="border-0 text-[10px] bg-indigo-50 text-indigo-700">
                Owner Driver
              </Badge>
            )}
            {isConverted && (
              <Badge variant="outline" className="border-0 text-[10px] bg-emerald-50 text-emerald-700">
                Onboarded
              </Badge>
            )}
          </div>
          <p className="text-sm text-gray-500">{vl.vehicleRegistration} &middot; {vl.vehicleType}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {!isConverted && (
            <Button
              size="sm"
              className="h-8 text-xs bg-emerald-600 hover:bg-emerald-700"
              disabled={isBusy}
              onClick={openOnboardDialog}
            >
              Move to Onboarded
            </Button>
          )}
          {nextActions.map((action) => (
            <Button
              key={action.toStage}
              size="sm"
              variant="outline"
              disabled={isBusy}
              onClick={() => void handleStageMove(action.toStage)}
              className={
                action.tone === "danger"
                  ? "h-8 text-xs bg-red-50 text-red-700 border-red-200 hover:bg-red-100"
                  : "h-8 text-xs bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100"
              }
            >
              {action.label}
            </Button>
          ))}
        </div>
      </div>

      {actionError && (
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-red-600">{actionError}</p>
          </CardContent>
        </Card>
      )}

      {actionInfo && (
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-emerald-700">{actionInfo}</p>
          </CardContent>
        </Card>
      )}

      {/* Onboard Dialog */}
      <Dialog
        open={showOnboard}
        onOpenChange={(open) => {
          if (!open) {
            setShowOnboard(false);
            setOnboardForm({
              onboardMode: "create_new_vendor",
              existingVendorId: "",
              vendorName: "",
              vendorPhone: "",
              vendorNotes: "",
            });
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
              <Label className="text-xs">Onboard Mode</Label>
              <Select
                value={onboardForm.onboardMode}
                onValueChange={(value) =>
                  setOnboardForm((p) => ({
                    ...p,
                    onboardMode: value as "create_new_vendor" | "attach_to_existing_vendor",
                    existingVendorId: "",
                  }))
                }
              >
                <SelectTrigger className="h-8 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="create_new_vendor">Create New Vendor</SelectItem>
                  <SelectItem value="attach_to_existing_vendor">Attach to Existing Vendor</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {isAttachMode && (
              <div className="space-y-1">
                <Label className="text-xs">Existing Vendor *</Label>
                <Select
                  value={onboardForm.existingVendorId || "_none"}
                  onValueChange={(value) =>
                    setOnboardForm((p) => ({
                      ...p,
                      existingVendorId: value === "_none" ? "" : value,
                    }))
                  }
                >
                  <SelectTrigger className="h-8 text-sm">
                    <SelectValue placeholder={onboardVendorsQuery.isLoading ? "Loading vendors..." : "Select vendor"} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="_none">Select vendor</SelectItem>
                    {(onboardVendorsQuery.data ?? []).map((vendor) => (
                      <SelectItem key={vendor.id} value={vendor.id}>
                        {vendor.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {!isAttachMode && (
              <>
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
              </>
            )}
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
                setShowOnboard(false);
                setOnboardForm({
                  onboardMode: "create_new_vendor",
                  existingVendorId: "",
                  vendorName: "",
                  vendorPhone: "",
                  vendorNotes: "",
                });
              }}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={() => onboardMutation.mutate()}
              disabled={
                onboardMutation.isPending ||
                (isAttachMode
                  ? !onboardForm.existingVendorId
                  : !onboardForm.vendorName.trim() || !onboardForm.vendorPhone.trim())
              }
            >
              {onboardMutation.isPending && <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />}
              Confirm & Onboard
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Details card */}
        <Card className="lg:col-span-1">
          <CardContent className="p-4 space-y-3">
            <h2 className="text-sm font-semibold text-gray-900">Driver & Vehicle Details</h2>
            <div className="space-y-2.5 text-sm">
              <div className="flex items-center gap-2 text-gray-600">
                <Phone className="h-3.5 w-3.5 text-gray-400" />
                {vl.mobile}
              </div>
              {vl.alternateContact && (
                <div className="flex items-center gap-2 text-gray-600">
                  <Phone className="h-3.5 w-3.5 text-gray-400" />
                  <span className="text-gray-400 text-xs">Alt:</span> {vl.alternateContact}
                </div>
              )}
              {!vl.isOwnerCumDriver && (
                <div className="flex items-center gap-2 text-gray-600">
                  <User className="h-3.5 w-3.5 text-gray-400" />
                  Owner: {vl.ownerName} ({vl.ownerContact})
                </div>
              )}
              <div className="flex items-center gap-2 text-gray-600">
                <MapPin className="h-3.5 w-3.5 text-gray-400" />
                {vl.preferredRoute}
              </div>
              <div className="flex items-center gap-2 text-gray-600">
                <Truck className="h-3.5 w-3.5 text-gray-400" />
                {vl.vehicleType} &middot; {vl.vehicleLength} &middot; {vl.vehicleCapacity}
              </div>
              <div className="flex items-center gap-2 text-gray-600">
                <Truck className="h-3.5 w-3.5 text-gray-400" />
                Reg: {vl.vehicleRegistration}
              </div>
              <div className="flex items-center gap-2 text-gray-600">
                <Home className="h-3.5 w-3.5 text-gray-400" />
                <span className="text-xs">Current: {vl.currentAddress}</span>
              </div>
              {vl.permanentAddress && vl.permanentAddress !== vl.currentAddress && (
                <div className="flex items-center gap-2 text-gray-600">
                  <Home className="h-3.5 w-3.5 text-gray-400" />
                  <span className="text-xs">Permanent: {vl.permanentAddress}</span>
                </div>
              )}
              {vl.nextFollowUp && (
                <div className="flex items-center gap-2 text-gray-600">
                  <Calendar className="h-3.5 w-3.5 text-gray-400" />
                  Follow-up: {formatDate(vl.nextFollowUp)}
                </div>
              )}
            </div>
            <div className="pt-2 border-t border-gray-100">
              <p className="text-xs font-medium text-gray-700 mb-1">Market Rate: {formatCurrency(vl.marketRate)}</p>
            </div>
            {vl.remarks && (
              <div className="pt-2 border-t border-gray-100">
                <p className="text-xs text-gray-500">{vl.remarks}</p>
              </div>
            )}
            <div className="pt-2 border-t border-gray-100 text-[11px] text-gray-400">
              <p>Added: {formatDate(vl.createdAt)}</p>
              <p>Updated: {formatDate(vl.updatedAt)}</p>
              <p>Added by: {vl.addedByName}</p>
            </div>
          </CardContent>
        </Card>

        {/* Activity timeline */}
        <Card className="lg:col-span-2">
          <CardContent className="p-4 space-y-4">
            <h2 className="text-sm font-semibold text-gray-900">Activity Timeline</h2>

            {/* Add activity form */}
            <div className="flex gap-2">
              <Select value={activityType} onValueChange={(value) => setActivityType(value as VehicleLeadActivityType)}>
                <SelectTrigger className="w-[120px] h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="note">Note</SelectItem>
                  <SelectItem value="call">Call</SelectItem>
                  <SelectItem value="whatsapp">WhatsApp</SelectItem>
                  <SelectItem value="meeting">Meeting</SelectItem>
                  <SelectItem value="doc_upload">Doc Upload</SelectItem>
                </SelectContent>
              </Select>
              <Textarea
                placeholder="Add a note, call log, or update..."
                value={newActivity}
                onChange={(e) => setNewActivity(sanitizeMultilineInput(e.target.value, FIELD_LIMITS.notes))}
                rows={1}
                className="text-sm resize-none flex-1 min-h-[32px]"
                maxLength={FIELD_LIMITS.notes}
              />
              <Button
                size="sm"
                className="h-8 text-xs shrink-0"
                onClick={() => void handleAddActivity()}
                disabled={!newActivity.trim() || isBusy}
              >
                <MessageSquare className="h-3.5 w-3.5 mr-1" />
                {addActivityMutation.isPending ? "Adding..." : "Add"}
              </Button>
            </div>

            {/* Timeline */}
            <div className="space-y-3">
              {activitiesQuery.isLoading && (
                <p className="text-sm text-gray-400 py-2">Loading activities...</p>
              )}
              {!activitiesQuery.isLoading && activitiesQuery.isError && (
                <p className="text-sm text-red-600 py-2">
                  {activitiesQuery.error instanceof Error ? activitiesQuery.error.message : "Unable to fetch activities"}
                </p>
              )}
              {activities.map((activity) => (
                <ActivityItem key={activity.id} activity={activity} />
              ))}
              {!activitiesQuery.isLoading && !activitiesQuery.isError && activities.length === 0 && (
                <p className="text-sm text-gray-400 py-4 text-center">No activities recorded yet.</p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function ActivityItem({ activity }: { activity: VehicleLeadActivity }) {
  const Icon = ACTIVITY_ICONS[activity.type];
  const colorClass = ACTIVITY_COLORS[activity.type];
  const timestamp = new Date(activity.createdAt);
  const timeStr = timestamp.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
  const dateStr = formatDate(activity.createdAt.split("T")[0]);

  return (
    <div className="flex gap-3">
      <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${colorClass}`}>
        <Icon className="h-3.5 w-3.5" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm text-gray-700">{activity.description}</p>
        <div className="flex items-center gap-2 mt-0.5">
          <span className="text-[11px] text-gray-400">{activity.createdBy}</span>
          <span className="text-[11px] text-gray-300">&middot;</span>
          <span className="text-[11px] text-gray-400">{dateStr} at {timeStr}</span>
        </div>
      </div>
    </div>
  );
}
