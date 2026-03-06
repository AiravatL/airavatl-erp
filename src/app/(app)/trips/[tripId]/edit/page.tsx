"use client";

import { use, useState, useEffect, useMemo } from "react";
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
import { getTripById, updateTripRequest } from "@/lib/api/trips";
import { listVehicleMasterOptions } from "@/lib/api/vehicle-master";
import { queryKeys } from "@/lib/query/keys";
import { FIELD_LIMITS } from "@/lib/validation/client/field-limits";
import {
  normalizeMultilineForSubmit,
  normalizeSingleLineForSubmit,
  sanitizeMultilineInput,
  sanitizeSingleLineInput,
} from "@/lib/validation/client/sanitizers";
import { sanitizeDecimalInput } from "@/lib/validation/client/validators";
import { ArrowLeft, Loader2, Plus, Trash2 } from "lucide-react";

export default function EditTripRequestPage({ params }: { params: Promise<{ tripId: string }> }) {
  const { tripId } = use(params);
  const router = useRouter();
  const { user } = useAuth();

  const [pickupPoints, setPickupPoints] = useState<string[]>([""]);
  const [dropPoints, setDropPoints] = useState<string[]>([""]);
  const [vehicleType, setVehicleType] = useState("");
  const [vehicleLength, setVehicleLength] = useState("");
  const [weightEstimate, setWeightEstimate] = useState("");
  const [materialDetails, setMaterialDetails] = useState("");
  const [materialLength, setMaterialLength] = useState("");
  const [scheduleDate, setScheduleDate] = useState("");
  const [tripAmount, setTripAmount] = useState("");
  const [internalNotes, setInternalNotes] = useState("");
  const [initialized, setInitialized] = useState(false);

  const tripQuery = useQuery({
    queryKey: queryKeys.trip(tripId),
    queryFn: () => getTripById(tripId),
    enabled: !!user,
  });

  const vehicleTypesQuery = useQuery({
    queryKey: queryKeys.vehicleMasterOptions,
    queryFn: listVehicleMasterOptions,
    enabled: !!user,
  });

  const trip = tripQuery.data;

  // Pre-fill form when trip data loads
  useEffect(() => {
    if (trip && !initialized) {
      const rafId = window.requestAnimationFrame(() => {
        setPickupPoints(trip.pickupPoints.length > 0 ? trip.pickupPoints : [trip.pickupLocation || ""]);
        setDropPoints(trip.dropPoints.length > 0 ? trip.dropPoints : [trip.dropLocation || ""]);
        setVehicleType(trip.vehicleType || "");
        setVehicleLength(trip.vehicleLength || "");
        setWeightEstimate(trip.weightEstimate ? String(trip.weightEstimate) : "");
        setMaterialDetails(trip.materialDetails || "");
        setMaterialLength(trip.materialLength || "");
        setScheduleDate(trip.scheduleDate || "");
        setTripAmount(trip.tripAmount ? String(trip.tripAmount) : "");
        setInternalNotes(trip.internalNotes || "");
        setInitialized(true);
      });
      return () => window.cancelAnimationFrame(rafId);
    }
  }, [trip, initialized]);

  // Guard: redirect if trip is not editable
  useEffect(() => {
    if (!trip) return;
    const isRequestReceived = trip.currentStage === "request_received";
    const isRequester = user?.id === trip.requestedById;
    const isAdmin = user?.role === "admin" || user?.role === "super_admin";

    if (!isRequestReceived || (!isRequester && !isAdmin)) {
      router.replace(`/trips/${tripId}`);
    }
  }, [trip, user, tripId, router]);

  const updateMutation = useMutation({
    mutationFn: () =>
      updateTripRequest(tripId, {
        pickupPoints: pickupPoints
          .map((point) => normalizeSingleLineForSubmit(point, FIELD_LIMITS.location))
          .filter(Boolean),
        dropPoints: dropPoints
          .map((point) => normalizeSingleLineForSubmit(point, FIELD_LIMITS.location))
          .filter(Boolean),
        vehicleType,
        vehicleLength: vehicleLength || undefined,
        weightEstimate: weightEstimate ? Number(weightEstimate) : null,
        materialDetails: normalizeSingleLineForSubmit(materialDetails, FIELD_LIMITS.address) || undefined,
        materialLength: normalizeSingleLineForSubmit(materialLength, FIELD_LIMITS.vehicleCapacity) || undefined,
        scheduleDate,
        tripAmount: tripAmount ? Number(tripAmount) : null,
        internalNotes: normalizeMultilineForSubmit(internalNotes, FIELD_LIMITS.notes) || undefined,
      }),
    onSuccess: () => {
      router.push(`/trips/${tripId}`);
    },
  });

  const vehicleTypes = (vehicleTypesQuery.data ?? []).filter((vt) => vt.active);
  const selectedType = useMemo(
    () => vehicleTypes.find((type) => type.name === vehicleType) ?? null,
    [vehicleTypes, vehicleType],
  );
  const vehicleTypeOptions = Array.from(
    new Set([vehicleType, ...vehicleTypes.map((vt) => vt.name)].filter(Boolean)),
  );
  const selectedTypeLengthOptions = useMemo(
    () => (selectedType?.lengths ?? []).filter((length) => length.active).map((length) => length.value),
    [selectedType],
  );
  const allActiveLengthOptions = useMemo(
    () =>
      Array.from(
        new Set(
          vehicleTypes
            .flatMap((type) => type.lengths)
            .filter((length) => length.active)
            .map((length) => length.value),
        ),
      ),
    [vehicleTypes],
  );
  const vehicleLengthOptions = selectedTypeLengthOptions.length > 0 ? selectedTypeLengthOptions : allActiveLengthOptions;
  const usingGlobalLengthFallback =
    Boolean(vehicleType) && selectedTypeLengthOptions.length === 0 && allActiveLengthOptions.length > 0;
  const isVehicleLengthValid = vehicleLengthOptions.length === 0 || vehicleLengthOptions.includes(vehicleLength);
  const canSubmit =
    pickupPoints.some((point) => Boolean(normalizeSingleLineForSubmit(point, FIELD_LIMITS.location))) &&
    dropPoints.some((point) => Boolean(normalizeSingleLineForSubmit(point, FIELD_LIMITS.location))) &&
    vehicleType &&
    (vehicleLengthOptions.length === 0 || Boolean(vehicleLength)) &&
    isVehicleLengthValid &&
    scheduleDate;

  const updatePickupPoint = (index: number, value: string) => {
    setPickupPoints((prev) => prev.map((item, i) => (i === index ? sanitizeSingleLineInput(value, FIELD_LIMITS.location) : item)));
  };

  const updateDropPoint = (index: number, value: string) => {
    setDropPoints((prev) => prev.map((item, i) => (i === index ? sanitizeSingleLineInput(value, FIELD_LIMITS.location) : item)));
  };

  const handleVehicleTypeChange = (nextType: string) => {
    setVehicleType(nextType);
    const nextTypeRecord = vehicleTypes.find((type) => type.name === nextType) ?? null;
    const nextTypeLengths = (nextTypeRecord?.lengths ?? [])
      .filter((length) => length.active)
      .map((length) => length.value);
    const nextLengths = nextTypeLengths.length > 0 ? nextTypeLengths : allActiveLengthOptions;
    setVehicleLength((prev) => (nextLengths.includes(prev) ? prev : ""));
  };

  if (tripQuery.isLoading) {
    return (
      <div className="p-6 flex items-center gap-2 text-sm text-gray-500">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading trip...
      </div>
    );
  }

  if (tripQuery.isError || !trip) {
    return (
      <div className="p-6 text-center">
        <p className="text-sm text-red-600">Trip not found</p>
        <Link href="/trips" className="text-sm text-blue-600 hover:underline mt-2 inline-block">
          Back to trips
        </Link>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 space-y-4 max-w-2xl">
      <div className="flex items-center gap-2">
        <Link href={`/trips/${tripId}`} className="text-gray-400 hover:text-gray-600">
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <PageHeader title="Edit Trip Request" description={trip.tripCode} />
      </div>

      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="text-sm font-medium">
            Customer: {trip.customerName}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs text-gray-600">Pickup Points *</Label>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-7 px-2 text-[11px]"
                onClick={() => setPickupPoints((prev) => [...prev, ""])}
                disabled={pickupPoints.length >= 8}
              >
                <Plus className="h-3.5 w-3.5 mr-1" />
                Add Pickup
              </Button>
            </div>
            {pickupPoints.map((pickupPoint, index) => (
              <div key={`pickup-${index}`} className="flex items-center gap-2">
                <Input
                  className="h-9 text-sm"
                  placeholder={`Pickup ${index + 1}`}
                  value={pickupPoint}
                  onChange={(e) => updatePickupPoint(index, e.target.value)}
                  maxLength={FIELD_LIMITS.location}
                />
                <Button
                  type="button"
                  size="icon"
                  variant="outline"
                  className="h-9 w-9"
                  onClick={() =>
                    setPickupPoints((prev) => (prev.length > 1 ? prev.filter((_, i) => i !== index) : prev))
                  }
                  disabled={pickupPoints.length === 1}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs text-gray-600">Drop Points *</Label>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-7 px-2 text-[11px]"
                onClick={() => setDropPoints((prev) => [...prev, ""])}
                disabled={dropPoints.length >= 8}
              >
                <Plus className="h-3.5 w-3.5 mr-1" />
                Add Drop
              </Button>
            </div>
            {dropPoints.map((dropPoint, index) => (
              <div key={`drop-${index}`} className="flex items-center gap-2">
                <Input
                  className="h-9 text-sm"
                  placeholder={`Drop ${index + 1}`}
                  value={dropPoint}
                  onChange={(e) => updateDropPoint(index, e.target.value)}
                  maxLength={FIELD_LIMITS.location}
                />
                <Button
                  type="button"
                  size="icon"
                  variant="outline"
                  className="h-9 w-9"
                  onClick={() =>
                    setDropPoints((prev) => (prev.length > 1 ? prev.filter((_, i) => i !== index) : prev))
                  }
                  disabled={dropPoints.length === 1}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
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
                Vehicle Length {vehicleLengthOptions.length > 0 ? "*" : ""}
              </Label>
              <Select
                value={vehicleLengthOptions.length > 0 ? (vehicleLength || "_none") : "_none"}
                onValueChange={(value) => setVehicleLength(value === "_none" ? "" : value)}
                disabled={!vehicleType || vehicleLengthOptions.length === 0}
              >
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue placeholder={!vehicleType ? "Select vehicle type first" : "Select length"} />
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
              {usingGlobalLengthFallback && (
                <p className="text-[11px] text-blue-600">
                  No type-specific lengths found. Showing shared active lengths from Vehicle Master.
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
              <Label className="text-xs text-gray-600">Material Details</Label>
              <Input
                className="h-9 text-sm"
                placeholder="e.g., MS Coil"
                value={materialDetails}
                onChange={(e) => setMaterialDetails(sanitizeSingleLineInput(e.target.value, FIELD_LIMITS.address))}
                maxLength={FIELD_LIMITS.address}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="text-xs text-gray-600">Material Length</Label>
              <Input
                className="h-9 text-sm"
                placeholder="e.g., 24 ft (optional)"
                value={materialLength}
                onChange={(e) => setMaterialLength(sanitizeSingleLineInput(e.target.value, FIELD_LIMITS.vehicleCapacity))}
                maxLength={FIELD_LIMITS.vehicleCapacity}
              />
            </div>
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

          {updateMutation.isError && (
            <p className="text-sm text-red-600">
              {updateMutation.error instanceof Error ? updateMutation.error.message : "Failed to update trip request"}
            </p>
          )}

          <div className="flex gap-2 pt-2">
            <Button
              size="sm"
              className="h-8 text-xs"
              onClick={() => updateMutation.mutate()}
              disabled={!canSubmit || updateMutation.isPending}
            >
              {updateMutation.isPending && <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />}
              Save Changes
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-8 text-xs"
              onClick={() => router.push(`/trips/${tripId}`)}
            >
              Cancel
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
