"use client";

/**
 * Confirm-and-delete dialog for app user accounts (consigner / driver /
 * transporter). Used from the fleet user detail page and the customers
 * app-consigners tab. The server refuses accounts with any activity, so
 * this is only for wrong-app signups / empty duplicates.
 */

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { AlertTriangle, Loader2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { deleteAppUser } from "@/lib/api/fleet-users";
import { formatPhone } from "@/lib/formatters";

interface DeleteAppUserDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId: string;
  userName: string;
  userPhone?: string | null;
  /** Called after a successful delete (close, invalidate, navigate). */
  onDeleted: () => void;
}

export function DeleteAppUserDialog({
  open,
  onOpenChange,
  userId,
  userName,
  userPhone,
  onDeleted,
}: DeleteAppUserDialogProps) {
  const [reason, setReason] = useState("");
  const [confirmText, setConfirmText] = useState("");

  const mutation = useMutation({
    mutationFn: () => deleteAppUser(userId, reason.trim() || undefined),
    onSuccess: () => {
      onOpenChange(false);
      onDeleted();
    },
  });

  const canDelete = confirmText.trim().toUpperCase() === "DELETE" && !mutation.isPending;

  const handleOpenChange = (next: boolean) => {
    if (mutation.isPending) return;
    if (!next) {
      setReason("");
      setConfirmText("");
      mutation.reset();
    }
    onOpenChange(next);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-red-700">
            <Trash2 className="h-4 w-4" />
            Delete account
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3 text-sm">
          <p className="text-gray-700">
            Permanently delete{" "}
            <span className="font-medium text-gray-900">{userName}</span>
            {userPhone ? <span className="text-gray-500"> ({formatPhone(userPhone)})</span> : null}? They will be
            signed out and can register again in the correct app with the same phone number.
          </p>

          <div className="flex items-start gap-2 rounded-md bg-amber-50 border border-amber-200 p-2.5 text-xs text-amber-800">
            <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
            <span>
              This cannot be undone. Accounts with any activity (trips, bids, requests, vehicles)
              are refused automatically — only empty accounts can be deleted.
            </span>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-medium text-gray-600">Reason (optional)</label>
            <Input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Signed up in the wrong app"
              maxLength={200}
              className="h-8 text-sm"
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-medium text-gray-600">
              Type <span className="font-mono font-semibold">DELETE</span> to confirm
            </label>
            <Input
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder="DELETE"
              maxLength={10}
              className="h-8 text-sm"
            />
          </div>

          {mutation.isError && (
            <p className="text-xs text-red-600">
              {mutation.error instanceof Error ? mutation.error.message : "Unable to delete user"}
            </p>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            size="sm"
            onClick={() => handleOpenChange(false)}
            disabled={mutation.isPending}
          >
            Cancel
          </Button>
          <Button
            variant="destructive"
            size="sm"
            onClick={() => mutation.mutate()}
            disabled={!canDelete}
          >
            {mutation.isPending ? (
              <>
                <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> Deleting…
              </>
            ) : (
              "Delete account"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
