"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { createLeasedVehicle, listVendors } from "@/lib/api/leased-vehicles";
import { listVehicleMasterOptions } from "@/lib/api/vehicle-master";
import { queryKeys } from "@/lib/query/keys";
import type { RouteTerrain } from "@/lib/types";
import { FIELD_LIMITS } from "@/lib/validation/client/field-limits";
import { normalizeSingleLineForSubmit, sanitizeSingleLineInput } from "@/lib/validation/client/sanitizers";
import { sanitizeDecimalInput, sanitizePhoneInput } from "@/lib/validation/client/validators";
import { Save, X, Loader2 } from "lucide-react";

const TERRAIN_OPTIONS: { value: RouteTerrain; label: string }[] = [
  { value: "plain", label: "Plain" },
  { value: "mixed", label: "Mixed" },
  { value: "hilly", label: "Hilly" },
];

export default function AddLeasedVehiclePage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [error, setError] = useState("");

  const [form, setForm] = useState({
    number: "",
    type: "",
    vehicleLength: "",
    vendorId: "",
    leasedDriverName: "",
    leasedDriverPhone: "",
    driverDaPerDay: "1000",
    vehicleRentPerDay: "3333",
    mileageMin: "3.0",
    mileageMax: "5.0",
    defaultTerrain: "plain" as RouteTerrain,
    fuelVarianceThresholdPercent: "10",
    unofficialGateCap: "1500",
    dalaKharchaCap: "500",
    parkingCap: "300",
  });

  const updateField = (field: string, value: string) => {
    const nextValue = (() => {
      switch (field) {
        case "number":
          return sanitizeSingleLineInput(value.toUpperCase(), FIELD_LIMITS.vehicleNumber);
        case "leasedDriverName":
          return sanitizeSingleLineInput(value, FIELD_LIMITS.fullName);
        case "leasedDriverPhone":
          return sanitizePhoneInput(value, FIELD_LIMITS.phoneDigits);
        case "driverDaPerDay":
        case "vehicleRentPerDay":
        case "creditLimit":
        case "unofficialGateCap":
        case "dalaKharchaCap":
        case "parkingCap":
          return sanitizeDecimalInput(value, {
            maxIntegerDigits: FIELD_LIMITS.currencyDigits,
            maxFractionDigits: 2,
          });
        case "mileageMin":
        case "mileageMax":
          return sanitizeDecimalInput(value, {
            maxIntegerDigits: FIELD_LIMITS.mileageIntegerDigits,
            maxFractionDigits: FIELD_LIMITS.mileageFractionDigits,
          });
        case "fuelVarianceThresholdPercent":
          return sanitizeDecimalInput(value, {
            maxIntegerDigits: FIELD_LIMITS.percentDigits,
            maxFractionDigits: 2,
          });
        default:
          return value;
      }
    })();
    setForm((prev) => ({ ...prev, [field]: nextValue }));
  };

  const vendorsQuery = useQuery({
    queryKey: queryKeys.vendors({}),
    queryFn: () => listVendors(),
  });

  const vehicleMasterQuery = useQuery({
    queryKey: queryKeys.vehicleMasterOptions,
    queryFn: listVehicleMasterOptions,
  });

  const vehicleTypeOptions = vehicleMasterQuery.data?.map((type) => type.name) ?? [];
  const selectedType = vehicleMasterQuery.data?.find((type) => type.name === form.type) ?? null;
  const vehicleLengthOptions = selectedType?.lengths?.map((length) => length.value) ?? [];

  const isValid =
    form.number.trim() &&
    form.type &&
    normalizeSingleLineForSubmit(form.leasedDriverName, FIELD_LIMITS.fullName) &&
    form.leasedDriverPhone.replace(/\D/g, "").length >= 10;

  const createMutation = useMutation({
    mutationFn: () =>
      createLeasedVehicle({
        number: normalizeSingleLineForSubmit(form.number, FIELD_LIMITS.vehicleNumber).toUpperCase(),
        type: form.type,
        vehicleLength: form.vehicleLength || null,
        vendorId: form.vendorId || null,
        leasedDriverName: normalizeSingleLineForSubmit(form.leasedDriverName, FIELD_LIMITS.fullName),
        leasedDriverPhone: form.leasedDriverPhone.trim(),
        driverDaPerDay: Number(form.driverDaPerDay),
        vehicleRentPerDay: Number(form.vehicleRentPerDay),
        mileageMin: Number(form.mileageMin),
        mileageMax: Number(form.mileageMax),
        defaultTerrain: form.defaultTerrain,
        fuelVarianceThresholdPercent: Number(form.fuelVarianceThresholdPercent),
        unofficialGateCap: form.unofficialGateCap ? Number(form.unofficialGateCap) : null,
        dalaKharchaCap: form.dalaKharchaCap ? Number(form.dalaKharchaCap) : null,
        parkingCap: form.parkingCap ? Number(form.parkingCap) : null,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["leased-vehicles"] });
      router.push("/vendors");
    },
    onError: (err) => {
      setError(err instanceof Error ? err.message : "Failed to create leased vehicle");
    },
  });

  const handleSubmit = () => {
    if (!isValid) return;
    if (vehicleLengthOptions.length > 0 && !form.vehicleLength) {
      setError("Vehicle length is required for the selected type");
      return;
    }
    const min = Number(form.mileageMin);
    const max = Number(form.mileageMax);
    if (min > max) {
      setError("Mileage min must be less than or equal to mileage max");
      return;
    }
    setError("");
    createMutation.mutate();
  };

  return (
    <div className="p-4 sm:p-6 space-y-4">
      <PageHeader
        title="Add Leased Vehicle"
        description="Register a new leased vehicle with its policy configuration"
      />

      {error && (
        <div className="rounded-md bg-red-50 p-3">
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {/* Vehicle Info */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium">Vehicle Info</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="number" className="text-sm font-medium">
                Vehicle Number <span className="text-red-500">*</span>
              </Label>
                <Input
                  id="number"
                  placeholder="e.g. MH04AB1234"
                  value={form.number}
                  onChange={(e) => updateField("number", e.target.value.toUpperCase())}
                  className="h-9 text-sm uppercase"
                  maxLength={FIELD_LIMITS.vehicleNumber}
                />
              </div>
            <div className="space-y-1.5">
              <Label className="text-sm font-medium">
                Vehicle Type <span className="text-red-500">*</span>
              </Label>
              <Select
                value={form.type}
                onValueChange={(v) => {
                  const nextType = v;
                  const nextTypeMeta = vehicleMasterQuery.data?.find((item) => item.name === nextType) ?? null;
                  const nextLengths = nextTypeMeta?.lengths?.map((length) => length.value) ?? [];
                  const nextLengthValue =
                    nextLengths.includes(form.vehicleLength) ? form.vehicleLength : "";

                  setForm((prev) => ({
                    ...prev,
                    type: nextType,
                    vehicleLength: nextLengthValue,
                  }));
                }}
              >
                <SelectTrigger className="w-full h-9 text-sm">
                  <SelectValue placeholder="Select type" />
                </SelectTrigger>
                <SelectContent>
                  {vehicleTypeOptions.map((v) => (
                    <SelectItem key={v} value={v}>{v}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {vehicleMasterQuery.isLoading && (
                <p className="text-[11px] text-gray-500">Loading vehicle types...</p>
              )}
              {!vehicleMasterQuery.isLoading && vehicleTypeOptions.length === 0 && (
                <p className="text-[11px] text-amber-600">
                  No vehicle types configured. Add types in Administration &gt; Vehicle Master.
                </p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm font-medium">
                Vehicle Length {vehicleLengthOptions.length > 0 ? <span className="text-red-500">*</span> : null}
              </Label>
              <Select
                value={form.vehicleLength || "_none"}
                onValueChange={(v) => updateField("vehicleLength", v === "_none" ? "" : v)}
                disabled={!form.type}
              >
                <SelectTrigger className="w-full h-9 text-sm">
                  <SelectValue placeholder={form.type ? "Select length" : "Select type first"} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="_none">None</SelectItem>
                  {vehicleLengthOptions.map((length) => (
                    <SelectItem key={length} value={length}>
                      {length}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm font-medium">Vendor (optional)</Label>
              <Select value={form.vendorId} onValueChange={(v) => updateField("vendorId", v === "_none" ? "" : v)}>
                <SelectTrigger className="w-full h-9 text-sm">
                  <SelectValue placeholder="Select vendor" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="_none">None</SelectItem>
                  {(vendorsQuery.data ?? []).map((v) => (
                    <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="leasedDriverName" className="text-sm font-medium">
                Driver Name <span className="text-red-500">*</span>
              </Label>
              <Input
                id="leasedDriverName"
                placeholder="e.g. Ramesh Kumar"
                value={form.leasedDriverName}
                onChange={(e) => updateField("leasedDriverName", e.target.value)}
                className="h-9 text-sm"
                maxLength={FIELD_LIMITS.fullName}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="leasedDriverPhone" className="text-sm font-medium">
                Driver Phone <span className="text-red-500">*</span>
              </Label>
              <Input
                id="leasedDriverPhone"
                placeholder="e.g. +91 9876543210"
                value={form.leasedDriverPhone}
                onChange={(e) => updateField("leasedDriverPhone", e.target.value)}
                className="h-9 text-sm"
                inputMode="tel"
                maxLength={FIELD_LIMITS.phoneDigits + 1}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Policy Configuration */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium">Policy Configuration</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          {/* Rates */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="driverDaPerDay" className="text-sm font-medium">Driver DA per Day</Label>
              <div className="flex items-center gap-1.5">
                <span className="text-sm text-gray-500">₹</span>
                <Input
                  id="driverDaPerDay"
                  type="text"
                  inputMode="decimal"
                  value={form.driverDaPerDay}
                  onChange={(e) => updateField("driverDaPerDay", e.target.value)}
                  className="h-9 text-sm"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="vehicleRentPerDay" className="text-sm font-medium">Vehicle Rent per Day</Label>
              <div className="flex items-center gap-1.5">
                <span className="text-sm text-gray-500">₹</span>
                <Input
                  id="vehicleRentPerDay"
                  type="text"
                  inputMode="decimal"
                  value={form.vehicleRentPerDay}
                  onChange={(e) => updateField("vehicleRentPerDay", e.target.value)}
                  className="h-9 text-sm"
                />
              </div>
            </div>
          </div>

          {/* Mileage & Fuel */}
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="mileageMin" className="text-sm font-medium">Mileage Min (km/l)</Label>
              <Input
                id="mileageMin"
                type="text"
                inputMode="decimal"
                value={form.mileageMin}
                onChange={(e) => updateField("mileageMin", e.target.value)}
                className="h-9 text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="mileageMax" className="text-sm font-medium">Mileage Max (km/l)</Label>
              <Input
                id="mileageMax"
                type="text"
                inputMode="decimal"
                value={form.mileageMax}
                onChange={(e) => updateField("mileageMax", e.target.value)}
                className="h-9 text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm font-medium">Default Terrain</Label>
              <Select value={form.defaultTerrain} onValueChange={(v) => updateField("defaultTerrain", v)}>
                <SelectTrigger className="w-full h-9 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TERRAIN_OPTIONS.map((t) => (
                    <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="fuelVariance" className="text-sm font-medium">Fuel Variance (%)</Label>
              <Input
                id="fuelVariance"
                type="text"
                inputMode="decimal"
                value={form.fuelVarianceThresholdPercent}
                onChange={(e) => updateField("fuelVarianceThresholdPercent", e.target.value)}
                className="h-9 text-sm"
              />
            </div>
          </div>

          {/* Expense Caps */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="unofficialGateCap" className="text-sm font-medium">Unofficial Gate Cap</Label>
              <div className="flex items-center gap-1.5">
                <span className="text-sm text-gray-500">₹</span>
                <Input
                  id="unofficialGateCap"
                  type="text"
                  inputMode="decimal"
                  value={form.unofficialGateCap}
                  onChange={(e) => updateField("unofficialGateCap", e.target.value)}
                  className="h-9 text-sm"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="dalaKharchaCap" className="text-sm font-medium">Dala Kharcha Cap</Label>
              <div className="flex items-center gap-1.5">
                <span className="text-sm text-gray-500">₹</span>
                <Input
                  id="dalaKharchaCap"
                  type="text"
                  inputMode="decimal"
                  value={form.dalaKharchaCap}
                  onChange={(e) => updateField("dalaKharchaCap", e.target.value)}
                  className="h-9 text-sm"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="parkingCap" className="text-sm font-medium">Parking Cap</Label>
              <div className="flex items-center gap-1.5">
                <span className="text-sm text-gray-500">₹</span>
                <Input
                  id="parkingCap"
                  type="text"
                  inputMode="decimal"
                  value={form.parkingCap}
                  onChange={(e) => updateField("parkingCap", e.target.value)}
                  className="h-9 text-sm"
                />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Actions */}
      <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
        <Button
          variant="outline"
          onClick={() => router.push("/vendors")}
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
          Add Vehicle
        </Button>
      </div>
    </div>
  );
}
