"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { apiRequest } from "@/lib/api/http";
import { queryKeys } from "@/lib/query/keys";
import { formatCurrency, formatRelativeTime } from "@/lib/formatters";
import { Clock, Plus, Loader2, Trash2 } from "lucide-react";

interface HoldingChargeEntry {
  id: string;
  driver_amount: number | string;
  consigner_amount: number | string;
  note: string | null;
  added_by_admin_id: string;
  added_by_name: string | null;
  created_at: string;
}

interface HoldingChargesResponse {
  success: boolean;
  entries: HoldingChargeEntry[];
  driver_total: number | string;
  consigner_total: number | string;
}

interface Props {
  tripId: string;
  /**
   * When true we render the card in read-only mode — the Add and Delete
   * controls are hidden. Used once final has been paid or the trip is
   * terminal so the charges remain visible for audit without edits.
   */
  readOnly?: boolean;
  /**
   * When true the card renders the Add/Delete controls. Operations, admin,
   * and super_admin roles should see these.
   */
  canEdit: boolean;
}

export function HoldingChargesCard({ tripId, readOnly = false, canEdit }: Props) {
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);

  const chargesQuery = useQuery({
    queryKey: queryKeys.tripHoldingCharges(tripId),
    queryFn: () =>
      apiRequest<HoldingChargesResponse>(`/api/trips/${tripId}/holding-charges`),
    staleTime: 30_000,
  });

  const data = chargesQuery.data;
  const entries = data?.entries ?? [];
  const driverTotal = Number(data?.driver_total ?? 0);
  const consignerTotal = Number(data?.consigner_total ?? 0);
  const hasAny = entries.length > 0;

  const deleteMutation = useMutation({
    mutationFn: (chargeId: string) =>
      apiRequest(`/api/trips/${tripId}/holding-charges/${chargeId}`, {
        method: "DELETE",
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.tripHoldingCharges(tripId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.trip(tripId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.tripPaymentSummary(tripId) });
    },
  });

  const showEditControls = canEdit && !readOnly;

  if (!hasAny && !showEditControls) return null;

  return (
    <>
      <Card className="border-amber-200 bg-amber-50/50">
        <CardContent className="p-3 space-y-2.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <Clock className="h-4 w-4 text-amber-700" />
              <p className="text-xs font-semibold text-amber-900">Holding Charges</p>
            </div>
            {showEditControls && (
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-[11px] gap-1 border-amber-300 bg-white hover:bg-amber-50"
                onClick={() => setDialogOpen(true)}
              >
                <Plus className="h-3 w-3" />
                Add
              </Button>
            )}
          </div>

          {hasAny && (
            <div className="grid grid-cols-2 gap-2 rounded-md bg-white/70 border border-amber-200 p-2">
              <div>
                <p className="text-[10px] uppercase tracking-wide text-gray-500">Driver</p>
                <p className="text-sm font-semibold text-gray-900">
                  + {formatCurrency(driverTotal)}
                </p>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wide text-gray-500">Consigner</p>
                <p className="text-sm font-semibold text-gray-900">
                  + {formatCurrency(consignerTotal)}
                </p>
              </div>
            </div>
          )}

          {!hasAny && showEditControls && (
            <p className="text-[11px] text-gray-600">
              Record wait or holding charges during the trip. Driver-side is added
              to the final payout; consigner-side is added to their bill.
            </p>
          )}

          {hasAny && (
            <div className="space-y-1">
              {entries.map((entry) => (
                <div
                  key={entry.id}
                  className="flex items-start justify-between gap-2 rounded border border-amber-100 bg-white/70 px-2 py-1.5"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-[11px] text-gray-800">
                      Driver {formatCurrency(Number(entry.driver_amount))} · Consigner{" "}
                      {formatCurrency(Number(entry.consigner_amount))}
                    </p>
                    {entry.note && (
                      <p className="text-[11px] text-gray-600 mt-0.5 truncate">
                        {entry.note}
                      </p>
                    )}
                    <p className="text-[10px] text-gray-500 mt-0.5">
                      {formatRelativeTime(entry.created_at)}
                      {entry.added_by_name ? ` · ${entry.added_by_name}` : ""}
                    </p>
                  </div>
                  {showEditControls && (
                    <button
                      className="text-red-500 hover:text-red-700 p-1"
                      title="Delete charge"
                      disabled={
                        deleteMutation.isPending && deleteMutation.variables === entry.id
                      }
                      onClick={() => {
                        if (confirm("Delete this holding charge?")) {
                          deleteMutation.mutate(entry.id);
                        }
                      }}
                    >
                      {deleteMutation.isPending && deleteMutation.variables === entry.id ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <Trash2 className="h-3 w-3" />
                      )}
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}

          {deleteMutation.isError && (
            <p className="text-[11px] text-red-600">
              {deleteMutation.error instanceof Error
                ? deleteMutation.error.message
                : "Failed to delete"}
            </p>
          )}
        </CardContent>
      </Card>

      <AddHoldingChargeDialog
        open={dialogOpen}
        tripId={tripId}
        onClose={() => setDialogOpen(false)}
      />
    </>
  );
}

function AddHoldingChargeDialog({
  open,
  tripId,
  onClose,
}: {
  open: boolean;
  tripId: string;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [driverAmount, setDriverAmount] = useState("");
  const [consignerAmount, setConsignerAmount] = useState("");
  const [note, setNote] = useState("");

  const driverNum = Number(driverAmount || 0);
  const consignerNum = Number(consignerAmount || 0);
  const valid =
    Number.isFinite(driverNum) &&
    Number.isFinite(consignerNum) &&
    driverNum >= 0 &&
    consignerNum >= 0 &&
    driverNum + consignerNum > 0;

  const addMutation = useMutation({
    mutationFn: () =>
      apiRequest(`/api/trips/${tripId}/holding-charges`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          driver_amount: driverNum,
          consigner_amount: consignerNum,
          note: note.trim() || null,
        }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.tripHoldingCharges(tripId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.trip(tripId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.tripPaymentSummary(tripId) });
      setDriverAmount("");
      setConsignerAmount("");
      setNote("");
      onClose();
    },
  });

  const handleClose = () => {
    if (addMutation.isPending) return;
    setDriverAmount("");
    setConsignerAmount("");
    setNote("");
    addMutation.reset();
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && handleClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-base">Add Holding Charges</DialogTitle>
        </DialogHeader>

        <div className="space-y-3 py-2">
          <p className="text-xs text-gray-600">
            Driver charge is added to the driver&apos;s final payout. Consigner charge is
            added to what the consigner pays.
          </p>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs text-gray-600">Driver Charge (₹)</Label>
              <Input
                type="number"
                inputMode="decimal"
                min={0}
                step="0.01"
                value={driverAmount}
                onChange={(event) => setDriverAmount(event.target.value)}
                className="h-9 text-sm"
                placeholder="0"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-gray-600">Consigner Charge (₹)</Label>
              <Input
                type="number"
                inputMode="decimal"
                min={0}
                step="0.01"
                value={consignerAmount}
                onChange={(event) => setConsignerAmount(event.target.value)}
                className="h-9 text-sm"
                placeholder="0"
              />
            </div>
          </div>

          <div className="space-y-1">
            <Label className="text-xs text-gray-600">Note (optional)</Label>
            <Textarea
              value={note}
              onChange={(event) => setNote(event.target.value)}
              className="text-sm"
              rows={2}
              maxLength={250}
              placeholder="e.g. Held 1 day at pickup"
            />
          </div>

          {!valid && (driverAmount || consignerAmount) && (
            <p className="text-xs text-amber-600">
              Enter at least one non-zero, non-negative amount.
            </p>
          )}

          {addMutation.isError && (
            <p className="text-xs text-red-600">
              {addMutation.error instanceof Error
                ? addMutation.error.message
                : "Failed to add charge"}
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" size="sm" className="h-8 text-xs" onClick={handleClose} disabled={addMutation.isPending}>
            Cancel
          </Button>
          <Button
            size="sm"
            className="h-8 text-xs"
            disabled={!valid || addMutation.isPending}
            onClick={() => addMutation.mutate()}
          >
            {addMutation.isPending && <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
