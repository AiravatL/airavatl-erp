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
import { listConsignerLeads, moveConsignerLeadStage, winAndConvertConsignerLead } from "@/lib/api/consigner-crm";
import { queryKeys } from "@/lib/query/keys";
import { formatCurrency, formatDate } from "@/lib/formatters";
import { LEAD_STAGE_LABELS } from "@/lib/types";
import type { LeadStage, Lead } from "@/lib/types";
import { FIELD_LIMITS } from "@/lib/validation/client/field-limits";
import { sanitizeSingleLineInput } from "@/lib/validation/client/sanitizers";
import { sanitizeDecimalInput, sanitizeIntegerInput } from "@/lib/validation/client/validators";
import { TrendingUp, IndianRupee, Trophy, LayoutGrid, List, Plus, Loader2, AlertTriangle } from "lucide-react";

const COLUMNS: LeadStage[] = ["new_enquiry", "contacted", "quote_sent", "negotiation", "won", "lost"];

const PRIORITY_COLORS: Record<string, string> = {
  high: "bg-red-50 text-red-700",
  medium: "bg-amber-50 text-amber-700",
  low: "bg-gray-100 text-gray-600",
};

export default function ConsignerPipelinePage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [draggedLead, setDraggedLead] = useState<{ leadId: string; fromStage: LeadStage } | null>(null);
  const [dropStage, setDropStage] = useState<LeadStage | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  // Win-convert dialog state
  const [winConvertLeadId, setWinConvertLeadId] = useState<string | null>(null);
  const [winConvertForm, setWinConvertForm] = useState({
    creditDays: "30",
    creditLimit: "0",
    address: "",
    gstin: "",
  });

  const boardQueryKey = queryKeys.consignerCrmLeads({ view: "board" });
  const leadsQuery = useQuery({
    queryKey: boardQueryKey,
    queryFn: () => listConsignerLeads({ limit: 500, offset: 0 }),
    enabled: !!user,
  });
  const leads = leadsQuery.data ?? [];

  const moveStageMutation = useMutation({
    mutationFn: async ({ leadId, toStage }: { leadId: string; toStage: LeadStage }) =>
      moveConsignerLeadStage(leadId, { toStage }),
    onMutate: async ({ leadId, toStage }) => {
      setActionError(null);
      await queryClient.cancelQueries({ queryKey: boardQueryKey });
      const previous = queryClient.getQueryData<Lead[]>(boardQueryKey) ?? [];
      queryClient.setQueryData<Lead[]>(boardQueryKey, (current = []) =>
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
      await queryClient.invalidateQueries({ queryKey: ["consigner-crm", "leads"] });
      setDraggedLead(null);
      setDropStage(null);
    },
  });

  const winConvertMutation = useMutation({
    mutationFn: async ({ leadId }: { leadId: string }) =>
      winAndConvertConsignerLead(leadId, {
        creditDays: Number(winConvertForm.creditDays) || 30,
        creditLimit: Number(winConvertForm.creditLimit) || 0,
        address: sanitizeSingleLineInput(winConvertForm.address, FIELD_LIMITS.address).trim() || undefined,
        gstin: sanitizeSingleLineInput(winConvertForm.gstin.toUpperCase(), FIELD_LIMITS.gstin).trim() || undefined,
      }),
    onSuccess: async () => {
      setWinConvertLeadId(null);
      setWinConvertForm({ creditDays: "30", creditLimit: "0", address: "", gstin: "" });
      await queryClient.invalidateQueries({ queryKey: ["consigner-crm", "leads"] });
    },
    onError: (error) => {
      setActionError(error instanceof Error ? error.message : "Unable to convert lead");
    },
  });

  async function handleDrop(toStage: LeadStage) {
    if (!draggedLead || moveStageMutation.isPending) return;
    const { leadId, fromStage } = draggedLead;
    if (fromStage === toStage) {
      setDraggedLead(null);
      setDropStage(null);
      return;
    }

    // Intercept drag-to-Won: open dialog instead of direct move
    if (toStage === "won") {
      setWinConvertLeadId(leadId);
      setDraggedLead(null);
      setDropStage(null);
      return;
    }

    await moveStageMutation.mutateAsync({ leadId, toStage });
  }

  const totalLeads = leads.length;
  const pipelineValue = leads
    .filter((l) => !["won", "lost"].includes(l.stage))
    .reduce((sum, l) => sum + l.estimatedValue, 0);
  const wonValue = leads
    .filter((l) => l.stage === "won")
    .reduce((sum, l) => sum + l.estimatedValue, 0);
  const queryError =
    leadsQuery.error instanceof Error ? leadsQuery.error.message : "Unable to fetch leads";

  return (
    <div className="space-y-4">
      <PageHeader title="Consigner Pipeline" description="Track and manage your consigner leads">
        <div className="flex items-center gap-2">
          <div className="flex items-center rounded-md border border-gray-200 p-0.5">
            <Button size="sm" className="h-7 px-2 text-xs" asChild>
              <Link href="/consigner-crm">
                <LayoutGrid className="h-3.5 w-3.5" />
                Board
              </Link>
            </Button>
            <Button size="sm" variant="ghost" className="h-7 px-2 text-xs text-gray-600" asChild>
              <Link href="/consigner-crm/leads">
                <List className="h-3.5 w-3.5" />
                List
              </Link>
            </Button>
          </div>
          <Button size="sm" className="h-8 text-xs" asChild>
            <Link href="/consigner-crm/new">
              <Plus className="h-3.5 w-3.5" />
              Add Lead
            </Link>
          </Button>
        </div>
      </PageHeader>

      {/* Stats bar */}
      <div className="grid grid-cols-3 gap-3">
        <Card>
          <CardContent className="p-3 flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-50">
              <TrendingUp className="h-4 w-4 text-blue-600" />
            </div>
            <div>
              <p className="text-xs text-gray-500">Total Leads</p>
              <p className="text-lg font-semibold text-gray-900">{totalLeads}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-purple-50">
              <IndianRupee className="h-4 w-4 text-purple-600" />
            </div>
            <div>
              <p className="text-xs text-gray-500">Pipeline Value</p>
              <p className="text-lg font-semibold text-gray-900">{formatCurrency(pipelineValue)}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-50">
              <Trophy className="h-4 w-4 text-emerald-600" />
            </div>
            <div>
              <p className="text-xs text-gray-500">Won Value</p>
              <p className="text-lg font-semibold text-gray-900">{formatCurrency(wonValue)}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {leadsQuery.isLoading && (
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-gray-500">Loading consigner leads...</p>
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
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          {COLUMNS.map((col) => {
            const colLeads = leads.filter((l) => l.stage === col);
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
                    {LEAD_STAGE_LABELS[col]}
                  </h3>
                  <span className="text-[11px] text-gray-400">{colLeads.length}</span>
                </div>
                <div className="space-y-2">
                  {colLeads.map((lead) => {
                    const isConverted = !!lead.convertedCustomerId;
                    return (
                      <LeadCard
                        key={lead.id}
                        lead={lead}
                        isConverted={isConverted}
                        onDragStart={() => {
                          if (isConverted) return;
                          setActionError(null);
                          setDraggedLead({ leadId: lead.id, fromStage: lead.stage });
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
                      <p className="text-xs text-gray-400">No leads</p>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Win-Convert Dialog */}
      <Dialog
        open={winConvertLeadId !== null}
        onOpenChange={(open) => {
          if (!open) {
            setWinConvertLeadId(null);
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
                setWinConvertLeadId(null);
                setWinConvertForm({ creditDays: "30", creditLimit: "0", address: "", gstin: "" });
              }}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={() => {
                if (winConvertLeadId) {
                  winConvertMutation.mutate({ leadId: winConvertLeadId });
                }
              }}
              disabled={winConvertMutation.isPending}
            >
              {winConvertMutation.isPending && <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />}
              Confirm & Convert
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function LeadCard({
  lead,
  isConverted,
  onDragStart,
  onDragEnd,
}: {
  lead: Lead;
  isConverted: boolean;
  onDragStart: () => void;
  onDragEnd: () => void;
}) {
  return (
    <div
      draggable={!isConverted}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      className={isConverted ? "cursor-default" : "cursor-grab active:cursor-grabbing"}
    >
      <Link href={`/consigner-crm/${lead.id}`}>
        <Card className="hover:bg-gray-50/50 transition-colors cursor-pointer">
          <CardContent className="p-3">
            <div className="flex items-start justify-between mb-1">
              <p className="text-sm font-medium text-gray-900 line-clamp-1">{lead.companyName}</p>
              {isConverted ? (
                <Badge variant="outline" className="border-0 text-[10px] shrink-0 ml-1 bg-emerald-50 text-emerald-700">
                  Converted
                </Badge>
              ) : (
                <Badge variant="outline" className={`border-0 text-[10px] shrink-0 ml-1 ${PRIORITY_COLORS[lead.priority]}`}>
                  {lead.priority}
                </Badge>
              )}
            </div>
            <p className="text-xs text-gray-500 mb-1">{lead.contactPerson}</p>
            <p className="text-xs font-medium text-gray-700 mb-1">{formatCurrency(lead.estimatedValue)}</p>
            <p className="text-[11px] text-gray-400 mb-1">{lead.route}</p>
            {lead.nextFollowUp && (
              <p className="text-[11px] text-blue-600">Follow-up: {formatDate(lead.nextFollowUp)}</p>
            )}
          </CardContent>
        </Card>
      </Link>
    </div>
  );
}
