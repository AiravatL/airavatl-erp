"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiRequest } from "@/lib/api/http";
import { AlertTriangle, Loader2, Trash2 } from "lucide-react";

interface AdminDeleteDialogProps {
  open: boolean;
  onClose: () => void;
  onDeleted: () => void;
  type: "auction" | "trip";
  id: string;
  /** Display label like "DR-2026-000038" or "TR-2026-000016" */
  label: string;
  /** Extra info shown in the dialog */
  description?: string;
}

export function AdminDeleteDialog({
  open,
  onClose,
  onDeleted,
  type,
  id,
  label,
  description,
}: AdminDeleteDialogProps) {
  const [confirmText, setConfirmText] = useState("");

  const typeLabel = type === "auction" ? "Auction" : "Trip";
  const confirmRequired = label.toUpperCase();
  const isConfirmed = confirmText.toUpperCase() === confirmRequired;

  const deleteMutation = useMutation({
    mutationFn: () =>
      apiRequest<{ deleted: boolean }>("/api/admin/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, id }),
      }),
    onSuccess: () => {
      setConfirmText("");
      onDeleted();
    },
  });

  const handleClose = () => {
    if (deleteMutation.isPending) return;
    setConfirmText("");
    deleteMutation.reset();
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) handleClose(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-3 mb-1">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-red-100">
              <Trash2 className="h-5 w-5 text-red-600" />
            </div>
            <DialogTitle className="text-base">Delete {typeLabel}</DialogTitle>
          </div>
          <DialogDescription className="text-sm text-gray-600">
            This will <span className="font-semibold text-red-600">permanently delete</span>{" "}
            <span className="font-mono font-semibold text-gray-900">{label}</span>
            {type === "auction" && " and all associated bids, trips, payments, proofs, and metadata"}
            {type === "trip" && " and all associated payments, proofs, ratings, and metadata"}.
          </DialogDescription>
        </DialogHeader>

        <div className="rounded-lg border border-red-200 bg-red-50 p-3 my-2">
          <div className="flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 text-red-600 mt-0.5 shrink-0" />
            <div>
              <p className="text-sm font-medium text-red-800">This action cannot be undone</p>
              {description && <p className="text-xs text-red-600 mt-0.5">{description}</p>}
            </div>
          </div>
        </div>

        <div className="space-y-2">
          <Label className="text-sm">
            Type <span className="font-mono font-semibold text-gray-900">{label}</span> to confirm
          </Label>
          <Input
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            placeholder={label}
            className="h-9 text-sm font-mono"
            autoComplete="off"
            spellCheck={false}
          />
        </div>

        {deleteMutation.isError && (
          <p className="text-sm text-red-600">
            {deleteMutation.error instanceof Error ? deleteMutation.error.message : "Delete failed"}
          </p>
        )}

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" size="sm" onClick={handleClose} disabled={deleteMutation.isPending} className="h-9 text-sm">
            Cancel
          </Button>
          <Button
            variant="destructive"
            size="sm"
            disabled={!isConfirmed || deleteMutation.isPending}
            onClick={() => deleteMutation.mutate()}
            className="h-9 text-sm"
          >
            {deleteMutation.isPending ? (
              <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
            ) : (
              <Trash2 className="h-4 w-4 mr-1.5" />
            )}
            Delete {typeLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
