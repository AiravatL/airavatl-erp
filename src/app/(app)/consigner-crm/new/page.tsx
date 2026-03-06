"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { createConsignerLead } from "@/lib/api/consigner-crm";
import { listVehicleMasterOptions } from "@/lib/api/vehicle-master";
import { queryKeys } from "@/lib/query/keys";
import { LEAD_SOURCE_LABELS } from "@/lib/types";
import type { LeadSource, LeadPriority } from "@/lib/types";
import { FIELD_LIMITS } from "@/lib/validation/client/field-limits";
import {
  normalizeMultilineForSubmit,
  normalizeSingleLineForSubmit,
  sanitizeMultilineInput,
  sanitizeSingleLineInput,
} from "@/lib/validation/client/sanitizers";
import { isValidEmail, sanitizeDecimalInput, sanitizePhoneInput } from "@/lib/validation/client/validators";
import { Save, X, Loader2 } from "lucide-react";

const FALLBACK_VEHICLE_TYPES = ["32ft MXL", "20ft SXL", "40ft Trailer"];

export default function AddLeadPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [error, setError] = useState("");
  const [form, setForm] = useState({
    companyName: "",
    companyAddress: "",
    contactPerson: "",
    contactPersonDesignation: "",
    natureOfBusiness: "",
    phone: "",
    email: "",
    source: "",
    estimatedValue: "",
    route: "",
    vehicleRequirements: [] as string[],
    priority: "medium",
    notes: "",
    nextFollowUp: "",
  });

  const updateField = (field: string, value: string) => {
    const nextValue = (() => {
      switch (field) {
        case "companyName":
          return sanitizeSingleLineInput(value, FIELD_LIMITS.companyName);
        case "contactPerson":
        case "contactPersonDesignation":
          return sanitizeSingleLineInput(value, FIELD_LIMITS.fullName);
        case "companyAddress":
          return sanitizeSingleLineInput(value, FIELD_LIMITS.address);
        case "natureOfBusiness":
          return sanitizeSingleLineInput(value, FIELD_LIMITS.companyName);
        case "phone":
        case "nextFollowUp":
          return field === "phone" ? sanitizePhoneInput(value, FIELD_LIMITS.phoneDigits) : value;
        case "email":
          return sanitizeSingleLineInput(value, FIELD_LIMITS.email).toLowerCase();
        case "estimatedValue":
          return sanitizeDecimalInput(value, {
            maxIntegerDigits: FIELD_LIMITS.currencyDigits,
            maxFractionDigits: 2,
          });
        case "route":
          return sanitizeSingleLineInput(value, FIELD_LIMITS.location);
        case "notes":
          return sanitizeMultilineInput(value, FIELD_LIMITS.notes);
        default:
          return value;
      }
    })();

    setForm((prev) => ({ ...prev, [field]: nextValue }));
  };

  const isValid =
    normalizeSingleLineForSubmit(form.companyName, FIELD_LIMITS.companyName) &&
    normalizeSingleLineForSubmit(form.contactPerson, FIELD_LIMITS.fullName) &&
    form.phone.replace(/\D/g, "").length >= 10 &&
    form.source &&
    (!form.email || isValidEmail(normalizeSingleLineForSubmit(form.email, FIELD_LIMITS.email)));

  const vehicleMasterQuery = useQuery({
    queryKey: queryKeys.vehicleMasterOptions,
    queryFn: listVehicleMasterOptions,
  });

  const vehicleMaster = vehicleMasterQuery.data ?? [];
  const hasMasterOptions = vehicleMaster.length > 0;
  const vehicleTypeOptions = hasMasterOptions
    ? Array.from(new Set(vehicleMaster.map((type) => type.name).filter(Boolean)))
    : FALLBACK_VEHICLE_TYPES;

  const createMutation = useMutation({
    mutationFn: () =>
      createConsignerLead({
        companyName: normalizeSingleLineForSubmit(form.companyName, FIELD_LIMITS.companyName),
        companyAddress: normalizeSingleLineForSubmit(form.companyAddress, FIELD_LIMITS.address) || undefined,
        contactPerson: normalizeSingleLineForSubmit(form.contactPerson, FIELD_LIMITS.fullName),
        contactPersonDesignation:
          normalizeSingleLineForSubmit(form.contactPersonDesignation, FIELD_LIMITS.fullName) || undefined,
        natureOfBusiness: normalizeSingleLineForSubmit(form.natureOfBusiness, FIELD_LIMITS.companyName) || undefined,
        phone: form.phone.trim(),
        email: normalizeSingleLineForSubmit(form.email, FIELD_LIMITS.email) || undefined,
        source: form.source as LeadSource,
        estimatedValue: form.estimatedValue ? Number(form.estimatedValue) : undefined,
        route: normalizeSingleLineForSubmit(form.route, FIELD_LIMITS.location) || undefined,
        vehicleRequirements: form.vehicleRequirements,
        priority: (form.priority as LeadPriority) || "medium",
        notes: normalizeMultilineForSubmit(form.notes, FIELD_LIMITS.notes) || undefined,
        nextFollowUp: form.nextFollowUp || null,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["consigner-crm"] });
      router.push("/consigner-crm");
    },
    onError: (err) => {
      setError(err instanceof Error ? err.message : "Failed to create lead");
    },
  });

  const handleSubmit = () => {
    if (!isValid) return;
    setError("");
    createMutation.mutate();
  };

  return (
    <div className="space-y-4">
      <PageHeader
        title="Add New Lead"
        description="Create a new consigner lead to track in your pipeline"
      />

      <Card>
        <CardContent className="p-4 sm:p-6">
          <div className="space-y-5">
            {error && (
              <div className="rounded-md bg-red-50 p-3">
                <p className="text-sm text-red-700">{error}</p>
              </div>
            )}

            {/* Company + Contact */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="companyName" className="text-sm font-medium">
                  Company Name <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="companyName"
                  placeholder="e.g. Tata Steel Ltd"
                  value={form.companyName}
                  onChange={(e) => updateField("companyName", e.target.value)}
                  className="h-9 text-sm"
                  maxLength={FIELD_LIMITS.companyName}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="contactPerson" className="text-sm font-medium">
                  Contact Person <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="contactPerson"
                  placeholder="e.g. Rajesh Kumar"
                  value={form.contactPerson}
                  onChange={(e) => updateField("contactPerson", e.target.value)}
                  className="h-9 text-sm"
                  maxLength={FIELD_LIMITS.fullName}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="companyAddress" className="text-sm font-medium">Company Address</Label>
                <Input
                  id="companyAddress"
                  placeholder="e.g. GIDC, Vapi, Gujarat"
                  value={form.companyAddress}
                  onChange={(e) => updateField("companyAddress", e.target.value)}
                  className="h-9 text-sm"
                  maxLength={FIELD_LIMITS.address}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="contactPersonDesignation" className="text-sm font-medium">
                  Contact Person Designation
                </Label>
                <Input
                  id="contactPersonDesignation"
                  placeholder="e.g. Procurement Manager"
                  value={form.contactPersonDesignation}
                  onChange={(e) => updateField("contactPersonDesignation", e.target.value)}
                  className="h-9 text-sm"
                  maxLength={FIELD_LIMITS.fullName}
                />
              </div>
            </div>

            {/* Phone + Email */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="phone" className="text-sm font-medium">
                  Phone <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="phone"
                  placeholder="e.g. +91 98765 43210"
                  value={form.phone}
                  onChange={(e) => updateField("phone", e.target.value)}
                  className="h-9 text-sm"
                  inputMode="tel"
                  maxLength={FIELD_LIMITS.phoneDigits + 1}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="email" className="text-sm font-medium">
                  Email
                </Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="e.g. contact@company.com"
                  value={form.email}
                  onChange={(e) => updateField("email", e.target.value)}
                  className="h-9 text-sm"
                  autoCapitalize="none"
                  spellCheck={false}
                  maxLength={FIELD_LIMITS.email}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="natureOfBusiness" className="text-sm font-medium">Nature Of Business</Label>
                <Input
                  id="natureOfBusiness"
                  placeholder="e.g. Steel Manufacturing"
                  value={form.natureOfBusiness}
                  onChange={(e) => updateField("natureOfBusiness", e.target.value)}
                  className="h-9 text-sm"
                  maxLength={FIELD_LIMITS.companyName}
                />
              </div>
            </div>

            {/* Source + Priority */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-sm font-medium">
                  Source <span className="text-red-500">*</span>
                </Label>
                <Select value={form.source} onValueChange={(v) => updateField("source", v)}>
                  <SelectTrigger className="w-full h-9 text-sm">
                    <SelectValue placeholder="Select source" />
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.entries(LEAD_SOURCE_LABELS) as [LeadSource, string][]).map(([key, label]) => (
                      <SelectItem key={key} value={key}>{label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm font-medium">Priority</Label>
                <Select value={form.priority} onValueChange={(v) => updateField("priority", v)}>
                  <SelectTrigger className="w-full h-9 text-sm">
                    <SelectValue placeholder="Select priority" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="high">High</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="low">Low</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Value + Route */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="estimatedValue" className="text-sm font-medium">
                  Estimated Value (₹)
                </Label>
                <Input
                  id="estimatedValue"
                  type="text"
                  inputMode="decimal"
                  placeholder="e.g. 150000"
                  value={form.estimatedValue}
                  onChange={(e) => updateField("estimatedValue", e.target.value)}
                  className="h-9 text-sm"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="route" className="text-sm font-medium">
                  Route
                </Label>
                <Input
                  id="route"
                  placeholder="e.g. Mumbai - Delhi"
                  value={form.route}
                  onChange={(e) => updateField("route", e.target.value)}
                  className="h-9 text-sm"
                  maxLength={FIELD_LIMITS.location}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-sm font-medium">Vehicle Requirement (Multi Select)</Label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 rounded-md border border-gray-200 p-3">
                {vehicleTypeOptions.map((vehicleType) => {
                  const checked = form.vehicleRequirements.includes(vehicleType);
                  return (
                    <label key={vehicleType} className="flex items-center gap-2 text-sm text-gray-700">
                      <Checkbox
                        checked={checked}
                        onCheckedChange={(value) => {
                          setForm((prev) => ({
                            ...prev,
                            vehicleRequirements: value
                              ? prev.vehicleRequirements.includes(vehicleType)
                                ? prev.vehicleRequirements
                                : [...prev.vehicleRequirements, vehicleType]
                              : prev.vehicleRequirements.filter((item) => item !== vehicleType),
                          }));
                        }}
                      />
                      <span>{vehicleType}</span>
                    </label>
                  );
                })}
              </div>
              {vehicleMasterQuery.isError && (
                <p className="text-[11px] text-amber-600">Using fallback vehicle types</p>
              )}
            </div>

            {/* Next Follow-up */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="nextFollowUp" className="text-sm font-medium">
                  Next Follow-up Date
                </Label>
                <Input
                  id="nextFollowUp"
                  type="date"
                  value={form.nextFollowUp}
                  onChange={(e) => updateField("nextFollowUp", e.target.value)}
                  className="h-9 text-sm"
                />
              </div>
            </div>

            {/* Notes */}
            <div className="space-y-1.5">
              <Label htmlFor="notes" className="text-sm font-medium">Notes</Label>
              <Textarea
                id="notes"
                placeholder="Any additional notes about this lead..."
                value={form.notes}
                onChange={(e) => updateField("notes", e.target.value)}
                rows={3}
                className="text-sm resize-none"
                maxLength={FIELD_LIMITS.notes}
              />
              <p className="text-[11px] text-gray-500 text-right">{form.notes.length}/{FIELD_LIMITS.notes}</p>
            </div>

            {/* Actions */}
            <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 pt-2">
              <Button
                variant="outline"
                onClick={() => router.push("/consigner-crm")}
                className="h-9 text-sm"
                disabled={createMutation.isPending}
              >
                <X className="h-4 w-4 mr-1.5" />
                Cancel
              </Button>
              <Button
                onClick={handleSubmit}
                disabled={!isValid || createMutation.isPending}
                className="h-9 text-sm"
              >
                {createMutation.isPending ? (
                  <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                ) : (
                  <Save className="h-4 w-4 mr-1.5" />
                )}
                Save Lead
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
