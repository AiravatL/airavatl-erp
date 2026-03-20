"use client";

import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
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
import {
  confirmPaymentProofUpload,
  getPaymentProofUpload,
  markPaymentRequestPaid,
  preparePaymentProofUpload,
} from "@/lib/api/payments";
import { queryKeys } from "@/lib/query/keys";
import { prepareAndUploadSingleFile } from "@/lib/uploads/workflow";
import { CheckCircle, Loader2, RefreshCw, Upload } from "lucide-react";

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
  const queryClient = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [paymentReference, setPaymentReference] = useState("");
  const [notes, setNotes] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState<number>(0);

  const proofQuery = useQuery({
    queryKey: queryKeys.paymentProofUpload(payment.id),
    queryFn: () => getPaymentProofUpload(payment.id),
  });

  const uploadMutation = useMutation({
    mutationFn: async (nextFile: File) => {
      const uploaded = await prepareAndUploadSingleFile({
        file: nextFile,
        imagePreset: "payment_image",
        prepare: (payload) => preparePaymentProofUpload(payment.id, payload),
        confirm: (payload) =>
          confirmPaymentProofUpload(payment.id, {
            objectKey: payload.objectKey,
            fileName: payload.fileName,
            mimeType: payload.mimeType,
            fileSizeBytes: payload.fileSizeBytes,
          }),
        onProgress: setUploadProgress,
      });
      return uploaded;
    },
    onSuccess: (result) => {
      setUploadProgress(0);
      setLocalError(null);
      queryClient.setQueryData(queryKeys.paymentProofUpload(payment.id), {
        status: "uploaded",
        objectKey: result.objectKey,
        fileName: result.fileName,
        mimeType: result.mimeType,
        fileSizeBytes: result.fileSizeBytes,
        uploadedAt: new Date().toISOString(),
        attachedAt: null,
        source: "draft",
      });
    },
    onError: () => {
      setUploadProgress(0);
    },
  });

  const markPaidMutation = useMutation({
    mutationFn: async () => {
      const currentProof = proofQuery.data;
      if (!currentProof?.objectKey || !["uploaded", "attached"].includes(currentProof.status)) {
        throw new Error("Upload payment proof first");
      }

      await markPaymentRequestPaid(payment.id, {
        objectKey: currentProof.objectKey,
        paymentReference: paymentReference.trim() || undefined,
        paidAmount: payment.amount,
        notes: notes.trim() || undefined,
      });
    },
    onSuccess: () => {
      onSuccess();
    },
  });

  const isUploading = uploadMutation.isPending;
  const uploadSummary = proofQuery.data;
  const hasUploadedProof =
    !!uploadSummary?.objectKey &&
    (uploadSummary.status === "uploaded" || uploadSummary.status === "attached");

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
    uploadMutation.mutate(nextFile);
  }

  function handleReplace() {
    if (isUploading || markPaidMutation.isPending) return;
    setLocalError(null);
    setUploadProgress(0);
    setFile(null);
    inputRef.current?.click();
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
              ref={inputRef}
              type="file"
              accept=".jpg,.jpeg,.png,.webp,.pdf,image/*,application/pdf"
              onChange={(event) => handleFileChange(event.target.files?.[0] ?? null)}
              className="h-9 text-sm"
              disabled={isUploading || markPaidMutation.isPending}
            />
            <p className="text-[11px] text-gray-500">Maximum file size: 15 MB</p>
          </div>

          {hasUploadedProof && !isUploading && (
            <div className="flex items-center gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2">
              <CheckCircle className="h-4 w-4 shrink-0 text-emerald-600" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-medium text-emerald-800">
                  {file?.name ?? uploadSummary?.fileName ?? "Payment proof uploaded"}
                </p>
                <p className="text-[11px] text-emerald-700">
                  {uploadSummary?.fileSizeBytes
                    ? `${Math.ceil(uploadSummary.fileSizeBytes / 1024)} KB`
                    : file
                      ? `${Math.ceil(file.size / 1024)} KB`
                      : "Ready to mark paid"}
                </p>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-xs text-emerald-700 hover:text-emerald-800"
                onClick={handleReplace}
              >
                <RefreshCw className="mr-1 h-3 w-3" />
                Replace
              </Button>
            </div>
          )}

          {file && !hasUploadedProof && !isUploading && (
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
          {proofQuery.isError && (
            <p className="text-sm text-red-600">
              {proofQuery.error instanceof Error ? proofQuery.error.message : "Unable to load payment proof state"}
            </p>
          )}
          {isUploading && (
            <div className="space-y-1">
              <Progress value={uploadProgress} />
              <p className="text-[11px] text-gray-500">Uploading {uploadProgress}%</p>
            </div>
          )}
          {uploadMutation.isError && (
            <p className="text-sm text-red-600">
              {uploadMutation.error instanceof Error ? uploadMutation.error.message : "Unable to upload payment proof"}
            </p>
          )}
          {markPaidMutation.isError && (
            <p className="text-sm text-red-600">
              {markPaidMutation.error instanceof Error ? markPaidMutation.error.message : "Unable to mark payment as paid"}
            </p>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            size="sm"
            className="h-8 text-xs"
            onClick={onClose}
            disabled={isUploading || markPaidMutation.isPending}
          >
            Cancel
          </Button>
          <Button
            size="sm"
            className="h-8 text-xs"
            disabled={!hasUploadedProof || isUploading || markPaidMutation.isPending || proofQuery.isLoading}
            onClick={() => markPaidMutation.mutate()}
          >
            {markPaidMutation.isPending ? (
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
