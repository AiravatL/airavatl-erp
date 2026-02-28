"use client";

import { useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/lib/auth/auth-context";
import { getLeasedVehicleById, listVendors, updateLeasedVehicle, updateLeasedVehiclePolicy } from "@/lib/api/leased-vehicles";
import { listTrips } from "@/lib/api/trips";
import { listVehicleMasterOptions } from "@/lib/api/vehicle-master";
import type { LeasedVehicle } from "@/lib/api/leased-vehicles";
import { queryKeys } from "@/lib/query/keys";
import { formatDate } from "@/lib/formatters";
import type { RouteTerrain } from "@/lib/types";
import { FIELD_LIMITS } from "@/lib/validation/client/field-limits";
import { normalizeSingleLineForSubmit, sanitizeSingleLineInput } from "@/lib/validation/client/sanitizers";
import { sanitizeDecimalInput, sanitizePhoneInput } from "@/lib/validation/client/validators";
import {
  ArrowLeft, Truck, Save, Gauge, Loader2,
} from "lucide-react";

const VEHICLE_STATUS_COLORS: Record<string, string> = {
  available: "bg-emerald-50 text-emerald-700",
  on_trip: "bg-blue-50 text-blue-700",
  maintenance: "bg-amber-50 text-amber-700",
};

const TERRAIN_OPTIONS: { value: RouteTerrain; label: string }[] = [
  { value: "plain", label: "Plain" },
  { value: "mixed", label: "Mixed" },
  { value: "hilly", label: "Hilly" },
];

const WRITE_ROLES = ["admin", "super_admin"];

export default function LeasedVehicleDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { user } = useAuth();
  const vehicleId = params.vehicleId as string;
  const canWrite = !!user && WRITE_ROLES.includes(user.role);

  const vehicleQuery = useQuery({
    queryKey: queryKeys.leasedVehicle(vehicleId),
    queryFn: () => getLeasedVehicleById(vehicleId),
    enabled: !!user && !!vehicleId,
  });
  const vehicleTripsQuery = useQuery({
    queryKey: ["trips", "list", "vehicle-history", vehicleId],
    queryFn: () => listTrips({ limit: 500, offset: 0 }),
    enabled: !!user && !!vehicleId,
  });

  if (vehicleQuery.isLoading) {
    return (
      <div className="p-4 sm:p-6">
        <p className="text-sm text-gray-500">Loading vehicle...</p>
      </div>
    );
  }

  if (vehicleQuery.isError || !vehicleQuery.data) {
    return (
      <div className="p-4 sm:p-6">
        <p className="text-sm text-red-600">
          {vehicleQuery.error instanceof Error ? vehicleQuery.error.message : "Leased vehicle not found."}
        </p>
        <Link href="/vendors" className="text-sm text-blue-600 hover:underline">Back to Vendors & Fleet</Link>
      </div>
    );
  }

  const vehicle = vehicleQuery.data;
  const vehicleTrips = (vehicleTripsQuery.data ?? [])
    .filter((trip) => trip.vehicleId === vehicle.id || trip.vehicleNumber === vehicle.number)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  return (
    <div className="p-4 sm:p-6 space-y-4">
      {/* Back nav */}
      <div className="flex items-center gap-2 text-sm">
        <button onClick={() => router.push("/vendors")} className="flex items-center gap-1 text-gray-500 hover:text-gray-700">
          <ArrowLeft className="h-4 w-4" />
          Vendors & Fleet
        </button>
        <span className="text-gray-300">/</span>
        <span className="text-gray-700">{vehicle.number}</span>
      </div>

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-50">
            <Truck className="h-5 w-5 text-indigo-600" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-semibold text-gray-900">{vehicle.number}</h1>
              <Badge variant="outline" className="border-0 text-[10px] bg-indigo-50 text-indigo-700">Leased</Badge>
              <Badge variant="outline" className={`border-0 text-[10px] ${VEHICLE_STATUS_COLORS[vehicle.status]}`}>
                {vehicle.status.replace("_", " ")}
              </Badge>
            </div>
            <p className="text-sm text-gray-500">
              {vehicle.type}
              {vehicle.vehicleLength ? ` \u00b7 ${vehicle.vehicleLength}` : ""}
              {vehicle.vendorName ? ` \u00b7 ${vehicle.vendorName}` : ""}
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Policy Editor */}
        <div className="lg:col-span-2 space-y-4">
          <VehicleMasterEditor key={`${vehicle.id}:${vehicle.updatedAt}`} vehicle={vehicle} canWrite={canWrite} />

          {vehicle.policyId ? (
            <PolicyEditor vehicle={vehicle} canWrite={canWrite} />
          ) : (
            <Card>
              <CardContent className="p-6 text-center">
                <p className="text-sm text-gray-500 mb-3">No policy configured for this vehicle.</p>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Trip History */}
        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium">Recent Trips</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {vehicleTripsQuery.isLoading && (
                <p className="text-xs text-gray-400 py-4 text-center">Loading trip history...</p>
              )}
              {vehicleTrips.length === 0 && (
                <p className="text-xs text-gray-400 py-4 text-center">No trips found for this vehicle.</p>
              )}
              {vehicleTrips.map((trip) => (
                <Link key={trip.id} href={`/trips/${trip.id}`} className="block">
                  <div className="flex items-start justify-between p-2 rounded-md hover:bg-gray-50 transition-colors">
                    <div>
                      <p className="text-sm font-medium text-blue-600">{trip.tripCode}</p>
                      <p className="text-[11px] text-gray-500">{trip.route}</p>
                      <p className="text-[11px] text-gray-400">
                        {trip.scheduleDate ? formatDate(trip.scheduleDate) : "No schedule date"} &middot; {trip.plannedKm || 0} km
                      </p>
                    </div>
                    <Badge variant="outline" className="border-0 text-[10px] bg-gray-100 text-gray-600 shrink-0">
                      {trip.currentStage.replace(/_/g, " ")}
                    </Badge>
                  </div>
                </Link>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function VehicleMasterEditor({ vehicle, canWrite }: { vehicle: LeasedVehicle; canWrite: boolean }) {
  const queryClient = useQueryClient();
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState({
    number: vehicle.number,
    type: vehicle.type,
    vehicleLength: vehicle.vehicleLength ?? "",
    vendorId: vehicle.vendorId ?? "",
    leasedDriverName: vehicle.leasedDriverName ?? "",
    leasedDriverPhone: vehicle.leasedDriverPhone ?? "",
  });

  const vehicleMasterQuery = useQuery({
    queryKey: queryKeys.vehicleMasterOptions,
    queryFn: listVehicleMasterOptions,
    enabled: canWrite,
  });

  const vendorsQuery = useQuery({
    queryKey: queryKeys.vendors({}),
    queryFn: () => listVendors(),
    enabled: canWrite,
  });

  const vehicleTypeOptions = useMemo(() => {
    const fromMaster = vehicleMasterQuery.data?.map((item) => item.name) ?? [];
    return Array.from(new Set([vehicle.type, ...fromMaster].filter(Boolean)));
  }, [vehicle.type, vehicleMasterQuery.data]);

  const vehicleLengthOptions = useMemo(() => {
    const byType = vehicleMasterQuery.data?.find((item) => item.name === form.type)?.lengths ?? [];
    const fromMaster = byType.map((item) => item.value);
    return Array.from(new Set([form.vehicleLength, ...fromMaster].filter(Boolean)));
  }, [vehicleMasterQuery.data, form.type, form.vehicleLength]);

  const vendorOptions = useMemo(() => {
    const base = vendorsQuery.data ?? [];
    if (!vehicle.vendorId || !vehicle.vendorName) return base;
    if (base.some((vendor) => vendor.id === vehicle.vendorId)) return base;
    return [{ id: vehicle.vendorId, name: vehicle.vendorName, contactPhone: null, kycStatus: "pending" }, ...base];
  }, [vendorsQuery.data, vehicle.vendorId, vehicle.vendorName]);

  const updateField = (
    field: "number" | "type" | "vehicleLength" | "vendorId" | "leasedDriverName" | "leasedDriverPhone",
    value: string,
  ) => {
    const nextValue = (() => {
      if (field === "number") {
        return sanitizeSingleLineInput(value.toUpperCase(), FIELD_LIMITS.vehicleNumber);
      }
      if (field === "leasedDriverName") {
        return sanitizeSingleLineInput(value, FIELD_LIMITS.fullName);
      }
      if (field === "leasedDriverPhone") {
        return sanitizePhoneInput(value, FIELD_LIMITS.phoneDigits);
      }
      return value;
    })();
    setForm((prev) => ({ ...prev, [field]: nextValue }));
    setSuccess(false);
  };

  const saveMutation = useMutation({
    mutationFn: () =>
      updateLeasedVehicle(vehicle.id, {
        number: normalizeSingleLineForSubmit(form.number, FIELD_LIMITS.vehicleNumber).toUpperCase(),
        type: form.type.trim(),
        vehicleLength: form.vehicleLength.trim() ? form.vehicleLength.trim() : null,
        vendorId: form.vendorId || null,
        leasedDriverName: normalizeSingleLineForSubmit(form.leasedDriverName, FIELD_LIMITS.fullName),
        leasedDriverPhone: form.leasedDriverPhone.trim(),
      }),
    onSuccess: (updated) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.leasedVehicle(vehicle.id) });
      queryClient.invalidateQueries({ queryKey: ["leased-vehicles"] });
      queryClient.invalidateQueries({ queryKey: ["fleet", "vehicles"] });
      queryClient.invalidateQueries({ queryKey: ["fleet", "vendors"] });
      setForm({
        number: updated.number,
        type: updated.type,
        vehicleLength: updated.vehicleLength ?? "",
        vendorId: updated.vendorId ?? "",
        leasedDriverName: updated.leasedDriverName ?? "",
        leasedDriverPhone: updated.leasedDriverPhone ?? "",
      });
      setSuccess(true);
      setError("");
    },
    onError: (err) => {
      setError(err instanceof Error ? err.message : "Failed to update vehicle details");
      setSuccess(false);
    },
  });

  const handleReset = () => {
    setForm({
      number: vehicle.number,
      type: vehicle.type,
      vehicleLength: vehicle.vehicleLength ?? "",
      vendorId: vehicle.vendorId ?? "",
      leasedDriverName: vehicle.leasedDriverName ?? "",
      leasedDriverPhone: vehicle.leasedDriverPhone ?? "",
    });
    setSuccess(false);
    setError("");
  };

  const handleSave = () => {
    const nextNumber = form.number.trim().toUpperCase();
    const nextType = form.type.trim();
    const nextVehicleLength = form.vehicleLength.trim() || null;
    const nextVendorId = form.vendorId || null;
    const nextLeasedDriverName = normalizeSingleLineForSubmit(form.leasedDriverName, FIELD_LIMITS.fullName);
    const nextLeasedDriverPhone = form.leasedDriverPhone.trim();

    if (!nextNumber || !nextType || !nextLeasedDriverName || nextLeasedDriverPhone.replace(/\D/g, "").length < 10) {
      setError("Vehicle number, type, leased driver name and valid phone are required");
      return;
    }

    if (vehicleLengthOptions.length > 0 && !nextVehicleLength) {
      setError("Vehicle length is required for the selected type");
      return;
    }

    if (
      nextNumber === vehicle.number &&
      nextType === vehicle.type &&
      nextVehicleLength === (vehicle.vehicleLength ?? null) &&
      nextVendorId === (vehicle.vendorId ?? null) &&
      nextLeasedDriverName === (vehicle.leasedDriverName ?? "") &&
      nextLeasedDriverPhone === (vehicle.leasedDriverPhone ?? "")
    ) {
      setError("");
      setSuccess(true);
      return;
    }

    setError("");
    saveMutation.mutate();
  };

  return (
    <>
      {error && (
        <div className="rounded-md bg-red-50 p-3">
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}
      {success && (
        <div className="rounded-md bg-emerald-50 p-3">
          <p className="text-sm text-emerald-700">Vehicle details saved successfully.</p>
        </div>
      )}

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium">Vehicle Master</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs text-gray-600">Vehicle Number</Label>
              <Input
                value={form.number}
                disabled={!canWrite}
                className="h-9 text-sm uppercase"
                onChange={(event) => updateField("number", event.target.value.toUpperCase())}
                maxLength={FIELD_LIMITS.vehicleNumber}
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs text-gray-600">Vehicle Type</Label>
              <Select
                value={form.type}
                onValueChange={(value) => {
                  const selected = vehicleMasterQuery.data?.find((item) => item.name === value) ?? null;
                  const nextLengths = selected?.lengths?.map((item) => item.value) ?? [];
                  const nextLength = nextLengths.includes(form.vehicleLength) ? form.vehicleLength : "";

                  setForm((prev) => ({
                    ...prev,
                    type: value,
                    vehicleLength: nextLength,
                  }));
                  setSuccess(false);
                }}
                disabled={!canWrite}
              >
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue placeholder="Select vehicle type" />
                </SelectTrigger>
                <SelectContent>
                  {vehicleTypeOptions.map((type) => (
                    <SelectItem key={type} value={type}>
                      {type}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {canWrite && vehicleMasterQuery.isLoading && (
                <p className="text-[11px] text-gray-500">Loading vehicle types...</p>
              )}
              {canWrite && !vehicleMasterQuery.isLoading && vehicleTypeOptions.length === 0 && (
                <p className="text-[11px] text-amber-600">
                  No vehicle types configured. Add vehicle types in Administration &gt; Vehicle Master.
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs text-gray-600">
                Vehicle Length {vehicleLengthOptions.length > 0 ? <span className="text-red-500">*</span> : null}
              </Label>
              <Select
                value={form.vehicleLength || "_none"}
                onValueChange={(value) => updateField("vehicleLength", value === "_none" ? "" : value)}
                disabled={!canWrite || !form.type}
              >
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue placeholder={form.type ? "Select vehicle length" : "Select type first"} />
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
              <Label className="text-xs text-gray-600">Vendor</Label>
              <Select
                value={form.vendorId || "_none"}
                onValueChange={(value) => updateField("vendorId", value === "_none" ? "" : value)}
                disabled={!canWrite}
              >
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue placeholder="Select vendor (optional)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="_none">None</SelectItem>
                  {vendorOptions.map((vendor) => (
                    <SelectItem key={vendor.id} value={vendor.id}>
                      {vendor.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs text-gray-600">Leased Driver Name</Label>
              <Input
                value={form.leasedDriverName}
                disabled={!canWrite}
                className="h-9 text-sm"
                onChange={(event) => updateField("leasedDriverName", event.target.value)}
                maxLength={FIELD_LIMITS.fullName}
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs text-gray-600">Leased Driver Phone</Label>
              <Input
                value={form.leasedDriverPhone}
                disabled={!canWrite}
                className="h-9 text-sm"
                inputMode="tel"
                onChange={(event) => updateField("leasedDriverPhone", event.target.value)}
                maxLength={FIELD_LIMITS.phoneDigits + 1}
              />
            </div>

          </div>

          {canWrite && (
            <div className="flex justify-end gap-2">
              <Button size="sm" variant="outline" className="h-8 text-xs" onClick={handleReset} disabled={saveMutation.isPending}>
                Reset
              </Button>
              <Button size="sm" className="h-8 text-xs gap-1.5" onClick={handleSave} disabled={saveMutation.isPending}>
                {saveMutation.isPending ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Save className="h-3.5 w-3.5" />
                )}
                Save Master
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </>
  );
}

function PolicyEditor({ vehicle, canWrite }: { vehicle: LeasedVehicle; canWrite: boolean }) {
  const queryClient = useQueryClient();
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");

  const [form, setForm] = useState({
    driverDaPerDay: String(vehicle.driverDaPerDay),
    vehicleRentPerDay: String(vehicle.vehicleRentPerDay),
    mileageMin: String(vehicle.mileageMin),
    mileageMax: String(vehicle.mileageMax),
    defaultTerrain: vehicle.defaultTerrain as string,
    fuelVarianceThresholdPercent: String(vehicle.fuelVarianceThresholdPercent),
    unofficialGateCap: vehicle.unofficialGateCap != null ? String(vehicle.unofficialGateCap) : "",
    dalaKharchaCap: vehicle.dalaKharchaCap != null ? String(vehicle.dalaKharchaCap) : "",
    parkingCap: vehicle.parkingCap != null ? String(vehicle.parkingCap) : "",
  });

  const updateField = (field: string, value: string) => {
    const nextValue = (() => {
      switch (field) {
        case "driverDaPerDay":
        case "vehicleRentPerDay":
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
    setSuccess(false);
  };

  const saveMutation = useMutation({
    mutationFn: () =>
      updateLeasedVehiclePolicy(vehicle.id, {
        driverDaPerDay: Number(form.driverDaPerDay),
        vehicleRentPerDay: Number(form.vehicleRentPerDay),
        mileageMin: Number(form.mileageMin),
        mileageMax: Number(form.mileageMax),
        defaultTerrain: form.defaultTerrain as RouteTerrain,
        fuelVarianceThresholdPercent: Number(form.fuelVarianceThresholdPercent),
        unofficialGateCap: form.unofficialGateCap ? Number(form.unofficialGateCap) : null,
        dalaKharchaCap: form.dalaKharchaCap ? Number(form.dalaKharchaCap) : null,
        parkingCap: form.parkingCap ? Number(form.parkingCap) : null,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["leased-vehicles"] });
      setSuccess(true);
      setError("");
    },
    onError: (err) => {
      setError(err instanceof Error ? err.message : "Failed to save policy");
      setSuccess(false);
    },
  });

  const handleSave = () => {
    const min = Number(form.mileageMin);
    const max = Number(form.mileageMax);
    if (min > max) {
      setError("Mileage min must be less than or equal to mileage max");
      return;
    }
    setError("");
    saveMutation.mutate();
  };

  return (
    <>
      {error && (
        <div className="rounded-md bg-red-50 p-3">
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}
      {success && (
        <div className="rounded-md bg-emerald-50 p-3">
          <p className="text-sm text-emerald-700">Policy saved successfully.</p>
        </div>
      )}

      {/* Rates */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium">Driver & Vehicle Rates</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <PolicyField label="Driver DA per Day" value={form.driverDaPerDay} prefix="₹" disabled={!canWrite} onChange={(v) => updateField("driverDaPerDay", v)} />
            <PolicyField label="Vehicle Rent per Day" value={form.vehicleRentPerDay} prefix="₹" disabled={!canWrite} onChange={(v) => updateField("vehicleRentPerDay", v)} />
          </div>
        </CardContent>
      </Card>

      {/* Mileage & Fuel */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <Gauge className="h-4 w-4 text-gray-500" />
            <CardTitle className="text-sm font-medium">Mileage & Fuel Policy</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <PolicyField label="Mileage Min (km/l)" value={form.mileageMin} disabled={!canWrite} onChange={(v) => updateField("mileageMin", v)} />
            <PolicyField label="Mileage Max (km/l)" value={form.mileageMax} disabled={!canWrite} onChange={(v) => updateField("mileageMax", v)} />
            <div className="space-y-1.5">
              <Label className="text-xs text-gray-600">Default Terrain</Label>
              <Select value={form.defaultTerrain} onValueChange={(v) => updateField("defaultTerrain", v)} disabled={!canWrite}>
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TERRAIN_OPTIONS.map((t) => (
                    <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <PolicyField label="Fuel Variance Threshold" value={form.fuelVarianceThresholdPercent} suffix="%" disabled={!canWrite} onChange={(v) => updateField("fuelVarianceThresholdPercent", v)} />
          <div className="bg-blue-50 rounded-md p-3">
            <p className="text-xs text-blue-700">
              Expected fuel range: {form.mileageMin}-{form.mileageMax} km/l.
              Trips outside ±{form.fuelVarianceThresholdPercent}% of expected will be flagged.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Expense Caps */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium">Expense Caps</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <PolicyField label="Unofficial Gate Cap" value={form.unofficialGateCap} prefix="₹" disabled={!canWrite} onChange={(v) => updateField("unofficialGateCap", v)} />
            <PolicyField label="Dala Kharcha Cap" value={form.dalaKharchaCap} prefix="₹" disabled={!canWrite} onChange={(v) => updateField("dalaKharchaCap", v)} />
            <PolicyField label="Parking Cap" value={form.parkingCap} prefix="₹" disabled={!canWrite} onChange={(v) => updateField("parkingCap", v)} />
          </div>
          <div className="bg-amber-50 rounded-md p-3">
            <p className="text-xs text-amber-700">
              Expenses exceeding these caps require approval escalation.
            </p>
          </div>
        </CardContent>
      </Card>

      {canWrite && (
        <div className="flex justify-end">
          <Button size="sm" className="h-8 text-xs gap-1.5" onClick={handleSave} disabled={saveMutation.isPending}>
            {saveMutation.isPending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Save className="h-3.5 w-3.5" />
            )}
            Save Policy
          </Button>
        </div>
      )}
    </>
  );
}

function PolicyField({ label, value, prefix, suffix, disabled, onChange }: {
  label: string;
  value: string;
  prefix?: string;
  suffix?: string;
  disabled?: boolean;
  onChange?: (value: string) => void;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs text-gray-600">{label}</Label>
      <div className="flex items-center gap-1.5">
        {prefix && <span className="text-sm text-gray-500">{prefix}</span>}
        <Input
          className="h-9 text-sm"
          type="text"
          inputMode="decimal"
          value={value}
          disabled={disabled}
          onChange={(e) => onChange?.(e.target.value)}
        />
        {suffix && <span className="text-sm text-gray-500">{suffix}</span>}
      </div>
    </div>
  );
}
