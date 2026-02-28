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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { useAuth } from "@/lib/auth/auth-context";
import { createVehicleLead } from "@/lib/api/vehicle-crm";
import { listVehicleMasterOptions } from "@/lib/api/vehicle-master";
import { queryKeys } from "@/lib/query/keys";
import type { Role } from "@/lib/types";
import { FIELD_LIMITS } from "@/lib/validation/client/field-limits";
import {
  normalizeMultilineForSubmit,
  normalizeSingleLineForSubmit,
  sanitizeMultilineInput,
  sanitizeSingleLineInput,
} from "@/lib/validation/client/sanitizers";
import { sanitizeDecimalInput, sanitizePhoneInput } from "@/lib/validation/client/validators";
import { Save, X } from "lucide-react";

const FALLBACK_VEHICLE_TYPES = ["32ft MXL", "20ft SXL", "40ft Trailer"];
const FALLBACK_VEHICLE_LENGTHS = ["20ft", "22ft", "24ft", "32ft", "40ft"];
const VEHICLE_CRM_ALLOWED_ROLES: Role[] = ["sales_vehicles", "admin", "super_admin"];

export default function AddVehicleLeadPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [form, setForm] = useState({
    driverName: "",
    mobile: "",
    alternateContact: "",
    ownerName: "",
    ownerContact: "",
    isOwnerCumDriver: false,
    currentAddress: "",
    permanentAddress: "",
    preferredRoute: "",
    vehicleType: "",
    vehicleLength: "",
    vehicleCapacity: "",
    vehicleRegistration: "",
    marketRate: "",
    remarks: "",
  });

  const updateField = (field: string, value: string | boolean) => {
    const normalizedValue =
      typeof value !== "string"
        ? value
        : (() => {
            switch (field) {
              case "driverName":
              case "ownerName":
                return sanitizeSingleLineInput(value, FIELD_LIMITS.fullName);
              case "mobile":
              case "alternateContact":
              case "ownerContact":
                return sanitizePhoneInput(value, FIELD_LIMITS.phoneDigits);
              case "currentAddress":
              case "permanentAddress":
                return sanitizeSingleLineInput(value, FIELD_LIMITS.address);
              case "preferredRoute":
                return sanitizeSingleLineInput(value, FIELD_LIMITS.location);
              case "vehicleCapacity":
                return sanitizeSingleLineInput(value, FIELD_LIMITS.vehicleCapacity);
              case "vehicleRegistration":
                return sanitizeSingleLineInput(value.toUpperCase(), FIELD_LIMITS.vehicleNumber);
              case "marketRate":
                return sanitizeDecimalInput(value, {
                  maxIntegerDigits: FIELD_LIMITS.currencyDigits,
                  maxFractionDigits: 2,
                });
              case "remarks":
                return sanitizeMultilineInput(value, FIELD_LIMITS.remarks);
              default:
                return value;
            }
          })();

    setForm((prev) => {
      const next = { ...prev, [field]: normalizedValue };
      if (field === "vehicleType" && typeof value === "string") {
        next.vehicleLength = "";
      }
      // If owner-driver toggled on, sync owner fields
      if (field === "isOwnerCumDriver" && value === true) {
        next.ownerName = next.driverName;
        next.ownerContact = next.mobile;
      }
      if (next.isOwnerCumDriver && field === "driverName" && typeof value === "string") {
        next.ownerName = typeof normalizedValue === "string" ? normalizedValue : "";
      }
      if (next.isOwnerCumDriver && field === "mobile" && typeof value === "string") {
        next.ownerContact = typeof normalizedValue === "string" ? normalizedValue : "";
      }
      return next;
    });
  };

  const isValid =
    normalizeSingleLineForSubmit(form.driverName, FIELD_LIMITS.fullName) &&
    form.mobile.replace(/\D/g, "").length >= 10 &&
    form.vehicleType;

  const vehicleMasterQuery = useQuery({
    queryKey: queryKeys.vehicleMasterOptions,
    queryFn: listVehicleMasterOptions,
    enabled: !!user,
  });

  const vehicleMaster = vehicleMasterQuery.data ?? [];
  const selectedType = vehicleMaster.find((type) => type.name === form.vehicleType) ?? null;
  const hasMasterOptions = vehicleMaster.length > 0;

  const vehicleTypeOptions = hasMasterOptions
    ? Array.from(new Set([form.vehicleType, ...vehicleMaster.map((type) => type.name)].filter(Boolean)))
    : Array.from(new Set([form.vehicleType, ...FALLBACK_VEHICLE_TYPES].filter(Boolean)));

  const masterLengthOptions = selectedType ? selectedType.lengths.map((length) => length.value) : [];
  const vehicleLengthOptions = hasMasterOptions
    ? Array.from(new Set([form.vehicleLength, ...masterLengthOptions].filter(Boolean)))
    : Array.from(new Set([form.vehicleLength, ...FALLBACK_VEHICLE_LENGTHS].filter(Boolean)));

  const createMutation = useMutation({
    mutationFn: async () =>
      createVehicleLead({
        driverName: normalizeSingleLineForSubmit(form.driverName, FIELD_LIMITS.fullName),
        mobile: form.mobile.trim(),
        alternateContact: form.alternateContact.trim() || undefined,
        ownerName: normalizeSingleLineForSubmit(form.ownerName, FIELD_LIMITS.fullName) || undefined,
        ownerContact: form.ownerContact.trim() || undefined,
        isOwnerCumDriver: form.isOwnerCumDriver,
        currentAddress: normalizeSingleLineForSubmit(form.currentAddress, FIELD_LIMITS.address) || undefined,
        permanentAddress: normalizeSingleLineForSubmit(form.permanentAddress, FIELD_LIMITS.address) || undefined,
        preferredRoute: normalizeSingleLineForSubmit(form.preferredRoute, FIELD_LIMITS.location) || undefined,
        vehicleType: form.vehicleType,
        vehicleLength: form.vehicleLength || undefined,
        vehicleCapacity: normalizeSingleLineForSubmit(form.vehicleCapacity, FIELD_LIMITS.vehicleCapacity) || undefined,
        vehicleRegistration: normalizeSingleLineForSubmit(form.vehicleRegistration, FIELD_LIMITS.vehicleNumber) || undefined,
        marketRate: form.marketRate ? Number(form.marketRate) : null,
        remarks: normalizeMultilineForSubmit(form.remarks, FIELD_LIMITS.remarks) || undefined,
      }),
    onMutate: () => {
      setSubmitError(null);
    },
    onSuccess: async (createdLead) => {
      await queryClient.invalidateQueries({ queryKey: ["vehicle-crm", "leads"] });
      router.push(`/vehicle-crm/${createdLead.id}`);
    },
    onError: (error) => {
      setSubmitError(error instanceof Error ? error.message : "Unable to save vehicle");
    },
  });

  const handleSubmit = () => {
    if (!isValid) return;
    void createMutation.mutateAsync();
  };

  if (!user || !VEHICLE_CRM_ALLOWED_ROLES.includes(user.role)) {
    return (
      <div className="space-y-4">
        <PageHeader title="Vehicle CRM" description="Access denied" />
        <Card>
          <CardContent className="p-6">
            <p className="text-sm text-gray-600">
              Vehicle CRM is available only to Vehicle Sales and Admin roles.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Add Vehicle / Driver"
        description="Register a new driver and vehicle for the sourcing pipeline"
      />

      <Card>
        <CardContent className="p-4 sm:p-6">
          <div className="space-y-5">
            {submitError && (
              <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {submitError}
              </div>
            )}
            {/* Driver Info */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="driverName" className="text-sm font-medium">
                  Driver Name <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="driverName"
                  placeholder="e.g. Ramesh Yadav"
                  value={form.driverName}
                  onChange={(e) => updateField("driverName", e.target.value)}
                  className="h-9 text-sm"
                  maxLength={FIELD_LIMITS.fullName}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="mobile" className="text-sm font-medium">
                  Mobile Number (WhatsApp preferred) <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="mobile"
                  placeholder="e.g. +91 98765 43210"
                  value={form.mobile}
                  onChange={(e) => updateField("mobile", e.target.value)}
                  className="h-9 text-sm"
                  inputMode="tel"
                  maxLength={FIELD_LIMITS.phoneDigits + 1}
                />
              </div>
            </div>

            {/* Alternate + Owner Driver */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="alternateContact" className="text-sm font-medium">
                  Alternate Contact Number
                </Label>
                <Input
                  id="alternateContact"
                  placeholder="Optional"
                  value={form.alternateContact}
                  onChange={(e) => updateField("alternateContact", e.target.value)}
                  className="h-9 text-sm"
                  inputMode="tel"
                  maxLength={FIELD_LIMITS.phoneDigits + 1}
                />
              </div>
              <div className="flex items-end pb-1">
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="isOwnerCumDriver"
                    checked={form.isOwnerCumDriver}
                    onCheckedChange={(checked) => updateField("isOwnerCumDriver", !!checked)}
                  />
                  <Label htmlFor="isOwnerCumDriver" className="text-sm font-medium cursor-pointer">
                    Truck Owner Driver
                  </Label>
                </div>
              </div>
            </div>

            {/* Owner Info */}
            {!form.isOwnerCumDriver && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="ownerName" className="text-sm font-medium">Owner Name</Label>
                  <Input
                    id="ownerName"
                    placeholder="e.g. Jagjeet Singh"
                    value={form.ownerName}
                    onChange={(e) => updateField("ownerName", e.target.value)}
                    className="h-9 text-sm"
                    maxLength={FIELD_LIMITS.fullName}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="ownerContact" className="text-sm font-medium">Owner Contact Number</Label>
                  <Input
                    id="ownerContact"
                    placeholder="e.g. +91 98765 43211"
                    value={form.ownerContact}
                    onChange={(e) => updateField("ownerContact", e.target.value)}
                    className="h-9 text-sm"
                    inputMode="tel"
                    maxLength={FIELD_LIMITS.phoneDigits + 1}
                  />
                </div>
              </div>
            )}

            {/* Address */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="currentAddress" className="text-sm font-medium">Current Address</Label>
                <Input
                  id="currentAddress"
                  placeholder="e.g. Bhiwandi, Thane, MH"
                  value={form.currentAddress}
                  onChange={(e) => updateField("currentAddress", e.target.value)}
                  className="h-9 text-sm"
                  maxLength={FIELD_LIMITS.address}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="permanentAddress" className="text-sm font-medium">Permanent Address</Label>
                <Input
                  id="permanentAddress"
                  placeholder="e.g. Azamgarh, UP"
                  value={form.permanentAddress}
                  onChange={(e) => updateField("permanentAddress", e.target.value)}
                  className="h-9 text-sm"
                  maxLength={FIELD_LIMITS.address}
                />
              </div>
            </div>

            {/* Route */}
            <div className="space-y-1.5">
              <Label htmlFor="preferredRoute" className="text-sm font-medium">Preferred Route</Label>
              <Input
                id="preferredRoute"
                placeholder="e.g. Mumbai - Delhi"
                value={form.preferredRoute}
                onChange={(e) => updateField("preferredRoute", e.target.value)}
                className="h-9 text-sm"
                maxLength={FIELD_LIMITS.location}
              />
            </div>

            {/* Vehicle details */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="space-y-1.5">
                <Label className="text-sm font-medium">
                  Vehicle Type <span className="text-red-500">*</span>
                </Label>
                <Select value={form.vehicleType} onValueChange={(v) => updateField("vehicleType", v)}>
                  <SelectTrigger className="w-full h-9 text-sm">
                    <SelectValue placeholder="Select type" />
                  </SelectTrigger>
                  <SelectContent>
                    {vehicleTypeOptions.map((v) => (
                      <SelectItem key={v} value={v}>{v}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {vehicleMasterQuery.isError && (
                  <p className="text-[11px] text-amber-600">Using fallback vehicle types</p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm font-medium">Vehicle Length</Label>
                <Select value={form.vehicleLength} onValueChange={(v) => updateField("vehicleLength", v)}>
                  <SelectTrigger className="w-full h-9 text-sm">
                    <SelectValue placeholder="Select length" />
                  </SelectTrigger>
                  <SelectContent>
                    {vehicleLengthOptions.map((v) => (
                      <SelectItem key={v} value={v}>{v}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {hasMasterOptions && form.vehicleType && vehicleLengthOptions.length === 0 && (
                  <p className="text-[11px] text-gray-500">No configured lengths for this type</p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="vehicleCapacity" className="text-sm font-medium">Vehicle Capacity</Label>
                <Input
                  id="vehicleCapacity"
                  placeholder="e.g. 18 Ton"
                  value={form.vehicleCapacity}
                  onChange={(e) => updateField("vehicleCapacity", e.target.value)}
                  className="h-9 text-sm"
                  maxLength={FIELD_LIMITS.vehicleCapacity}
                />
              </div>
            </div>

            {/* Registration + Market Rate */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="vehicleRegistration" className="text-sm font-medium">Vehicle Registration Number</Label>
                <Input
                  id="vehicleRegistration"
                  placeholder="e.g. MH04AB1234"
                  value={form.vehicleRegistration}
                  onChange={(e) => updateField("vehicleRegistration", e.target.value)}
                  className="h-9 text-sm uppercase"
                  maxLength={FIELD_LIMITS.vehicleNumber}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="marketRate" className="text-sm font-medium">Market Rate (₹)</Label>
                <Input
                  id="marketRate"
                  type="text"
                  inputMode="decimal"
                  placeholder="e.g. 85000"
                  value={form.marketRate}
                  onChange={(e) => updateField("marketRate", e.target.value)}
                  className="h-9 text-sm"
                />
              </div>
            </div>

            {/* Remarks */}
            <div className="space-y-1.5">
              <Label htmlFor="remarks" className="text-sm font-medium">Remarks</Label>
              <Textarea
                id="remarks"
                placeholder="Any additional notes about this driver/vehicle..."
                value={form.remarks}
                onChange={(e) => updateField("remarks", e.target.value)}
                rows={3}
                className="text-sm resize-none"
                maxLength={FIELD_LIMITS.remarks}
              />
              <p className="text-[11px] text-gray-500 text-right">{form.remarks.length}/{FIELD_LIMITS.remarks}</p>
            </div>

            {/* Actions */}
            <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 pt-2">
              <Button
                variant="outline"
                onClick={() => router.push("/vehicle-crm")}
                className="h-9 text-sm"
              >
                <X className="h-4 w-4 mr-1.5" />
                Cancel
              </Button>
              <Button
                onClick={handleSubmit}
                disabled={!isValid || createMutation.isPending}
                className="h-9 text-sm"
              >
                <Save className="h-4 w-4 mr-1.5" />
                {createMutation.isPending ? "Saving..." : "Save Vehicle"}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
