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
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  createTripAdvanceRequest,
  prepareTripAdvanceUpiQrUpload,
  type TripPaymentMethod,
} from "@/lib/api/trips";
import { prepareAndUploadSingleFile } from "@/lib/uploads/workflow";
import { Loader2 } from "lucide-react";

interface Props {
  tripId: string;
  onClose: () => void;
  onSuccess: () => void;
}

const MAX_AMOUNT = 1_000_000_000_000;
const MAX_UPI_QR_SIZE = 10 * 1024 * 1024;
const ALLOWED_UPI_QR_MIME_TYPES = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
]);
const ALLOWED_UPI_QR_EXTENSIONS = new Set(["jpg", "jpeg", "png", "webp"]);

export function AdvanceRequestDialog({ tripId, onClose, onSuccess }: Props) {
  const [amount, setAmount] = useState("");
  const [beneficiary, setBeneficiary] = useState("");
  const [notes, setNotes] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<TripPaymentMethod>("bank");

  const [bankAccountHolder, setBankAccountHolder] = useState("");
  const [bankAccountNumber, setBankAccountNumber] = useState("");
  const [bankIfsc, setBankIfsc] = useState("");
  const [bankName, setBankName] = useState("");

  const [upiId, setUpiId] = useState("");
  const [upiQrFile, setUpiQrFile] = useState<File | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const [upiQrUploadProgress, setUpiQrUploadProgress] = useState<number>(0);

  const parsedAmount = useMemo(() => Number(amount), [amount]);
  const amountValid = Number.isFinite(parsedAmount) && parsedAmount > 0 && parsedAmount <= MAX_AMOUNT;

  const createMutation = useMutation({
    mutationFn: async () => {
      if (!amountValid) {
        throw new Error("Enter a valid amount");
      }

      let uploadedQr:
        | {
            objectKey: string;
            fileName: string;
            mimeType: string;
            sizeBytes: number;
          }
        | null = null;

      if (paymentMethod === "upi" && upiQrFile) {
        const uploaded = await prepareAndUploadSingleFile({
          file: upiQrFile,
          imagePreset: "qr_image",
          prepare: (payload) => prepareTripAdvanceUpiQrUpload(tripId, payload),
          onProgress: setUpiQrUploadProgress,
        });

        uploadedQr = {
          objectKey: uploaded.objectKey,
          fileName: uploaded.fileName,
          mimeType: uploaded.mimeType,
          sizeBytes: uploaded.fileSizeBytes,
        };
      }

      await createTripAdvanceRequest(tripId, {
        amount: parsedAmount,
        beneficiary: beneficiary.trim() || undefined,
        notes: notes.trim() || undefined,
        paymentMethod,
        bankAccountHolder: paymentMethod === "bank" ? bankAccountHolder.trim() || undefined : undefined,
        bankAccountNumber: paymentMethod === "bank" ? bankAccountNumber.trim() || undefined : undefined,
        bankIfsc: paymentMethod === "bank" ? bankIfsc.trim().toUpperCase() || undefined : undefined,
        bankName: paymentMethod === "bank" ? bankName.trim() || undefined : undefined,
        upiId: paymentMethod === "upi" ? upiId.trim() || undefined : undefined,
        upiQrObjectKey: paymentMethod === "upi" ? uploadedQr?.objectKey : undefined,
        upiQrFileName: paymentMethod === "upi" ? uploadedQr?.fileName : undefined,
        upiQrMimeType: paymentMethod === "upi" ? uploadedQr?.mimeType : undefined,
        upiQrSizeBytes: paymentMethod === "upi" ? uploadedQr?.sizeBytes : undefined,
      });
    },
    onSuccess: () => {
      setUpiQrUploadProgress(0);
      onSuccess();
    },
    onError: () => {
      setUpiQrUploadProgress(0);
    },
  });

function handleQrFileChange(nextFile: File | null) {
    setLocalError(null);

    if (!nextFile) {
      setUpiQrFile(null);
      return;
    }

    const mimeType = nextFile.type.toLowerCase();
    const fileExt = nextFile.name.split(".").pop()?.toLowerCase() ?? "";

    if (!ALLOWED_UPI_QR_MIME_TYPES.has(mimeType) || !ALLOWED_UPI_QR_EXTENSIONS.has(fileExt)) {
      setLocalError("UPI QR must be JPG, PNG, or WEBP image");
      setUpiQrFile(null);
      return;
    }

    if (nextFile.size <= 0 || nextFile.size > MAX_UPI_QR_SIZE) {
      setLocalError("UPI QR size must be between 1 byte and 10 MB");
      setUpiQrFile(null);
      return;
    }

    setUpiQrFile(nextFile);
  }

  const bankMethodValid =
    paymentMethod === "bank"
      ? Boolean(
          bankAccountHolder.trim() &&
            bankAccountNumber.trim() &&
            bankIfsc.trim() &&
            bankName.trim(),
        )
      : true;
  const upiMethodValid = paymentMethod === "upi" ? Boolean(upiId.trim() || upiQrFile) : true;
  const canSubmit = amountValid && bankMethodValid && upiMethodValid && !localError;

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-base">Get Advance</DialogTitle>
        </DialogHeader>

        <div className="space-y-3 py-2">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs text-gray-600">Amount *</Label>
              <Input
                type="number"
                inputMode="decimal"
                min={1}
                max={MAX_AMOUNT}
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
                className="h-8 text-sm"
                placeholder="0"
              />
            </div>

            <div className="space-y-1">
              <Label className="text-xs text-gray-600">Payment Method *</Label>
              <Select value={paymentMethod} onValueChange={(value) => setPaymentMethod(value as TripPaymentMethod)}>
                <SelectTrigger className="h-8 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="bank">Bank</SelectItem>
                  <SelectItem value="upi">UPI</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs text-gray-600">Beneficiary (optional)</Label>
              <Input
                value={beneficiary}
                onChange={(event) => setBeneficiary(event.target.value)}
                className="h-8 text-sm"
                maxLength={120}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-gray-600">Notes (optional)</Label>
              <Input
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                className="h-8 text-sm"
                maxLength={500}
              />
            </div>
          </div>

          {paymentMethod === "bank" && (
            <div className="space-y-3 rounded-md border border-blue-100 bg-blue-50/40 p-3">
              <p className="text-xs font-medium text-blue-800">Bank Details</p>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs text-gray-600">Account Holder *</Label>
                  <Input
                    value={bankAccountHolder}
                    onChange={(event) => setBankAccountHolder(event.target.value)}
                    className="h-8 text-sm"
                    maxLength={120}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-gray-600">Account Number *</Label>
                  <Input
                    value={bankAccountNumber}
                    onChange={(event) => setBankAccountNumber(event.target.value.replace(/[^\d]/g, ""))}
                    className="h-8 text-sm"
                    inputMode="numeric"
                    maxLength={34}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs text-gray-600">IFSC *</Label>
                  <Input
                    value={bankIfsc}
                    onChange={(event) => setBankIfsc(event.target.value.toUpperCase())}
                    className="h-8 text-sm"
                    maxLength={11}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-gray-600">Bank Name *</Label>
                  <Input
                    value={bankName}
                    onChange={(event) => setBankName(event.target.value)}
                    className="h-8 text-sm"
                    maxLength={120}
                  />
                </div>
              </div>
            </div>
          )}

          {paymentMethod === "upi" && (
            <div className="space-y-3 rounded-md border border-emerald-100 bg-emerald-50/40 p-3">
              <p className="text-xs font-medium text-emerald-800">UPI Details</p>
              <div className="space-y-1">
                <Label className="text-xs text-gray-600">UPI ID (optional if QR uploaded)</Label>
                <Input
                  value={upiId}
                  onChange={(event) => setUpiId(event.target.value)}
                  className="h-8 text-sm"
                  placeholder="example@upi"
                  maxLength={120}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-gray-600">UPI QR image (optional if UPI ID entered)</Label>
                <Input
                  type="file"
                  accept="image/*,.jpg,.jpeg,.png,.webp"
                  onChange={(event) => handleQrFileChange(event.target.files?.[0] ?? null)}
                  className="h-9 text-sm"
                />
                <p className="text-[11px] text-gray-500">Maximum file size: 10 MB</p>
              </div>
              {upiQrFile && (
                <div className="rounded-md border border-emerald-200 bg-white p-2">
                  <p className="text-xs text-gray-700 truncate">{upiQrFile.name}</p>
                  <p className="text-[11px] text-gray-500">{Math.ceil(upiQrFile.size / 1024)} KB</p>
                </div>
              )}
              {createMutation.isPending && upiQrFile && (
                <div className="space-y-1">
                  <Progress value={upiQrUploadProgress} />
                  <p className="text-[11px] text-emerald-700">Uploading QR {upiQrUploadProgress}%</p>
                </div>
              )}
            </div>
          )}

          {!canSubmit && !localError && (
            <p className="text-xs text-amber-600">
              {paymentMethod === "upi"
                ? "Provide a valid amount and either UPI ID or UPI QR."
                : "Provide a valid amount and all bank details."}
            </p>
          )}

          {localError && <p className="text-sm text-red-600">{localError}</p>}
          {createMutation.isError && (
            <p className="text-sm text-red-600">
              {createMutation.error instanceof Error
                ? createMutation.error.message
                : "Unable to create advance request"}
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
            onClick={() => createMutation.mutate()}
            disabled={!canSubmit || createMutation.isPending}
          >
            {createMutation.isPending && <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />}
            Create Advance Request
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
