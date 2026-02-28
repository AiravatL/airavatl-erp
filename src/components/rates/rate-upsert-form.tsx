"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { listVehicleMasterOptions } from "@/lib/api/vehicle-master";
import { queryKeys } from "@/lib/query/keys";
import { RATE_CATEGORY_LABELS } from "@/lib/types";
import type { RateCategory } from "@/lib/types";
import type { SubmitRateInput } from "@/lib/api/rates";
import { FIELD_LIMITS } from "@/lib/validation/client/field-limits";
import {
  normalizeMultilineForSubmit,
  normalizeSingleLineForSubmit,
  sanitizeMultilineInput,
  sanitizeSingleLineInput,
} from "@/lib/validation/client/sanitizers";
import { sanitizeDecimalInput } from "@/lib/validation/client/validators";
import { Save, X } from "lucide-react";

const CONFIDENCE_LEVELS = [
  { value: "high", label: "High" },
  { value: "medium", label: "Medium" },
  { value: "low", label: "Low" },
] as const;

export interface RateUpsertFormValues {
  fromLocation: string;
  toLocation: string;
  vehicleType: string;
  rateCategory: string;
  freightRate: string;
  ratePerTon: string;
  ratePerKg: string;
  confidenceLevel: string;
  source: string;
  remarks: string;
}

interface RateUpsertResult {
  successMessage: string;
  redirectTo?: string;
}

interface RateUpsertFormProps {
  mode: "create" | "edit";
  title: string;
  description: string;
  initialValues: RateUpsertFormValues;
  submitButtonLabel: string;
  helperNote?: string;
  backHref?: string;
  onSubmit: (input: SubmitRateInput) => Promise<RateUpsertResult>;
}

export const EMPTY_RATE_FORM_VALUES: RateUpsertFormValues = {
  fromLocation: "",
  toLocation: "",
  vehicleType: "",
  rateCategory: "",
  freightRate: "",
  ratePerTon: "",
  ratePerKg: "",
  confidenceLevel: "",
  source: "",
  remarks: "",
};

export function toRateFormValues(rate: SubmitRateInput): RateUpsertFormValues {
  return {
    fromLocation: rate.fromLocation ?? "",
    toLocation: rate.toLocation ?? "",
    vehicleType: rate.vehicleType ?? "",
    rateCategory: rate.rateCategory ?? "",
    freightRate: String(rate.freightRate ?? ""),
    ratePerTon: rate.ratePerTon == null ? "" : String(rate.ratePerTon),
    ratePerKg: rate.ratePerKg == null ? "" : String(rate.ratePerKg),
    confidenceLevel: rate.confidenceLevel ?? "",
    source: rate.source ?? "",
    remarks: rate.remarks ?? "",
  };
}

export function RateUpsertForm({
  mode,
  title,
  description,
  initialValues,
  submitButtonLabel,
  helperNote,
  backHref = "/rates",
  onSubmit,
}: RateUpsertFormProps) {
  const router = useRouter();
  const [form, setForm] = useState<RateUpsertFormValues>(initialValues);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    setForm(initialValues);
  }, [initialValues]);

  const vehicleMasterQuery = useQuery({
    queryKey: queryKeys.vehicleMasterOptions,
    queryFn: listVehicleMasterOptions,
  });

  const vehicleTypeOptions = useMemo(() => {
    const fromMaster = (vehicleMasterQuery.data ?? [])
      .filter((type) => type.active)
      .map((type) => type.name);
    return Array.from(new Set([form.vehicleType, ...fromMaster].filter(Boolean)));
  }, [form.vehicleType, vehicleMasterQuery.data]);

  const freightRateValue = Number(form.freightRate);
  const ratePerTonValue = form.ratePerTon ? Number(form.ratePerTon) : null;
  const ratePerKgValue = form.ratePerKg ? Number(form.ratePerKg) : null;

  const isValid = useMemo(
    () =>
      normalizeSingleLineForSubmit(form.fromLocation, FIELD_LIMITS.location).length > 0 &&
      normalizeSingleLineForSubmit(form.toLocation, FIELD_LIMITS.location).length > 0 &&
      form.vehicleType.length > 0 &&
      form.rateCategory.length > 0 &&
      form.freightRate.trim().length > 0 &&
      Number.isFinite(freightRateValue) &&
      freightRateValue > 0 &&
      (ratePerTonValue === null || (Number.isFinite(ratePerTonValue) && ratePerTonValue >= 0)) &&
      (ratePerKgValue === null || (Number.isFinite(ratePerKgValue) && ratePerKgValue >= 0)),
    [form, freightRateValue, ratePerKgValue, ratePerTonValue],
  );

  function updateField(field: keyof RateUpsertFormValues, value: string) {
    const nextValue = (() => {
      switch (field) {
        case "fromLocation":
        case "toLocation":
          return sanitizeSingleLineInput(value, FIELD_LIMITS.location);
        case "source":
          return sanitizeSingleLineInput(value, FIELD_LIMITS.source);
        case "remarks":
          return sanitizeMultilineInput(value, FIELD_LIMITS.remarks);
        case "freightRate":
        case "ratePerTon":
        case "ratePerKg":
          return sanitizeDecimalInput(value, {
            maxIntegerDigits: FIELD_LIMITS.currencyDigits,
            maxFractionDigits: 2,
          });
        default:
          return value;
      }
    })();

    setForm((prev) => ({ ...prev, [field]: nextValue }));
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!isValid || submitting) return;

    setSubmitting(true);
    setError(null);
    setSuccess(null);

    try {
      const result = await onSubmit({
        fromLocation: normalizeSingleLineForSubmit(form.fromLocation, FIELD_LIMITS.location),
        toLocation: normalizeSingleLineForSubmit(form.toLocation, FIELD_LIMITS.location),
        vehicleType: form.vehicleType,
        rateCategory: form.rateCategory as RateCategory,
        freightRate: Number(form.freightRate),
        ratePerTon: form.ratePerTon ? Number(form.ratePerTon) : null,
        ratePerKg: form.ratePerKg ? Number(form.ratePerKg) : null,
        confidenceLevel: form.confidenceLevel
          ? (form.confidenceLevel as "high" | "medium" | "low")
          : null,
        source: normalizeSingleLineForSubmit(form.source, FIELD_LIMITS.source) || null,
        remarks: normalizeMultilineForSubmit(form.remarks, FIELD_LIMITS.remarks) || null,
      });

      setSuccess(result.successMessage);
      setTimeout(() => {
        router.push(result.redirectTo ?? "/rates");
      }, 700);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Unable to save rate");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-4">
      <PageHeader title={title} description={description} />

      <Card>
        <CardContent className="p-4 sm:p-6">
          <form className="space-y-5" onSubmit={handleSubmit}>
            {helperNote && (
              <p className="rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-700">
                {helperNote}
              </p>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="fromLocation" className="text-sm font-medium">
                  From Location <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="fromLocation"
                  placeholder="e.g. Mumbai, MH"
                  value={form.fromLocation}
                  onChange={(e) => updateField("fromLocation", e.target.value)}
                  className="h-9 text-sm"
                  maxLength={FIELD_LIMITS.location}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="toLocation" className="text-sm font-medium">
                  To Location <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="toLocation"
                  placeholder="e.g. Delhi, DL"
                  value={form.toLocation}
                  onChange={(e) => updateField("toLocation", e.target.value)}
                  className="h-9 text-sm"
                  maxLength={FIELD_LIMITS.location}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-sm font-medium">
                  Vehicle Type <span className="text-red-500">*</span>
                </Label>
                <Select value={form.vehicleType} onValueChange={(v) => updateField("vehicleType", v)}>
                  <SelectTrigger className="w-full h-9 text-sm">
                    <SelectValue placeholder="Select vehicle type" />
                  </SelectTrigger>
                  <SelectContent>
                    {vehicleTypeOptions.map((v) => (
                      <SelectItem key={v} value={v}>
                        {v}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {vehicleMasterQuery.isLoading && (
                  <p className="text-[11px] text-gray-500">Loading vehicle types...</p>
                )}
                {!vehicleMasterQuery.isLoading && vehicleTypeOptions.length === 0 && (
                  <p className="text-[11px] text-amber-600">
                    No active vehicle types configured in Vehicle Master.
                  </p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm font-medium">
                  Rate Category <span className="text-red-500">*</span>
                </Label>
                <Select value={form.rateCategory} onValueChange={(v) => updateField("rateCategory", v)}>
                  <SelectTrigger className="w-full h-9 text-sm">
                    <SelectValue placeholder="Select category" />
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.entries(RATE_CATEGORY_LABELS) as [RateCategory, string][]).map(([key, label]) => (
                      <SelectItem key={key} value={key}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="freightRate" className="text-sm font-medium">
                  Freight Rate (₹) <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="freightRate"
                  type="text"
                  inputMode="decimal"
                  placeholder="e.g. 85000"
                  value={form.freightRate}
                  onChange={(e) => updateField("freightRate", e.target.value)}
                  className="h-9 text-sm"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ratePerTon" className="text-sm font-medium">
                  Rate Per Ton (₹)
                </Label>
                <Input
                  id="ratePerTon"
                  type="text"
                  inputMode="decimal"
                  placeholder="Optional"
                  value={form.ratePerTon}
                  onChange={(e) => updateField("ratePerTon", e.target.value)}
                  className="h-9 text-sm"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ratePerKg" className="text-sm font-medium">
                  Rate Per KG (₹)
                </Label>
                <Input
                  id="ratePerKg"
                  type="text"
                  inputMode="decimal"
                  placeholder="Optional"
                  value={form.ratePerKg}
                  onChange={(e) => updateField("ratePerKg", e.target.value)}
                  className="h-9 text-sm"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-sm font-medium">Confidence Level</Label>
                <Select value={form.confidenceLevel} onValueChange={(v) => updateField("confidenceLevel", v)}>
                  <SelectTrigger className="w-full h-9 text-sm">
                    <SelectValue placeholder="Select confidence level" />
                  </SelectTrigger>
                  <SelectContent>
                    {CONFIDENCE_LEVELS.map((c) => (
                      <SelectItem key={c.value} value={c.value}>
                        {c.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="source" className="text-sm font-medium">
                  Source
                </Label>
                <Input
                  id="source"
                  placeholder="e.g. Vendor quote, Market survey"
                  value={form.source}
                  onChange={(e) => updateField("source", e.target.value)}
                  className="h-9 text-sm"
                  maxLength={FIELD_LIMITS.source}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="remarks" className="text-sm font-medium">
                Remarks
              </Label>
              <Textarea
                id="remarks"
                placeholder="Any additional notes about this rate..."
                value={form.remarks}
                onChange={(e) => updateField("remarks", e.target.value)}
                rows={3}
                className="text-sm resize-none"
                maxLength={FIELD_LIMITS.remarks}
              />
              <p className="text-[11px] text-gray-500 text-right">{form.remarks.length}/{FIELD_LIMITS.remarks}</p>
            </div>

            {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}
            {success && (
              <p className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{success}</p>
            )}

            <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => router.push(backHref)}
                className="h-9 text-sm"
                disabled={submitting}
              >
                <X className="h-4 w-4 mr-1.5" />
                Cancel
              </Button>
              <Button type="submit" disabled={!isValid || submitting} className="h-9 text-sm">
                <Save className="h-4 w-4 mr-1.5" />
                {submitting
                  ? mode === "create"
                    ? "Submitting..."
                    : "Saving..."
                  : submitButtonLabel}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
