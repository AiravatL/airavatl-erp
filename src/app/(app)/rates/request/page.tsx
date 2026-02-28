"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ClipboardList, Loader2, Save, X } from "lucide-react";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { createRateRequest } from "@/lib/api/rate-requests";
import { listVehicleMasterOptions } from "@/lib/api/vehicle-master";
import { useAuth } from "@/lib/auth/auth-context";
import { queryKeys } from "@/lib/query/keys";
import { RATE_CATEGORY_LABELS, type RateCategory, type Role } from "@/lib/types";
import { FIELD_LIMITS } from "@/lib/validation/client/field-limits";
import {
  normalizeMultilineForSubmit,
  normalizeSingleLineForSubmit,
  sanitizeMultilineInput,
  sanitizeSingleLineInput,
} from "@/lib/validation/client/sanitizers";

const REQUEST_ROLES: Role[] = ["sales_consigner", "operations_consigner", "admin", "super_admin"];

const RATE_CATEGORIES: RateCategory[] = ["ftl", "ptl", "odc", "container", "express"];

interface FormState {
  fromLocation: string;
  toLocation: string;
  vehicleType: string;
  rateCategory: string;
  notes: string;
}

const EMPTY_FORM: FormState = {
  fromLocation: "",
  toLocation: "",
  vehicleType: "",
  rateCategory: "",
  notes: "",
};

export default function RequestRatePage() {
  const router = useRouter();
  const { user } = useAuth();

  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const isAllowed = user ? REQUEST_ROLES.includes(user.role) : false;

  const vehicleMasterQuery = useQuery({
    queryKey: queryKeys.vehicleMasterOptions,
    queryFn: listVehicleMasterOptions,
    enabled: isAllowed,
  });

  const vehicleTypeOptions = useMemo(
    () => (vehicleMasterQuery.data ?? []).filter((type) => type.active).map((type) => type.name),
    [vehicleMasterQuery.data],
  );

  const mutation = useMutation({
    mutationFn: createRateRequest,
    onSuccess: () => {
      setError(null);
      setSuccess("Rate request created successfully.");
      setTimeout(() => router.push("/rates/requests"), 700);
    },
    onError: (mutationError) => {
      setSuccess(null);
      setError(mutationError instanceof Error ? mutationError.message : "Unable to create rate request");
    },
  });

  if (user && !isAllowed) {
    return (
      <EmptyState
        icon={ClipboardList}
        title="Access restricted"
        description="Rate request is available only to Consigner Sales, Consigner Ops and Admin roles."
      />
    );
  }

  const isValid =
    normalizeSingleLineForSubmit(form.fromLocation, FIELD_LIMITS.location).length > 0 &&
    normalizeSingleLineForSubmit(form.toLocation, FIELD_LIMITS.location).length > 0 &&
    form.vehicleType.length > 0 &&
    RATE_CATEGORIES.includes(form.rateCategory as RateCategory);

  function setField<K extends keyof FormState>(field: K, value: FormState[K]) {
    const sanitized = (() => {
      if (field === "fromLocation" || field === "toLocation") {
        return sanitizeSingleLineInput(value as string, FIELD_LIMITS.location) as FormState[K];
      }
      if (field === "notes") {
        return sanitizeMultilineInput(value as string, FIELD_LIMITS.remarks) as FormState[K];
      }
      return value;
    })();
    setForm((prev) => ({ ...prev, [field]: sanitized }));
  }

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!isValid || mutation.isPending) return;

    setError(null);
    setSuccess(null);

    try {
      await mutation.mutateAsync({
        fromLocation: normalizeSingleLineForSubmit(form.fromLocation, FIELD_LIMITS.location),
        toLocation: normalizeSingleLineForSubmit(form.toLocation, FIELD_LIMITS.location),
        vehicleType: form.vehicleType,
        rateCategory: form.rateCategory as RateCategory,
        notes: normalizeMultilineForSubmit(form.notes, FIELD_LIMITS.remarks) || null,
      });
    } catch {
      // Error state is handled by mutation onError.
    }
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Request Rate"
        description="Create a pricing request for the vehicle team. Freight amount is not required here."
      />

      <Card>
        <CardContent className="p-4 sm:p-6">
          <form className="space-y-5" onSubmit={onSubmit}>
            <p className="rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-700">
              Submit route and vehicle details. Vehicle team will add quote and review flow will apply by role.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="fromLocation" className="text-sm font-medium">
                  From Location <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="fromLocation"
                  placeholder="e.g. Mumbai, MH"
                  value={form.fromLocation}
                  onChange={(event) => setField("fromLocation", event.target.value)}
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
                  onChange={(event) => setField("toLocation", event.target.value)}
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
                <Select value={form.vehicleType} onValueChange={(value) => setField("vehicleType", value)}>
                  <SelectTrigger className="w-full h-9 text-sm">
                    <SelectValue placeholder="Select vehicle type" />
                  </SelectTrigger>
                  <SelectContent>
                    {vehicleTypeOptions.map((option) => (
                      <SelectItem key={option} value={option}>
                        {option}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {vehicleMasterQuery.isLoading && (
                  <p className="text-[11px] text-gray-500">Loading vehicle types...</p>
                )}
              </div>

              <div className="space-y-1.5">
                <Label className="text-sm font-medium">
                  Rate Category <span className="text-red-500">*</span>
                </Label>
                <Select value={form.rateCategory} onValueChange={(value) => setField("rateCategory", value)}>
                  <SelectTrigger className="w-full h-9 text-sm">
                    <SelectValue placeholder="Select category" />
                  </SelectTrigger>
                  <SelectContent>
                    {RATE_CATEGORIES.map((category) => (
                      <SelectItem key={category} value={category}>
                        {RATE_CATEGORY_LABELS[category]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="notes" className="text-sm font-medium">Notes</Label>
              <Textarea
                id="notes"
                placeholder="Optional context for vehicle team"
                value={form.notes}
                onChange={(event) => setField("notes", event.target.value)}
                className="text-sm min-h-24"
                maxLength={FIELD_LIMITS.remarks}
              />
            </div>

            {error && (
              <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>
            )}
            {success && (
              <p className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700">
                {success}
              </p>
            )}

            <div className="flex flex-wrap justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => router.push("/rates")}> 
                <X className="h-4 w-4 mr-1" />
                Cancel
              </Button>
              <Button type="submit" disabled={!isValid || mutation.isPending}>
                {mutation.isPending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Save className="h-4 w-4 mr-1" />}
                Create Request
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
