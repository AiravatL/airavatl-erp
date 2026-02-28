"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
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
import {
  getConsignerLeadById,
  listConsignerLeadActivities,
  addConsignerLeadActivity,
  moveConsignerLeadStage,
  winAndConvertConsignerLead,
} from "@/lib/api/consigner-crm";
import { queryKeys } from "@/lib/query/keys";
import { formatCurrency, formatDate } from "@/lib/formatters";
import { LEAD_STAGE_LABELS, LEAD_SOURCE_LABELS } from "@/lib/types";
import type { LeadStage, LeadActivityType, LeadActivity } from "@/lib/types";
import { FIELD_LIMITS } from "@/lib/validation/client/field-limits";
import { sanitizeMultilineInput, sanitizeSingleLineInput } from "@/lib/validation/client/sanitizers";
import { sanitizeDecimalInput, sanitizeIntegerInput } from "@/lib/validation/client/validators";
import {
  ArrowLeft, Phone, Mail, MapPin, IndianRupee, Truck, Calendar,
  MessageSquare, PhoneCall, Video, StickyNote, ArrowRightLeft,
  Loader2, AlertTriangle,
} from "lucide-react";

const STAGE_COLORS: Record<LeadStage, string> = {
  new_enquiry: "bg-gray-100 text-gray-700",
  contacted: "bg-blue-50 text-blue-700",
  quote_sent: "bg-purple-50 text-purple-700",
  negotiation: "bg-amber-50 text-amber-700",
  won: "bg-emerald-50 text-emerald-700",
  lost: "bg-red-50 text-red-700",
};

const PRIORITY_COLORS: Record<string, string> = {
  high: "bg-red-50 text-red-700",
  medium: "bg-amber-50 text-amber-700",
  low: "bg-gray-100 text-gray-600",
};

const ACTIVITY_ICONS: Record<LeadActivityType, typeof PhoneCall> = {
  call: PhoneCall,
  email: Mail,
  meeting: Video,
  note: StickyNote,
  stage_change: ArrowRightLeft,
};

const ACTIVITY_COLORS: Record<LeadActivityType, string> = {
  call: "bg-blue-100 text-blue-700",
  email: "bg-purple-100 text-purple-700",
  meeting: "bg-emerald-100 text-emerald-700",
  note: "bg-gray-100 text-gray-700",
  stage_change: "bg-amber-100 text-amber-700",
};

const NEXT_STAGE: Partial<Record<LeadStage, LeadStage>> = {
  new_enquiry: "contacted",
  contacted: "quote_sent",
  quote_sent: "negotiation",
  negotiation: "won",
};

export default function LeadDetailPage() {
  const params = useParams();
  const router = useRouter();
  const queryClient = useQueryClient();
  const leadId = params.leadId as string;

  const [newActivity, setNewActivity] = useState("");
  const [activityType, setActivityType] = useState<string>("note");

  // Win-convert dialog state
  const [showWinConvert, setShowWinConvert] = useState(false);
  const [winConvertForm, setWinConvertForm] = useState({
    creditDays: "30",
    creditLimit: "0",
    address: "",
    gstin: "",
  });

  const leadQuery = useQuery({
    queryKey: queryKeys.consignerCrmLead(leadId),
    queryFn: () => getConsignerLeadById(leadId),
    enabled: !!leadId,
  });

  const activitiesQuery = useQuery({
    queryKey: queryKeys.consignerCrmLeadActivities(leadId),
    queryFn: () => listConsignerLeadActivities(leadId),
    enabled: !!leadId,
  });

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: queryKeys.consignerCrmLead(leadId) });
    queryClient.invalidateQueries({ queryKey: queryKeys.consignerCrmLeadActivities(leadId) });
    queryClient.invalidateQueries({ queryKey: ["consigner-crm", "leads"] });
  };

  const addActivityMutation = useMutation({
    mutationFn: () =>
      addConsignerLeadActivity(leadId, {
        type: activityType as LeadActivityType,
        description: newActivity.trim(),
      }),
    onSuccess: () => {
      setNewActivity("");
      invalidateAll();
    },
  });

  const moveStageMutation = useMutation({
    mutationFn: (toStage: LeadStage) =>
      moveConsignerLeadStage(leadId, { toStage }),
    onSuccess: () => invalidateAll(),
  });

  const winConvertMutation = useMutation({
    mutationFn: () =>
      winAndConvertConsignerLead(leadId, {
        creditDays: Number(winConvertForm.creditDays) || 30,
        creditLimit: Number(winConvertForm.creditLimit) || 0,
        address: sanitizeSingleLineInput(winConvertForm.address, FIELD_LIMITS.address).trim() || undefined,
        gstin: sanitizeSingleLineInput(winConvertForm.gstin.toUpperCase(), FIELD_LIMITS.gstin).trim() || undefined,
      }),
    onSuccess: () => {
      setShowWinConvert(false);
      setWinConvertForm({ creditDays: "30", creditLimit: "0", address: "", gstin: "" });
      invalidateAll();
    },
  });

  const lead = leadQuery.data;
  const activities = activitiesQuery.data ?? [];

  if (leadQuery.isLoading) {
    return (
      <div className="p-4 sm:p-6">
        <p className="text-sm text-gray-500">Loading lead...</p>
      </div>
    );
  }

  if (leadQuery.isError || !lead) {
    return (
      <div className="p-4 sm:p-6">
        <p className="text-sm text-gray-500">Lead not found.</p>
        <Link href="/consigner-crm" className="text-sm text-blue-600 hover:underline">Back to pipeline</Link>
      </div>
    );
  }

  const isConverted = !!lead.convertedCustomerId;
  const nextStage = NEXT_STAGE[lead.stage];
  // If next stage is "won", open the dialog instead
  const showMoveToNext = nextStage && nextStage !== "won" && !isConverted;
  const showMoveToWon = !isConverted && lead.stage !== "won";

  return (
    <div className="p-4 sm:p-6 space-y-4">
      {/* Back nav */}
      <div className="flex items-center gap-2 text-sm">
        <button onClick={() => router.push("/consigner-crm")} className="flex items-center gap-1 text-gray-500 hover:text-gray-700">
          <ArrowLeft className="h-4 w-4" />
          Pipeline
        </button>
        <span className="text-gray-300">/</span>
        <span className="text-gray-700">{lead.companyName}</span>
      </div>

      {/* Header + actions */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <h1 className="text-lg font-semibold text-gray-900">{lead.companyName}</h1>
            <Badge variant="outline" className={`border-0 text-xs ${STAGE_COLORS[lead.stage]}`}>
              {LEAD_STAGE_LABELS[lead.stage]}
            </Badge>
            <Badge variant="outline" className={`border-0 text-[10px] ${PRIORITY_COLORS[lead.priority]}`}>
              {lead.priority}
            </Badge>
          </div>
          <p className="text-sm text-gray-500">{lead.contactPerson} &middot; {LEAD_SOURCE_LABELS[lead.source]}</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          {showMoveToNext && nextStage && (
            <Button
              size="sm"
              variant="outline"
              className="h-8 text-xs"
              onClick={() => moveStageMutation.mutate(nextStage)}
              disabled={moveStageMutation.isPending}
            >
              {moveStageMutation.isPending && <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />}
              Move to {LEAD_STAGE_LABELS[nextStage]}
            </Button>
          )}
          {showMoveToWon && (
            <Button
              size="sm"
              className="h-8 text-xs bg-emerald-600 hover:bg-emerald-700"
              onClick={() => setShowWinConvert(true)}
            >
              Move to Won
            </Button>
          )}
          {!isConverted && lead.stage !== "won" && lead.stage !== "lost" && (
            <Button
              size="sm"
              variant="outline"
              className="h-8 text-xs bg-red-50 text-red-700 border-red-200 hover:bg-red-100"
              onClick={() => moveStageMutation.mutate("lost")}
              disabled={moveStageMutation.isPending}
            >
              Mark Lost
            </Button>
          )}
          {isConverted && (
            <Badge variant="outline" className="border-0 text-xs bg-emerald-50 text-emerald-700">
              Converted
            </Badge>
          )}
        </div>
      </div>

      {/* Mutation errors */}
      {moveStageMutation.isError && (
        <div className="rounded-md bg-red-50 p-3">
          <p className="text-sm text-red-700">
            {moveStageMutation.error instanceof Error ? moveStageMutation.error.message : "Failed to move stage"}
          </p>
        </div>
      )}

      {/* Win-Convert Dialog */}
      <Dialog
        open={showWinConvert}
        onOpenChange={(open) => {
          if (!open) {
            setShowWinConvert(false);
            setWinConvertForm({ creditDays: "30", creditLimit: "0", address: "", gstin: "" });
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Convert Lead to Customer</DialogTitle>
            <DialogDescription className="flex items-start gap-2 pt-2">
              <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
              <span>This will move the lead to Won and create a customer record. This action cannot be undone.</span>
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3 py-2">
            <div className="space-y-1">
              <Label className="text-xs">Credit Days</Label>
              <Input
                type="text"
                inputMode="numeric"
                value={winConvertForm.creditDays}
                onChange={(e) =>
                  setWinConvertForm((p) => ({
                    ...p,
                    creditDays: sanitizeIntegerInput(e.target.value, FIELD_LIMITS.creditDaysDigits),
                  }))
                }
                className="h-8 text-sm"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Credit Limit</Label>
              <Input
                type="text"
                inputMode="decimal"
                value={winConvertForm.creditLimit}
                onChange={(e) =>
                  setWinConvertForm((p) => ({
                    ...p,
                    creditLimit: sanitizeDecimalInput(e.target.value, {
                      maxIntegerDigits: FIELD_LIMITS.creditLimitDigits,
                      maxFractionDigits: 2,
                    }),
                  }))
                }
                className="h-8 text-sm"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Address</Label>
              <Input
                value={winConvertForm.address}
                onChange={(e) =>
                  setWinConvertForm((p) => ({
                    ...p,
                    address: sanitizeSingleLineInput(e.target.value, FIELD_LIMITS.address),
                  }))
                }
                className="h-8 text-sm"
                maxLength={FIELD_LIMITS.address}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">GSTIN</Label>
              <Input
                value={winConvertForm.gstin}
                onChange={(e) =>
                  setWinConvertForm((p) => ({
                    ...p,
                    gstin: sanitizeSingleLineInput(e.target.value.toUpperCase(), FIELD_LIMITS.gstin),
                  }))
                }
                className="h-8 text-sm"
                maxLength={FIELD_LIMITS.gstin}
              />
            </div>
          </div>
          {winConvertMutation.isError && (
            <p className="text-sm text-red-600">
              {winConvertMutation.error instanceof Error ? winConvertMutation.error.message : "Failed to convert"}
            </p>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setShowWinConvert(false);
                setWinConvertForm({ creditDays: "30", creditLimit: "0", address: "", gstin: "" });
              }}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={() => winConvertMutation.mutate()}
              disabled={winConvertMutation.isPending}
            >
              {winConvertMutation.isPending && <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />}
              Confirm & Convert
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Details card */}
        <Card className="lg:col-span-1">
          <CardContent className="p-4 space-y-3">
            <h2 className="text-sm font-semibold text-gray-900">Lead Details</h2>
            <div className="space-y-2.5 text-sm">
              <div className="flex items-center gap-2 text-gray-600">
                <Phone className="h-3.5 w-3.5 text-gray-400" />
                {lead.phone}
              </div>
              {lead.email && (
                <div className="flex items-center gap-2 text-gray-600">
                  <Mail className="h-3.5 w-3.5 text-gray-400" />
                  {lead.email}
                </div>
              )}
              {lead.route && (
                <div className="flex items-center gap-2 text-gray-600">
                  <MapPin className="h-3.5 w-3.5 text-gray-400" />
                  {lead.route}
                </div>
              )}
              <div className="flex items-center gap-2 text-gray-600">
                <IndianRupee className="h-3.5 w-3.5 text-gray-400" />
                {formatCurrency(lead.estimatedValue)}
              </div>
              {lead.vehicleType && (
                <div className="flex items-center gap-2 text-gray-600">
                  <Truck className="h-3.5 w-3.5 text-gray-400" />
                  {lead.vehicleType}
                </div>
              )}
              {lead.nextFollowUp && (
                <div className="flex items-center gap-2 text-gray-600">
                  <Calendar className="h-3.5 w-3.5 text-gray-400" />
                  Follow-up: {formatDate(lead.nextFollowUp)}
                </div>
              )}
            </div>
            {lead.notes && (
              <div className="pt-2 border-t border-gray-100">
                <p className="text-xs text-gray-500">{lead.notes}</p>
              </div>
            )}
            <div className="pt-2 border-t border-gray-100 text-[11px] text-gray-400">
              <p>Created: {formatDate(lead.createdAt)}</p>
              <p>Updated: {formatDate(lead.updatedAt)}</p>
              <p>Owner: {lead.salesOwnerName}</p>
            </div>
          </CardContent>
        </Card>

        {/* Activity timeline */}
        <Card className="lg:col-span-2">
          <CardContent className="p-4 space-y-4">
            <h2 className="text-sm font-semibold text-gray-900">Activity Timeline</h2>

            {/* Add activity form */}
            <div className="flex gap-2">
              <Select value={activityType} onValueChange={setActivityType}>
                <SelectTrigger className="w-[110px] h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="note">Note</SelectItem>
                  <SelectItem value="call">Call</SelectItem>
                  <SelectItem value="email">Email</SelectItem>
                  <SelectItem value="meeting">Meeting</SelectItem>
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
                onClick={() => addActivityMutation.mutate()}
                disabled={!newActivity.trim() || addActivityMutation.isPending}
              >
                {addActivityMutation.isPending ? (
                  <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                ) : (
                  <MessageSquare className="h-3.5 w-3.5 mr-1" />
                )}
                Add
              </Button>
            </div>

            {addActivityMutation.isError && (
              <p className="text-xs text-red-600">
                {addActivityMutation.error instanceof Error ? addActivityMutation.error.message : "Failed to add activity"}
              </p>
            )}

            {/* Timeline */}
            {activitiesQuery.isLoading && (
              <p className="text-sm text-gray-400 py-4 text-center">Loading activities...</p>
            )}
            <div className="space-y-3">
              {activities.map((activity) => (
                <ActivityItem key={activity.id} activity={activity} />
              ))}
              {!activitiesQuery.isLoading && activities.length === 0 && (
                <p className="text-sm text-gray-400 py-4 text-center">No activities recorded yet.</p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function ActivityItem({ activity }: { activity: LeadActivity }) {
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
