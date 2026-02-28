"use client";

import { useState } from "react";
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
import { Progress } from "@/components/ui/progress";
import { formatCurrency } from "@/lib/formatters";
import type { PaymentQueueItem } from "@/lib/api/payments";
import { markPaymentRequestPaid, preparePaymentProofUpload } from "@/lib/api/payments";
import { prepareAndUploadSingleFile } from "@/lib/uploads/workflow";
import { Loader2, Upload } from "lucide-react";

interface Props {
  payment: PaymentQueueItem;
  onClose: () => void;
  onSuccess: () => void;
}

const MAX_FILE_SIZE = 15 * 1024 * 1024;
const ALLOWED_PAYMENT_PROOF_MIME_TYPES = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "application/pdf",
]);
const ALLOWED_PAYMENT_PROOF_EXTENSIONS = new Set(["jpg", "jpeg", "png", "webp", "pdf"]);

export function MarkPaymentPaidDialog({ payment, onClose, onSuccess }: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [paymentReference, setPaymentReference] = useState("");
  const [notes, setNotes] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState<number>(0);

  const mutation = useMutation({
    mutationFn: async () => {
      if (!file) {
        throw new Error("Select payment proof file");
      }

      const uploaded = await prepareAndUploadSingleFile({
        file,
        imagePreset: "payment_image",
        prepare: (payload) => preparePaymentProofUpload(payment.id, payload),
        onProgress: setUploadProgress,
      });

      await markPaymentRequestPaid(payment.id, {
        objectKey: uploaded.objectKey,
        fileName: uploaded.fileName,
        mimeType: uploaded.mimeType,
        fileSizeBytes: uploaded.fileSizeBytes,
        paymentReference: paymentReference.trim() || undefined,
        paidAmount: payment.amount,
        notes: notes.trim() || undefined,
      });
    },
    onSuccess: () => {
      setUploadProgress(0);
      onSuccess();
    },
    onError: () => {
      setUploadProgress(0);
    },
  });

  function handleFileChange(nextFile: File | null) {
    setLocalError(null);

    if (!nextFile) {
      setFile(null);
      return;
    }

    if (nextFile.size <= 0 || nextFile.size > MAX_FILE_SIZE) {
      setLocalError("File size must be between 1 byte and 15 MB");
      setFile(null);
      return;
    }

    const mimeType = nextFile.type.toLowerCase();
    const fileExt = nextFile.name.split(".").pop()?.toLowerCase() ?? "";
    if (!ALLOWED_PAYMENT_PROOF_MIME_TYPES.has(mimeType) || !ALLOWED_PAYMENT_PROOF_EXTENSIONS.has(fileExt)) {
      setLocalError("Payment proof must be JPG, PNG, WEBP, or PDF");
      setFile(null);
      return;
    }

    setFile(nextFile);
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-base">Upload Proof + Mark Paid</DialogTitle>
        </DialogHeader>

        <div className="space-y-3 py-2">
          <div className="rounded-md border border-gray-200 bg-gray-50 p-3 text-xs text-gray-600">
            <p>Trip: <span className="font-medium text-gray-900">{payment.tripCode}</span></p>
            <p>Type: <span className="font-medium text-gray-900 capitalize">{payment.type}</span></p>
            <p>Amount: <span className="font-medium text-gray-900">{formatCurrency(payment.amount)}</span></p>
            <p>Beneficiary: <span className="font-medium text-gray-900">{payment.beneficiary || "-"}</span></p>
          </div>

          <div className="space-y-1">
            <Label className="text-xs text-gray-600">Payment Proof File *</Label>
            <Input
              type="file"
              accept=".jpg,.jpeg,.png,.webp,.pdf,image/*,application/pdf"
              onChange={(event) => handleFileChange(event.target.files?.[0] ?? null)}
              className="h-9 text-sm"
            />
            <p className="text-[11px] text-gray-500">Maximum file size: 15 MB</p>
          </div>

          {file && (
            <div className="rounded-md border border-gray-200 p-2">
              <p className="text-xs text-gray-700 truncate">{file.name}</p>
              <p className="text-[11px] text-gray-500">{Math.ceil(file.size / 1024)} KB</p>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs text-gray-600">Payment Reference (optional)</Label>
              <Input
                className="h-8 text-sm"
                value={paymentReference}
                onChange={(event) => setPaymentReference(event.target.value)}
                maxLength={120}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-gray-600">Notes (optional)</Label>
              <Input
                className="h-8 text-sm"
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                maxLength={500}
              />
            </div>
          </div>

          {localError && <p className="text-sm text-red-600">{localError}</p>}
          {mutation.isPending && (
            <div className="space-y-1">
              <Progress value={uploadProgress} />
              <p className="text-[11px] text-gray-500">Uploading {uploadProgress}%</p>
            </div>
          )}
          {mutation.isError && (
            <p className="text-sm text-red-600">
              {mutation.error instanceof Error ? mutation.error.message : "Unable to mark payment as paid"}
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" size="sm" className="h-8 text-xs" onClick={onClose}>
            Cancel
          </Button>
          <Button
            size="sm"
            className="h-8 text-xs"
            disabled={!file || mutation.isPending || Boolean(localError)}
            onClick={() => mutation.mutate()}
          >
            {mutation.isPending ? (
              <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
            ) : (
              <Upload className="mr-1 h-3.5 w-3.5" />
            )}
            Mark Paid
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
