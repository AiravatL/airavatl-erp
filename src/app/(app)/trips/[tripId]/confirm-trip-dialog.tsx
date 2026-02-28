"use client";

import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { confirmTrip, listOpsVehiclesUsers, type TripListItem } from "@/lib/api/trips";
import { listVehicleMasterOptions } from "@/lib/api/vehicle-master";
import { queryKeys } from "@/lib/query/keys";
import { formatCurrency } from "@/lib/formatters";
import { Loader2 } from "lucide-react";

interface Props {
  trip: TripListItem;
  onClose: () => void;
  onSuccess: () => void;
}

export function ConfirmTripDialog({ trip, onClose, onSuccess }: Props) {
  const [pickupLocation, setPickupLocation] = useState(trip.pickupLocation || "");
  const [dropLocation, setDropLocation] = useState(trip.dropLocation || "");
  const [vehicleType, setVehicleType] = useState(trip.vehicleType || "");
  const [vehicleLength, setVehicleLength] = useState(trip.vehicleLength || "");
  const [weightEstimate, setWeightEstimate] = useState(trip.weightEstimate ? String(trip.weightEstimate) : "");
  const [plannedKm, setPlannedKm] = useState(trip.plannedKm ? String(trip.plannedKm) : "");
  const [scheduleDate, setScheduleDate] = useState(trip.scheduleDate || "");
  const [tripAmount, setTripAmount] = useState(trip.tripAmount ? String(trip.tripAmount) : "");
  const [internalNotes, setInternalNotes] = useState(trip.internalNotes || "");
  const [opsVehiclesOwnerId, setOpsVehiclesOwnerId] = useState("");

  const opsVehiclesQuery = useQuery({
    queryKey: queryKeys.opsVehiclesUsers,
    queryFn: listOpsVehiclesUsers,
  });

  const opsVehiclesUsers = opsVehiclesQuery.data ?? [];
  const vehicleMasterQuery = useQuery({
    queryKey: queryKeys.vehicleMasterOptions,
    queryFn: listVehicleMasterOptions,
  });
  const vehicleTypes = (vehicleMasterQuery.data ?? []).filter((type) => type.active);
  const vehicleTypeOptions = Array.from(new Set([vehicleType, ...vehicleTypes.map((type) => type.name)].filter(Boolean)));
  const selectedVehicleType = vehicleTypes.find((type) => type.name === vehicleType) ?? null;
  const selectedTypeLengthOptions = (selectedVehicleType?.lengths ?? [])
    .filter((length) => length.active)
    .map((length) => length.value);
  const allActiveLengthOptions = Array.from(
    new Set(
      vehicleTypes
        .flatMap((type) => type.lengths)
        .filter((length) => length.active)
        .map((length) => length.value),
    ),
  );
  const baseLengthOptions =
    selectedTypeLengthOptions.length > 0 ? selectedTypeLengthOptions : allActiveLengthOptions;
  const vehicleLengthOptions = Array.from(
    new Set(
      [
        vehicleLength,
        ...baseLengthOptions,
      ].filter(Boolean),
    ),
  );
  const usingGlobalLengthFallback =
    Boolean(vehicleType) && selectedTypeLengthOptions.length === 0 && allActiveLengthOptions.length > 0;

  const mutation = useMutation({
    mutationFn: () =>
      confirmTrip(trip.id, {
        pickupLocation: pickupLocation.trim() || undefined,
        dropLocation: dropLocation.trim() || undefined,
        vehicleType: vehicleType.trim() || undefined,
        vehicleLength: vehicleLength.trim() || undefined,
        weightEstimate: weightEstimate ? Number(weightEstimate) : undefined,
        plannedKm: plannedKm ? Number(plannedKm) : undefined,
        scheduleDate: scheduleDate || undefined,
        tripAmount: tripAmount ? Number(tripAmount) : undefined,
        internalNotes: internalNotes.trim() || undefined,
        opsVehiclesOwnerId: opsVehiclesOwnerId || undefined,
      }),
    onSuccess,
  });

  const canConfirm = opsVehiclesOwnerId;

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-base">Confirm & Request Vehicle</DialogTitle>
          <p className="text-xs text-gray-500 mt-1">
            {trip.tripCode} &middot; {trip.customerName}
          </p>
        </DialogHeader>

        <div className="space-y-3 py-2">
          <p className="text-xs text-gray-500">
            Review trip details below. Make any changes from negotiation before confirming.
          </p>

          {/* Vehicle Ops Assignee */}
          <div className="space-y-1 p-3 bg-blue-50/50 border border-blue-100 rounded-md">
            <Label className="text-xs font-medium text-blue-800">Assign Vehicle Ops *</Label>
            <Select value={opsVehiclesOwnerId} onValueChange={setOpsVehiclesOwnerId}>
              <SelectTrigger className="h-8 text-sm bg-white">
                <SelectValue placeholder="Select vehicle ops person" />
              </SelectTrigger>
              <SelectContent>
                {opsVehiclesUsers.map((u) => (
                  <SelectItem key={u.id} value={u.id}>
                    {u.fullName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {opsVehiclesQuery.isLoading && (
              <p className="text-[11px] text-blue-600">Loading vehicle ops users...</p>
            )}
            {!opsVehiclesQuery.isLoading && opsVehiclesUsers.length === 0 && (
              <p className="text-[11px] text-amber-600">No active vehicle ops users found.</p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs text-gray-600">Pickup</Label>
              <Input
                className="h-8 text-sm"
                value={pickupLocation}
                onChange={(e) => setPickupLocation(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-gray-600">Drop</Label>
              <Input
                className="h-8 text-sm"
                value={dropLocation}
                onChange={(e) => setDropLocation(e.target.value)}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs text-gray-600">Vehicle Type</Label>
              <Select
                value={vehicleType}
                onValueChange={(value) => {
                  setVehicleType(value);
                  const nextType = vehicleTypes.find((type) => type.name === value) ?? null;
                  const nextTypeLengths = (nextType?.lengths ?? [])
                    .filter((length) => length.active)
                    .map((length) => length.value);
                  const nextLengths =
                    nextTypeLengths.length > 0 ? nextTypeLengths : allActiveLengthOptions;
                  setVehicleLength((prev) => (nextLengths.includes(prev) ? prev : ""));
                }}
              >
                <SelectTrigger className="h-8 text-sm bg-white">
                  <SelectValue placeholder="Select vehicle type" />
                </SelectTrigger>
                <SelectContent>
                  {vehicleTypeOptions.map((typeName) => (
                    <SelectItem key={typeName} value={typeName}>
                      {typeName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-gray-600">Vehicle Length</Label>
              <Select
                value={vehicleLengthOptions.length > 0 ? (vehicleLength || "_none") : "_none"}
                onValueChange={(value) => setVehicleLength(value === "_none" ? "" : value)}
                disabled={!vehicleType || vehicleLengthOptions.length === 0}
              >
                <SelectTrigger className="h-8 text-sm bg-white">
                  <SelectValue placeholder={!vehicleType ? "Select type first" : "Select length"} />
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
              {usingGlobalLengthFallback && (
                <p className="text-[11px] text-blue-600">
                  No type-specific lengths found. Showing shared active lengths from Vehicle Master.
                </p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs text-gray-600">Weight (MT)</Label>
              <Input
                className="h-8 text-sm"
                type="number"
                value={weightEstimate}
                onChange={(e) => setWeightEstimate(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-gray-600">Planned KM</Label>
              <Input
                className="h-8 text-sm"
                type="number"
                value={plannedKm}
                onChange={(e) => setPlannedKm(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-1">
            <Label className="text-xs text-gray-600">Trip Amount</Label>
            <Input
              className="h-8 text-sm"
              type="number"
              value={tripAmount}
              onChange={(e) => setTripAmount(e.target.value)}
              placeholder={trip.tripAmount ? formatCurrency(trip.tripAmount) : ""}
            />
          </div>

          <div className="space-y-1">
            <Label className="text-xs text-gray-600">Schedule Date</Label>
            <Input
              className="h-8 text-sm"
              type="date"
              value={scheduleDate}
              onChange={(e) => setScheduleDate(e.target.value)}
            />
          </div>

          <div className="space-y-1">
            <Label className="text-xs text-gray-600">Internal Notes</Label>
            <Textarea
              className="text-sm resize-none"
              rows={2}
              value={internalNotes}
              onChange={(e) => setInternalNotes(e.target.value)}
            />
          </div>

          {vehicleMasterQuery.isLoading && (
            <p className="text-[11px] text-gray-500">Loading vehicle master options...</p>
          )}

          {mutation.isError && (
            <p className="text-sm text-red-600">
              {mutation.error instanceof Error ? mutation.error.message : "Failed to confirm trip"}
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
            onClick={() => mutation.mutate()}
            disabled={!canConfirm || mutation.isPending}
          >
            {mutation.isPending && <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />}
            Confirm & Request Vehicle
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
