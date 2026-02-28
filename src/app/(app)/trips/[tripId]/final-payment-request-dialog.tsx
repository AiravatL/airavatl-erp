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
  createTripFinalPaymentRequest,
  prepareTripAdvanceUpiQrUpload,
  type TripPaymentMethod,
} from "@/lib/api/trips";
import { prepareAndUploadSingleFile } from "@/lib/uploads/workflow";
import { formatCurrency } from "@/lib/formatters";
import { Loader2 } from "lucide-react";

interface Props {
  tripId: string;
  suggestedAmount: number;
  tripAmount: number;
  paidAdvanceTotal: number;
  initialPaymentMethod?: TripPaymentMethod;
  initialUpiId?: string;
  initialUpiQrObjectKey?: string;
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

export function FinalPaymentRequestDialog({
  tripId,
  suggestedAmount,
  tripAmount,
  paidAdvanceTotal,
  initialPaymentMethod,
  initialUpiId,
  initialUpiQrObjectKey,
  onClose,
  onSuccess,
}: Props) {
  const defaultPaymentMethod = initialPaymentMethod ?? "bank";
  const [amount, setAmount] = useState(String(Math.max(0, suggestedAmount)));
  const [beneficiary, setBeneficiary] = useState("");
  const [notes, setNotes] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<TripPaymentMethod>(defaultPaymentMethod);
  const [showMethodSelector, setShowMethodSelector] = useState(false);

  const [bankAccountHolder, setBankAccountHolder] = useState("");
  const [bankAccountNumber, setBankAccountNumber] = useState("");
  const [bankIfsc, setBankIfsc] = useState("");
  const [bankName, setBankName] = useState("");

  const [upiId, setUpiId] = useState(initialUpiId ?? "");
  const [upiQrFile, setUpiQrFile] = useState<File | null>(null);
  const [showUpiQrPicker, setShowUpiQrPicker] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [upiQrUploadProgress, setUpiQrUploadProgress] = useState<number>(0);

  const parsedAmount = useMemo(() => Number(amount), [amount]);
  const amountValid = Number.isFinite(parsedAmount) && parsedAmount > 0 && parsedAmount <= MAX_AMOUNT;

  const createMutation = useMutation({
    mutationFn: async () => {
      if (!amountValid) {
        throw new Error("Enter a valid final amount");
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

      const includeMethodDetails = showMethodSelector || Boolean(upiQrFile);

      await createTripFinalPaymentRequest(tripId, {
        amount: parsedAmount,
        beneficiary: beneficiary.trim() || undefined,
        notes: notes.trim() || undefined,
        paymentMethod,
        bankAccountHolder:
          paymentMethod === "bank" && includeMethodDetails ? bankAccountHolder.trim() || undefined : undefined,
        bankAccountNumber:
          paymentMethod === "bank" && includeMethodDetails ? bankAccountNumber.trim() || undefined : undefined,
        bankIfsc:
          paymentMethod === "bank" && includeMethodDetails ? bankIfsc.trim().toUpperCase() || undefined : undefined,
        bankName: paymentMethod === "bank" && includeMethodDetails ? bankName.trim() || undefined : undefined,
        upiId: paymentMethod === "upi" && includeMethodDetails ? upiId.trim() || undefined : undefined,
        upiQrObjectKey:
          paymentMethod === "upi" && includeMethodDetails
            ? ((uploadedQr?.objectKey ?? initialUpiQrObjectKey) || undefined)
            : undefined,
        upiQrFileName: paymentMethod === "upi" && includeMethodDetails ? uploadedQr?.fileName : undefined,
        upiQrMimeType: paymentMethod === "upi" && includeMethodDetails ? uploadedQr?.mimeType : undefined,
        upiQrSizeBytes: paymentMethod === "upi" && includeMethodDetails ? uploadedQr?.sizeBytes : undefined,
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
      ? (!showMethodSelector || Boolean(
          bankAccountHolder.trim() &&
            bankAccountNumber.trim() &&
            bankIfsc.trim() &&
            bankName.trim(),
        ))
      : true;
  const upiMethodValid =
    paymentMethod === "upi"
      ? (!showMethodSelector || Boolean(upiId.trim() || upiQrFile || initialUpiQrObjectKey))
      : true;
  const canSubmit = amountValid && bankMethodValid && upiMethodValid && !localError;
  const paymentMethodLabel = paymentMethod === "upi" ? "UPI" : "Bank";
  const defaultMethodLabel = defaultPaymentMethod === "upi" ? "UPI" : "Bank";
  const isUsingDefaultMethod = paymentMethod === defaultPaymentMethod;

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-base">Get Final Payment</DialogTitle>
        </DialogHeader>

        <div className="space-y-3 py-2">
          <div className="rounded-md border border-gray-200 bg-gray-50 p-3 text-xs text-gray-600">
            <p>Trip Amount: <span className="font-medium text-gray-900">{formatCurrency(tripAmount)}</span></p>
            <p>Paid Advance: <span className="font-medium text-gray-900">{formatCurrency(paidAdvanceTotal)}</span></p>
            <p>Suggested Final: <span className="font-medium text-gray-900">{formatCurrency(suggestedAmount)}</span></p>
          </div>

          <div className="space-y-3">
            <div className="space-y-1">
              <Label className="text-xs text-gray-600">Final Amount *</Label>
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

            <div className="rounded-md border border-gray-200 bg-white p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-xs text-gray-500">Payment Method</p>
                  <p className="text-sm font-medium text-gray-900">{paymentMethodLabel}</p>
                  <p className="text-[11px] text-gray-500">
                    Default from advance request: {defaultMethodLabel}
                    {isUsingDefaultMethod ? " (currently used)" : ""}
                  </p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 text-[11px]"
                  onClick={() => setShowMethodSelector((prev) => !prev)}
                >
                  {showMethodSelector ? "Hide Method Change" : "Change Payment Method"}
                </Button>
              </div>

              {showMethodSelector && (
                <div className="mt-2 space-y-1">
                  <Label className="text-xs text-gray-600">Select Method *</Label>
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
              )}
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

          {showMethodSelector && paymentMethod === "bank" && (
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

          {showMethodSelector && paymentMethod === "upi" && (
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
                {!upiQrFile && initialUpiQrObjectKey && !showUpiQrPicker && (
                  <div className="rounded-md border border-emerald-200 bg-white p-2">
                    <p className="text-[11px] text-emerald-700">
                      Using QR already uploaded in advance request.
                    </p>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="mt-2 h-7 text-[11px]"
                      onClick={() => setShowUpiQrPicker(true)}
                    >
                      Replace QR
                    </Button>
                  </div>
                )}
                {(!initialUpiQrObjectKey || showUpiQrPicker || upiQrFile) && (
                  <>
                    <Input
                      type="file"
                      accept="image/*,.jpg,.jpeg,.png,.webp"
                      onChange={(event) => handleQrFileChange(event.target.files?.[0] ?? null)}
                      className="h-9 text-sm"
                    />
                    <p className="text-[11px] text-gray-500">Maximum file size: 10 MB</p>
                  </>
                )}
              </div>
              {upiQrFile && (
                <div className="rounded-md border border-emerald-200 bg-white p-2">
                  <p className="text-xs text-gray-700 truncate">{upiQrFile.name}</p>
                  <p className="text-[11px] text-gray-500">{Math.ceil(upiQrFile.size / 1024)} KB</p>
                  {initialUpiQrObjectKey && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="mt-1 h-6 px-0 text-[11px] text-emerald-700"
                      onClick={() => {
                        setUpiQrFile(null);
                        setShowUpiQrPicker(false);
                      }}
                    >
                      Keep Advance QR Instead
                    </Button>
                  )}
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
              {!showMethodSelector
                ? "Click Change Payment Method only if you want to override advance payment details."
                : paymentMethod === "upi"
                  ? "Provide a valid amount and either UPI ID or UPI QR."
                  : "Provide a valid amount and all bank details."}
            </p>
          )}

          {localError && <p className="text-sm text-red-600">{localError}</p>}
          {createMutation.isError && (
            <p className="text-sm text-red-600">
              {createMutation.error instanceof Error
                ? createMutation.error.message
                : "Unable to create final payment request"}
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
            Create Final Request
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
