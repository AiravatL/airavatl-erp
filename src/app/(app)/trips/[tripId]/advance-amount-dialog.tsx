"use client";

import { useMemo, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiRequest } from "@/lib/api/http";
import { formatCurrency } from "@/lib/formatters";
import { Loader2, Banknote } from "lucide-react";

interface Props {
  tripId: string;
  driverBidAmount: number;
  onClose: () => void;
  onSuccess: () => void;
}

const MAX_AMOUNT = 1_000_000_000_000;

export function AdvanceAmountDialog({ tripId, driverBidAmount, onClose, onSuccess }: Props) {
  const [amount, setAmount] = useState("");

  const parsed = useMemo(() => Number(amount), [amount]);
  const amountValid =
    Number.isFinite(parsed) && parsed > 0 && parsed <= MAX_AMOUNT &&
    (driverBidAmount <= 0 || parsed <= driverBidAmount);

  const mutation = useMutation({
    mutationFn: async () =>
      apiRequest(`/api/trips/${tripId}/request-payment`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ payment_type: "advance", amount: parsed }),
      }),
    onSuccess: () => onSuccess(),
  });

  const overBid = driverBidAmount > 0 && parsed > driverBidAmount;

  return (
    <Dialog open onOpenChange={(open) => !open && !mutation.isPending && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-base">Request Advance</DialogTitle>
        </DialogHeader>

        <div className="space-y-3 py-2">
          {driverBidAmount > 0 && (
            <div className="rounded-md bg-gray-50 px-3 py-2 text-xs text-gray-600">
              Driver bid: <span className="font-medium text-gray-900">{formatCurrency(driverBidAmount)}</span>
            </div>
          )}

          <div className="space-y-1">
            <Label className="text-xs text-gray-600">Advance amount *</Label>
            <Input
              type="number"
              inputMode="decimal"
              min={1}
              max={driverBidAmount > 0 ? driverBidAmount : MAX_AMOUNT}
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              className="h-9 text-sm"
              placeholder="0"
              autoFocus
            />
            {overBid && (
              <p className="text-[11px] text-red-600">
                Cannot exceed the driver&apos;s bid ({formatCurrency(driverBidAmount)}).
              </p>
            )}
          </div>

          {mutation.isError && (
            <p className="text-xs text-red-600">
              {mutation.error instanceof Error ? mutation.error.message : "Unable to request advance"}
            </p>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            size="sm"
            className="h-8 text-xs"
            onClick={onClose}
            disabled={mutation.isPending}
          >
            Cancel
          </Button>
          <Button
            size="sm"
            className="h-8 text-xs gap-1"
            onClick={() => mutation.mutate()}
            disabled={!amountValid || mutation.isPending}
          >
            {mutation.isPending ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <Banknote className="h-3 w-3" />
            )}
            Request Advance
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
