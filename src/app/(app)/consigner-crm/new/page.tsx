"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { createConsignerLead, getConsignerLeadById, updateConsignerLead } from "@/lib/api/consigner-crm";
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
import { cn } from "@/lib/utils";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function fieldError(value: string, touched: boolean, validate: () => string | null): string | null {
  if (!touched) return null;
  return validate();
}

export default function AddLeadPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const editId = searchParams.get("edit");
  const isEditMode = !!editId;

  const [error, setError] = useState("");
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [formLoaded, setFormLoaded] = useState(false);
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

  const markTouched = (field: string) => setTouched((p) => ({ ...p, [field]: true }));
  const markAllTouched = () => {
    const all: Record<string, boolean> = {};
    for (const key of Object.keys(form)) all[key] = true;
    setTouched(all);
  };

  const updateField = (field: string, value: string) => {
    const nextValue = (() => {
      switch (field) {
        case "companyName": return sanitizeSingleLineInput(value, FIELD_LIMITS.companyName);
        case "contactPerson":
        case "contactPersonDesignation": return sanitizeSingleLineInput(value, FIELD_LIMITS.fullName);
        case "companyAddress": return sanitizeSingleLineInput(value, FIELD_LIMITS.address);
        case "natureOfBusiness": return sanitizeSingleLineInput(value, FIELD_LIMITS.companyName);
        case "phone": return sanitizePhoneInput(value, FIELD_LIMITS.phoneDigits);
        case "email": return sanitizeSingleLineInput(value, FIELD_LIMITS.email).toLowerCase();
        case "estimatedValue": return sanitizeDecimalInput(value, { maxIntegerDigits: FIELD_LIMITS.currencyDigits, maxFractionDigits: 2 });
        case "route": return sanitizeSingleLineInput(value, FIELD_LIMITS.location);
        case "notes": return sanitizeMultilineInput(value, FIELD_LIMITS.notes);
        default: return value;
      }
    })();
    setForm((prev) => ({ ...prev, [field]: nextValue }));
  };

  // Validation helpers
  const phoneDigits = form.phone.replace(/\D/g, "");
  const errors = {
    companyName: fieldError(form.companyName, !!touched.companyName, () =>
      !form.companyName.trim() ? "Company name is required" : form.companyName.trim().length < 2 ? "Too short" : null,
    ),
    contactPerson: fieldError(form.contactPerson, !!touched.contactPerson, () =>
      !form.contactPerson.trim() ? "Contact person is required" : form.contactPerson.trim().length < 2 ? "Too short" : null,
    ),
    phone: fieldError(form.phone, !!touched.phone, () =>
      !form.phone.trim() ? "Phone is required" : phoneDigits.length < 10 ? "At least 10 digits required" : !/^[6-9]/.test(phoneDigits) ? "Must start with 6-9" : null,
    ),
    email: fieldError(form.email, !!touched.email, () =>
      form.email && !EMAIL_REGEX.test(form.email) ? "Invalid email address" : null,
    ),
    source: fieldError(form.source, !!touched.source, () =>
      !form.source ? "Source is required" : null,
    ),
  };

  const isValid =
    normalizeSingleLineForSubmit(form.companyName, FIELD_LIMITS.companyName).length >= 2 &&
    normalizeSingleLineForSubmit(form.contactPerson, FIELD_LIMITS.fullName).length >= 2 &&
    phoneDigits.length >= 10 &&
    form.source &&
    (!form.email || isValidEmail(normalizeSingleLineForSubmit(form.email, FIELD_LIMITS.email)));

  // Fetch lead data for edit mode
  const editQuery = useQuery({
    queryKey: ["consigner-crm", "lead", editId],
    queryFn: () => getConsignerLeadById(editId!),
    enabled: isEditMode,
  });

  // Pre-fill form when edit data loads
  useEffect(() => {
    if (!editQuery.data || formLoaded) return;
    const d = editQuery.data;
    setForm({
      companyName: d.companyName ?? "",
      companyAddress: d.companyAddress ?? "",
      contactPerson: d.contactPerson ?? "",
      contactPersonDesignation: d.contactPersonDesignation ?? "",
      natureOfBusiness: d.natureOfBusiness ?? "",
      phone: d.phone ?? "",
      email: d.email ?? "",
      source: d.source ?? "",
      estimatedValue: d.estimatedValue ? String(d.estimatedValue) : "",
      route: d.route ?? "",
      vehicleRequirements: d.vehicleRequirements ?? [],
      priority: d.priority ?? "medium",
      notes: d.notes ?? "",
      nextFollowUp: d.nextFollowUp ?? "",
    });
    setFormLoaded(true);
  }, [editQuery.data, formLoaded]);

  const vehicleMasterQuery = useQuery({
    queryKey: queryKeys.vehicleMasterOptions,
    queryFn: listVehicleMasterOptions,
  });

  const vehicleMaster = vehicleMasterQuery.data ?? [];
  const vehicleTypeOptions = vehicleMaster.length > 0
    ? Array.from(new Set(vehicleMaster.map((type) => type.name).filter(Boolean)))
    : [];

  const payload = () => ({
    companyName: normalizeSingleLineForSubmit(form.companyName, FIELD_LIMITS.companyName),
    companyAddress: normalizeSingleLineForSubmit(form.companyAddress, FIELD_LIMITS.address) || undefined,
    contactPerson: normalizeSingleLineForSubmit(form.contactPerson, FIELD_LIMITS.fullName),
    contactPersonDesignation: normalizeSingleLineForSubmit(form.contactPersonDesignation, FIELD_LIMITS.fullName) || undefined,
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
  });

  const createMutation = useMutation({
    mutationFn: () => isEditMode ? updateConsignerLead(editId!, payload()) : createConsignerLead(payload()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["consigner-crm"] });
      router.push(isEditMode ? `/consigner-crm/${editId}` : "/consigner-crm");
    },
    onError: (err) => {
      setError(err instanceof Error ? err.message : isEditMode ? "Failed to update lead" : "Failed to create lead");
    },
  });

  const handleSubmit = () => {
    markAllTouched();
    if (!isValid) return;
    setError("");
    createMutation.mutate();
  };

  return (
    <div className="space-y-4">
      <PageHeader title={isEditMode ? "Edit Lead" : "Add New Lead"} description={isEditMode ? "Update lead information" : "Create a new consigner lead to track in your pipeline"} />

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
              <FieldWrapper label="Company Name" required error={errors.companyName}>
                <Input
                  placeholder="e.g. Tata Steel Ltd"
                  value={form.companyName}
                  onChange={(e) => updateField("companyName", e.target.value)}
                  onBlur={() => markTouched("companyName")}
                  className={cn("h-9 text-sm", errors.companyName && "border-red-400 focus-visible:ring-red-400")}
                  maxLength={FIELD_LIMITS.companyName}
                />
              </FieldWrapper>
              <FieldWrapper label="Contact Person" required error={errors.contactPerson}>
                <Input
                  placeholder="e.g. Rajesh Kumar"
                  value={form.contactPerson}
                  onChange={(e) => updateField("contactPerson", e.target.value)}
                  onBlur={() => markTouched("contactPerson")}
                  className={cn("h-9 text-sm", errors.contactPerson && "border-red-400 focus-visible:ring-red-400")}
                  maxLength={FIELD_LIMITS.fullName}
                />
              </FieldWrapper>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <FieldWrapper label="Company Address">
                <Input
                  placeholder="e.g. GIDC, Vapi, Gujarat"
                  value={form.companyAddress}
                  onChange={(e) => updateField("companyAddress", e.target.value)}
                  className="h-9 text-sm"
                  maxLength={FIELD_LIMITS.address}
                />
              </FieldWrapper>
              <FieldWrapper label="Contact Person Designation">
                <Input
                  placeholder="e.g. Procurement Manager"
                  value={form.contactPersonDesignation}
                  onChange={(e) => updateField("contactPersonDesignation", e.target.value)}
                  className="h-9 text-sm"
                  maxLength={FIELD_LIMITS.fullName}
                />
              </FieldWrapper>
            </div>

            {/* Phone + Email */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <FieldWrapper label="Phone" required error={errors.phone}>
                <div className="flex items-center gap-1.5">
                  <span className="text-sm text-gray-500 shrink-0">+91</span>
                  <Input
                    placeholder="9876543210"
                    value={form.phone}
                    onChange={(e) => updateField("phone", e.target.value)}
                    onBlur={() => markTouched("phone")}
                    className={cn("h-9 text-sm", errors.phone && "border-red-400 focus-visible:ring-red-400")}
                    inputMode="tel"
                    maxLength={10}
                  />
                </div>
              </FieldWrapper>
              <FieldWrapper label="Email" error={errors.email}>
                <Input
                  type="email"
                  placeholder="e.g. contact@company.com"
                  value={form.email}
                  onChange={(e) => updateField("email", e.target.value)}
                  onBlur={() => markTouched("email")}
                  className={cn("h-9 text-sm", errors.email && "border-red-400 focus-visible:ring-red-400")}
                  autoCapitalize="none"
                  spellCheck={false}
                  maxLength={FIELD_LIMITS.email}
                />
              </FieldWrapper>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <FieldWrapper label="Nature Of Business">
                <Input
                  placeholder="e.g. Steel Manufacturing"
                  value={form.natureOfBusiness}
                  onChange={(e) => updateField("natureOfBusiness", e.target.value)}
                  className="h-9 text-sm"
                  maxLength={FIELD_LIMITS.companyName}
                />
              </FieldWrapper>
            </div>

            {/* Source + Priority */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <FieldWrapper label="Source" required error={errors.source}>
                <Select value={form.source} onValueChange={(v) => { updateField("source", v); markTouched("source"); }}>
                  <SelectTrigger className={cn("w-full h-9 text-sm", errors.source && "border-red-400")}>
                    <SelectValue placeholder="Select source" />
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.entries(LEAD_SOURCE_LABELS) as [LeadSource, string][]).map(([key, label]) => (
                      <SelectItem key={key} value={key}>{label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FieldWrapper>
              <FieldWrapper label="Priority">
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
              </FieldWrapper>
            </div>

            {/* Value + Route */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <FieldWrapper label="Estimated Value (₹)">
                <Input
                  type="text"
                  inputMode="decimal"
                  placeholder="e.g. 150000"
                  value={form.estimatedValue}
                  onChange={(e) => updateField("estimatedValue", e.target.value)}
                  className="h-9 text-sm"
                />
              </FieldWrapper>
              <FieldWrapper label="Route">
                <Input
                  placeholder="e.g. Mumbai - Delhi"
                  value={form.route}
                  onChange={(e) => updateField("route", e.target.value)}
                  className="h-9 text-sm"
                  maxLength={FIELD_LIMITS.location}
                />
              </FieldWrapper>
            </div>

            <div className="space-y-2">
              <Label className="text-sm font-medium">Vehicle Requirement (Multi Select)</Label>
              {vehicleTypeOptions.length > 0 ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 rounded-md border border-gray-200 p-3">
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
                                ? [...prev.vehicleRequirements, vehicleType]
                                : prev.vehicleRequirements.filter((item) => item !== vehicleType),
                            }));
                          }}
                        />
                        <span>{vehicleType}</span>
                      </label>
                    );
                  })}
                </div>
              ) : (
                <p className="text-xs text-gray-400 rounded-md border border-dashed border-gray-200 p-3">
                  {vehicleMasterQuery.isLoading ? "Loading vehicles..." : "No vehicles in master. Add them in Administration > Vehicle Master."}
                </p>
              )}
            </div>

            {/* Next Follow-up */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <FieldWrapper label="Next Follow-up Date">
                <Input
                  type="date"
                  value={form.nextFollowUp}
                  onChange={(e) => updateField("nextFollowUp", e.target.value)}
                  className="h-9 text-sm"
                />
              </FieldWrapper>
            </div>

            {/* Notes */}
            <div className="space-y-1.5">
              <Label className="text-sm font-medium">Notes</Label>
              <Textarea
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
              <Button variant="outline" onClick={() => router.push("/consigner-crm")} className="h-9 text-sm" disabled={createMutation.isPending}>
                <X className="h-4 w-4 mr-1.5" /> Cancel
              </Button>
              <Button onClick={handleSubmit} disabled={createMutation.isPending} className="h-9 text-sm">
                {createMutation.isPending ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Save className="h-4 w-4 mr-1.5" />}
                {isEditMode ? "Update Lead" : "Save Lead"}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function FieldWrapper({ label, required, error, children }: {
  label: string;
  required?: boolean;
  error?: string | null;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-sm font-medium">
        {label} {required && <span className="text-red-500">*</span>}
      </Label>
      {children}
      {error && <p className="text-[11px] text-red-500">{error}</p>}
    </div>
  );
}
