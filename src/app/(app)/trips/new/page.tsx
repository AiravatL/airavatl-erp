"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PageHeader } from "@/components/shared/page-header";
import { useAuth } from "@/lib/auth/auth-context";
import { listCustomers } from "@/lib/api/customers";
import { listVehicleMasterOptions } from "@/lib/api/vehicle-master";
import { createTripRequest } from "@/lib/api/trips";
import { queryKeys } from "@/lib/query/keys";
import { FIELD_LIMITS } from "@/lib/validation/client/field-limits";
import {
  normalizeMultilineForSubmit,
  normalizeSingleLineForSubmit,
  sanitizeMultilineInput,
  sanitizeSingleLineInput,
} from "@/lib/validation/client/sanitizers";
import { sanitizeDecimalInput, sanitizeIntegerInput } from "@/lib/validation/client/validators";
import { ArrowLeft, Loader2 } from "lucide-react";

export default function NewTripRequestPage() {
  const router = useRouter();
  const { user } = useAuth();

  const [customerId, setCustomerId] = useState("");
  const [pickupLocation, setPickupLocation] = useState("");
  const [dropLocation, setDropLocation] = useState("");
  const [vehicleType, setVehicleType] = useState("");
  const [vehicleLength, setVehicleLength] = useState("");
  const [weightEstimate, setWeightEstimate] = useState("");
  const [plannedKm, setPlannedKm] = useState("");
  const [scheduleDate, setScheduleDate] = useState("");
  const [tripAmount, setTripAmount] = useState("");
  const [internalNotes, setInternalNotes] = useState("");

  const customersQuery = useQuery({
    queryKey: queryKeys.customers({
      status: "active",
      ownerId: user?.role === "sales_consigner" ? user.id : undefined,
    }),
    queryFn: () =>
      listCustomers({
        status: "active",
        ownerId: user?.role === "sales_consigner" ? user.id : undefined,
        limit: 500,
      }),
    enabled: !!user,
  });

  const vehicleTypesQuery = useQuery({
    queryKey: queryKeys.vehicleMasterOptions,
    queryFn: listVehicleMasterOptions,
    enabled: !!user,
  });

  const createMutation = useMutation({
    mutationFn: () =>
      createTripRequest({
        customerId,
        pickupLocation: normalizeSingleLineForSubmit(pickupLocation, FIELD_LIMITS.location),
        dropLocation: normalizeSingleLineForSubmit(dropLocation, FIELD_LIMITS.location),
        vehicleType,
        vehicleLength: vehicleLength || undefined,
        weightEstimate: weightEstimate ? Number(weightEstimate) : null,
        plannedKm: plannedKm ? Number(plannedKm) : null,
        scheduleDate,
        tripAmount: tripAmount ? Number(tripAmount) : null,
        internalNotes: normalizeMultilineForSubmit(internalNotes, FIELD_LIMITS.notes) || undefined,
      }),
    onSuccess: (data) => {
      router.push(`/trips/${data.tripId}`);
    },
  });

  const customers = customersQuery.data ?? [];
  const vehicleTypes = (vehicleTypesQuery.data ?? []).filter((vt) => vt.active);
  const vehicleTypeOptions = useMemo(() => vehicleTypes.map((vt) => vt.name), [vehicleTypes]);
  const selectedType = useMemo(
    () => vehicleTypes.find((type) => type.name === vehicleType) ?? null,
    [vehicleTypes, vehicleType],
  );
  const selectedTypeLengthOptions = useMemo(
    () => (selectedType?.lengths ?? []).filter((length) => length.active).map((length) => length.value),
    [selectedType],
  );
  const vehicleLengthOptions = selectedTypeLengthOptions;
  const isVehicleTypeValid = vehicleTypeOptions.includes(vehicleType);
  const isVehicleLengthValid = !vehicleLength || vehicleLengthOptions.includes(vehicleLength);
  const canSubmit =
    customerId &&
    normalizeSingleLineForSubmit(pickupLocation, FIELD_LIMITS.location) &&
    normalizeSingleLineForSubmit(dropLocation, FIELD_LIMITS.location) &&
    isVehicleTypeValid &&
    isVehicleLengthValid &&
    scheduleDate;

  const handleVehicleTypeChange = (nextType: string) => {
    setVehicleType(nextType);
    const nextTypeRecord = vehicleTypes.find((type) => type.name === nextType) ?? null;
    const nextTypeLengths = (nextTypeRecord?.lengths ?? [])
      .filter((length) => length.active)
      .map((length) => length.value);
    setVehicleLength((prev) => (nextTypeLengths.includes(prev) ? prev : ""));
  };

  return (
    <div className="p-4 sm:p-6 space-y-4 max-w-2xl">
      <div className="flex items-center gap-2">
        <Link href="/trips" className="text-gray-400 hover:text-gray-600">
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <PageHeader title="New Trip Request" />
      </div>

      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="text-sm font-medium">Trip Request Details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label className="text-xs text-gray-600">Customer *</Label>
            <Select value={customerId} onValueChange={setCustomerId}>
              <SelectTrigger className="h-9 text-sm">
                <SelectValue placeholder="Select customer" />
              </SelectTrigger>
              <SelectContent>
                {customers.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="text-xs text-gray-600">Pickup Location *</Label>
                <Input
                  className="h-9 text-sm"
                  placeholder="e.g., Jamshedpur, JH"
                  value={pickupLocation}
                  onChange={(e) =>
                    setPickupLocation(sanitizeSingleLineInput(e.target.value, FIELD_LIMITS.location))
                  }
                  maxLength={FIELD_LIMITS.location}
                />
              </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-gray-600">Drop Location *</Label>
                <Input
                  className="h-9 text-sm"
                  placeholder="e.g., Mumbai, MH"
                  value={dropLocation}
                  onChange={(e) =>
                    setDropLocation(sanitizeSingleLineInput(e.target.value, FIELD_LIMITS.location))
                  }
                  maxLength={FIELD_LIMITS.location}
                />
              </div>
            </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="text-xs text-gray-600">Vehicle Type *</Label>
              <Select value={vehicleType} onValueChange={handleVehicleTypeChange}>
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue placeholder="Select type" />
                </SelectTrigger>
                <SelectContent>
                  {vehicleTypeOptions.map((type) => (
                    <SelectItem key={type} value={type}>
                      {type}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {vehicleTypesQuery.isLoading && (
                <p className="text-[11px] text-gray-500">Loading vehicle types...</p>
              )}
              {!vehicleTypesQuery.isLoading && vehicleTypeOptions.length === 0 && (
                <p className="text-[11px] text-amber-600">
                  No active vehicle types found in Vehicle Master.
                </p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-gray-600">
                Vehicle Length
              </Label>
              <Select
                value={vehicleLength || "_none"}
                onValueChange={(value) => setVehicleLength(value === "_none" ? "" : value)}
                disabled={!vehicleType || vehicleLengthOptions.length === 0}
              >
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue
                    placeholder={!vehicleType ? "Select vehicle type first" : "Select length"}
                  />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="_none">No length selected</SelectItem>
                  {vehicleLengthOptions.map((lengthValue) => (
                    <SelectItem key={lengthValue} value={lengthValue}>
                      {lengthValue}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {vehicleType && vehicleLengthOptions.length === 0 && (
                <p className="text-[11px] text-gray-500">
                  No active lengths configured for this type in Vehicle Master.
                </p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="text-xs text-gray-600">Weight Estimate (MT)</Label>
              <Input
                className="h-9 text-sm"
                type="text"
                inputMode="decimal"
                placeholder="e.g., 18"
                value={weightEstimate}
                onChange={(e) =>
                  setWeightEstimate(
                    sanitizeDecimalInput(e.target.value, {
                      maxIntegerDigits: FIELD_LIMITS.weightIntegerDigits,
                      maxFractionDigits: FIELD_LIMITS.weightFractionDigits,
                    }),
                  )
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-gray-600">Planned KM</Label>
              <Input
                className="h-9 text-sm"
                type="text"
                inputMode="numeric"
                placeholder="e.g., 1650"
                value={plannedKm}
                onChange={(e) => setPlannedKm(sanitizeIntegerInput(e.target.value, FIELD_LIMITS.distanceDigits))}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="text-xs text-gray-600">Schedule Date *</Label>
              <Input
                className="h-9 text-sm"
                type="date"
                value={scheduleDate}
                onChange={(e) => setScheduleDate(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs text-gray-600">Trip Amount</Label>
            <Input
              className="h-9 text-sm"
              type="text"
              inputMode="decimal"
              placeholder="e.g., 50000"
              value={tripAmount}
              onChange={(e) =>
                setTripAmount(
                  sanitizeDecimalInput(e.target.value, {
                    maxIntegerDigits: FIELD_LIMITS.currencyDigits,
                    maxFractionDigits: 2,
                  }),
                )
              }
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs text-gray-600">Internal Notes</Label>
            <Textarea
              className="text-sm resize-none"
              rows={3}
              placeholder="Any additional notes..."
              value={internalNotes}
              onChange={(e) => setInternalNotes(sanitizeMultilineInput(e.target.value, FIELD_LIMITS.notes))}
              maxLength={FIELD_LIMITS.notes}
            />
            <p className="text-[11px] text-gray-500 text-right">{internalNotes.length}/{FIELD_LIMITS.notes}</p>
          </div>

          {createMutation.isError && (
            <p className="text-sm text-red-600">
              {createMutation.error instanceof Error ? createMutation.error.message : "Failed to create trip request"}
            </p>
          )}

          <div className="flex gap-2 pt-2">
            <Button
              size="sm"
              className="h-8 text-xs"
              onClick={() => createMutation.mutate()}
              disabled={!canSubmit || createMutation.isPending}
            >
              {createMutation.isPending && <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />}
              Submit Request
            </Button>
            <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => router.back()}>
              Cancel
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
