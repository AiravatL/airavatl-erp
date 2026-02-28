"use client";

import { useMemo, useState } from "react";
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
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { assignVehicle, listAvailableVehicles } from "@/lib/api/trips";
import { listFleetVendorDrivers } from "@/lib/api/fleet";
import { queryKeys } from "@/lib/query/keys";
import { Loader2, Search, Truck, Check } from "lucide-react";

interface Props {
  tripId: string;
  vehicleType: string;
  onClose: () => void;
  onSuccess: () => void;
}

function ownershipLabel(type: string, isOwnerDriver: boolean): { text: string; color: string } {
  if (type === "leased") return { text: "Leased", color: "bg-indigo-50 text-indigo-700 border-indigo-200" };
  if (isOwnerDriver) return { text: "Owner-Driver", color: "bg-amber-50 text-amber-700 border-amber-200" };
  return { text: "Vendor", color: "bg-emerald-50 text-emerald-700 border-emerald-200" };
}

export function AssignVehicleDialog({ tripId, vehicleType, onClose, onSuccess }: Props) {
  const [search, setSearch] = useState("");
  const [requirementOnly, setRequirementOnly] = useState(Boolean(vehicleType));
  const [ownershipFilter, setOwnershipFilter] = useState<"all" | "leased" | "vendor" | "owner_driver">("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [lengthFilter, setLengthFilter] = useState("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedDriverId, setSelectedDriverId] = useState<string | null>(null);
  const requestVehicleType = requirementOnly && vehicleType ? vehicleType : undefined;

  const vehiclesQuery = useQuery({
    queryKey: queryKeys.availableVehicles({ vehicleType: requestVehicleType, search: search.trim() || undefined }),
    queryFn: () => listAvailableVehicles({ vehicleType: requestVehicleType, search: search.trim() || undefined }),
  });

  const mutation = useMutation({
    mutationFn: () => {
      if (!selectedVehicle) throw new Error("No vehicle selected");
      return assignVehicle(tripId, selectedVehicle.id, effectiveSelectedDriverId);
    },
    onSuccess,
  });

  const fetchedVehicles = useMemo(() => {
    const rows = vehiclesQuery.data ?? [];
    return [...rows].sort((a, b) => {
      const aMatch = vehicleType ? a.type.toLowerCase() === vehicleType.toLowerCase() : true;
      const bMatch = vehicleType ? b.type.toLowerCase() === vehicleType.toLowerCase() : true;
      if (aMatch !== bMatch) return aMatch ? -1 : 1;
      return a.number.localeCompare(b.number);
    });
  }, [vehiclesQuery.data, vehicleType]);
  const typeOptions = useMemo(
    () => Array.from(new Set(fetchedVehicles.map((vehicle) => vehicle.type).filter(Boolean))).sort((a, b) => a.localeCompare(b)),
    [fetchedVehicles],
  );
  const lengthOptions = useMemo(() => {
    const source = typeFilter === "all" ? fetchedVehicles : fetchedVehicles.filter((vehicle) => vehicle.type === typeFilter);
    return Array.from(new Set(source.map((vehicle) => vehicle.vehicleLength).filter(Boolean))).sort((a, b) => a.localeCompare(b));
  }, [fetchedVehicles, typeFilter]);
  const filteredVehicles = useMemo(
    () =>
      fetchedVehicles.filter((vehicle) => {
        const ownershipMatches =
          ownershipFilter === "all" ||
          (ownershipFilter === "leased" && vehicle.ownershipType === "leased") ||
          (ownershipFilter === "vendor" && vehicle.ownershipType === "vendor" && !vehicle.isOwnerDriver) ||
          (ownershipFilter === "owner_driver" && vehicle.ownershipType === "vendor" && vehicle.isOwnerDriver);
        const typeMatches = typeFilter === "all" || vehicle.type === typeFilter;
        const lengthMatches = lengthFilter === "all" || vehicle.vehicleLength === lengthFilter;
        return ownershipMatches && typeMatches && lengthMatches;
      }),
    [fetchedVehicles, ownershipFilter, typeFilter, lengthFilter],
  );
  const selectedVehicle = filteredVehicles.find((vehicle) => vehicle.id === selectedId) ?? null;
  const requiresDriver =
    selectedVehicle?.ownershipType === "vendor" && !!selectedVehicle.vendorId;

  const driversQuery = useQuery({
    queryKey: queryKeys.fleetVendorDrivers(selectedVehicle?.vendorId ?? "", {}),
    queryFn: () => listFleetVendorDrivers(selectedVehicle!.vendorId!),
    enabled: !!selectedVehicle?.vendorId && selectedVehicle.ownershipType === "vendor",
  });
  const vendorDrivers = driversQuery.data ?? [];
  const effectiveSelectedDriverId =
    !requiresDriver
      ? null
      : selectedDriverId && vendorDrivers.some((driver) => driver.id === selectedDriverId)
        ? selectedDriverId
        : (vendorDrivers[0]?.id ?? null);

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-base">Assign Vehicle</DialogTitle>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-gray-500">
            <span>Trip Requirement:</span>
            <Badge variant="outline" className="text-[10px] border-gray-200 bg-gray-50 text-gray-700">
              {vehicleType || "Any Type"}
            </Badge>
            <Badge variant="outline" className="text-[10px] border-gray-200 bg-gray-50 text-gray-700">
              {filteredVehicles.length} shown
            </Badge>
          </div>
        </DialogHeader>

        <div className="space-y-3 py-2">
          {vehicleType && (
            <div className="rounded-md border border-gray-200 bg-gray-50/50 p-2.5">
              <div className="flex items-center justify-between gap-2">
                <p className="text-[11px] text-gray-600">
                  Default filter: show vehicles matching trip type `{vehicleType}`.
                </p>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-[11px]"
                  onClick={() => setRequirementOnly((prev) => !prev)}
                >
                  {requirementOnly ? "Show All Types" : "Show Required Type"}
                </Button>
              </div>
            </div>
          )}

          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
            <Input
              className="h-8 text-sm pl-8"
              placeholder="Search by number, type, vendor..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <Select value={ownershipFilter} onValueChange={(value) => setOwnershipFilter(value as typeof ownershipFilter)}>
              <SelectTrigger className="h-8 text-xs">
                <SelectValue placeholder="Ownership" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Ownership</SelectItem>
                <SelectItem value="leased">Leased</SelectItem>
                <SelectItem value="vendor">Vendor</SelectItem>
                <SelectItem value="owner_driver">Owner Driver</SelectItem>
              </SelectContent>
            </Select>
            <Select
              value={typeFilter}
              onValueChange={(value) => {
                setTypeFilter(value);
                if (value !== "all" && lengthFilter !== "all") {
                  const allowedLengths = new Set(
                    fetchedVehicles
                      .filter((vehicle) => vehicle.type === value)
                      .map((vehicle) => vehicle.vehicleLength)
                      .filter(Boolean),
                  );
                  if (!allowedLengths.has(lengthFilter)) {
                    setLengthFilter("all");
                  }
                }
              }}
            >
              <SelectTrigger className="h-8 text-xs">
                <SelectValue placeholder="Vehicle Type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                {typeOptions.map((type) => (
                  <SelectItem key={type} value={type}>
                    {type}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={lengthFilter} onValueChange={setLengthFilter}>
              <SelectTrigger className="h-8 text-xs">
                <SelectValue placeholder="Vehicle Length" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Lengths</SelectItem>
                {lengthOptions.map((length) => (
                  <SelectItem key={length} value={length}>
                    {length}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="max-h-64 overflow-y-auto border border-gray-200 rounded-md divide-y divide-gray-100">
            {vehiclesQuery.isLoading && (
              <div className="p-4 flex items-center justify-center gap-2 text-sm text-gray-500">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading vehicles...
              </div>
            )}

            {!vehiclesQuery.isLoading && filteredVehicles.length === 0 && (
              <div className="p-4 text-center text-sm text-gray-500">
                No available vehicles found
              </div>
            )}

            {!vehiclesQuery.isLoading && filteredVehicles.map((v) => {
              const badge = ownershipLabel(v.ownershipType, v.isOwnerDriver);
              const isSelected = selectedId === v.id;
              return (
                <button
                  key={v.id}
                  type="button"
                  className={`w-full text-left px-3 py-2.5 flex items-center gap-3 hover:bg-gray-50 transition-colors ${
                    isSelected ? "bg-gray-50 ring-1 ring-inset ring-gray-900" : ""
                  }`}
                  onClick={() => {
                    setSelectedId(isSelected ? null : v.id);
                    if (isSelected || v.ownershipType !== "vendor") {
                      setSelectedDriverId(null);
                    } else {
                      setSelectedDriverId(v.currentDriverId ?? null);
                    }
                  }}
                >
                  <div className="flex h-8 w-8 items-center justify-center rounded-md bg-gray-100 shrink-0">
                    {isSelected ? (
                      <Check className="h-4 w-4 text-gray-900" />
                    ) : (
                      <Truck className="h-4 w-4 text-gray-500" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-gray-900">{v.number}</span>
                      <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${badge.color}`}>
                        {badge.text}
                      </Badge>
                      {vehicleType && !requirementOnly && v.type.toLowerCase() !== vehicleType.toLowerCase() && (
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0 bg-amber-50 text-amber-700 border-amber-200">
                          Type mismatch
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-gray-500 truncate">
                      {v.type}
                      {v.vehicleLength ? ` · ${v.vehicleLength}` : ""}
                      {v.vendorName ? ` · ${v.vendorName}` : ""}
                    </p>
                    {v.ownershipType === "leased" && v.leasedDriverName && (
                      <p className="text-[11px] text-gray-400 truncate">
                        Driver: {v.leasedDriverName}
                        {v.leasedDriverPhone ? ` · ${v.leasedDriverPhone}` : ""}
                      </p>
                    )}
                  </div>
                </button>
              );
            })}
          </div>

          {requiresDriver && (
            <div className="space-y-1.5">
              <p className="text-xs text-gray-600">Driver (same vendor)</p>
              <Select value={effectiveSelectedDriverId ?? ""} onValueChange={setSelectedDriverId}>
                <SelectTrigger className="h-8 text-sm">
                  <SelectValue placeholder={driversQuery.isLoading ? "Loading drivers..." : "Select driver"} />
                </SelectTrigger>
                <SelectContent>
                  {vendorDrivers.map((driver) => (
                    <SelectItem key={driver.id} value={driver.id}>
                      {driver.fullName} · {driver.phone}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {!driversQuery.isLoading && vendorDrivers.length === 0 && (
                <p className="text-xs text-amber-600">No drivers found for this vendor. Add a driver first in Fleet.</p>
              )}
            </div>
          )}

          {mutation.isError && (
            <p className="text-sm text-red-600">
              {mutation.error instanceof Error ? mutation.error.message : "Failed to assign vehicle"}
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
            disabled={!selectedVehicle || mutation.isPending || (requiresDriver && !effectiveSelectedDriverId)}
          >
            {mutation.isPending && <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />}
            Assign Vehicle
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
