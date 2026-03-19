"use client";

import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Truck, Search, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { listVehicleMasterOptions } from "@/lib/api/vehicle-master";
import { queryKeys } from "@/lib/query/keys";
import { cn } from "@/lib/utils";

interface VehicleTypePickerProps {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
}

export function VehicleTypePicker({
  value,
  onChange,
  disabled,
  placeholder = "Select vehicle type",
  className,
}: VehicleTypePickerProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const { data: options, isLoading } = useQuery({
    queryKey: queryKeys.vehicleMasterOptions,
    queryFn: listVehicleMasterOptions,
  });

  const vehicles = options ?? [];

  const filtered = useMemo(() => {
    if (!search.trim()) return vehicles;
    const q = search.toLowerCase();
    return vehicles.filter((v) => v.name.toLowerCase().includes(q));
  }, [vehicles, search]);

  const openVehicles = filtered.filter((v) => !v.name.toLowerCase().includes("container"));
  const containerVehicles = filtered.filter((v) => v.name.toLowerCase().includes("container"));

  const handleSelect = (name: string) => {
    onChange(name);
    setOpen(false);
    setSearch("");
  };

  return (
    <>
      <Button
        type="button"
        variant="outline"
        disabled={disabled}
        onClick={() => setOpen(true)}
        className={cn(
          "h-9 w-full justify-between text-sm font-normal",
          !value && "text-muted-foreground",
          className,
        )}
      >
        <span className="truncate">{value || placeholder}</span>
        <Truck className="ml-2 h-3.5 w-3.5 shrink-0 text-gray-400" />
      </Button>

      <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) setSearch(""); }}>
        <DialogContent className="sm:max-w-md max-h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="text-base">Select Vehicle Type</DialogTitle>
          </DialogHeader>

          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by weight, length..."
              className="h-8 pl-8 text-sm"
              autoFocus
            />
          </div>

          <div className="flex-1 overflow-y-auto -mx-6 px-6 min-h-0">
            {isLoading ? (
              <p className="text-sm text-gray-500 py-4 text-center">Loading vehicles...</p>
            ) : filtered.length === 0 ? (
              <p className="text-sm text-gray-500 py-4 text-center">No vehicles found</p>
            ) : (
              <div className="space-y-3 pb-2">
                {openVehicles.length > 0 && (
                  <VehicleGroup
                    label="Open Truck"
                    badgeClass="bg-blue-50 text-blue-700"
                    vehicles={openVehicles}
                    selected={value}
                    onSelect={handleSelect}
                  />
                )}
                {containerVehicles.length > 0 && (
                  <VehicleGroup
                    label="Container"
                    badgeClass="bg-purple-50 text-purple-700"
                    vehicles={containerVehicles}
                    selected={value}
                    onSelect={handleSelect}
                  />
                )}
              </div>
            )}
          </div>

          {value && (
            <div className="pt-2 border-t">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 text-xs text-gray-500"
                onClick={() => { onChange(""); setOpen(false); setSearch(""); }}
              >
                Clear selection
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

function VehicleGroup({
  label,
  badgeClass,
  vehicles,
  selected,
  onSelect,
}: {
  label: string;
  badgeClass: string;
  vehicles: { id: string; name: string }[];
  selected: string;
  onSelect: (name: string) => void;
}) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-1.5">
        <Badge variant="outline" className={`border-0 text-[10px] ${badgeClass}`}>{label}</Badge>
        <span className="text-[11px] text-gray-400">{vehicles.length}</span>
      </div>
      <div className="grid grid-cols-2 gap-1">
        {vehicles.map((v) => {
          const isSelected = v.name === selected;
          return (
            <button
              key={v.id}
              type="button"
              onClick={() => onSelect(v.name)}
              className={cn(
                "flex items-center gap-2 rounded-md border px-2.5 py-2 text-left text-sm transition-colors",
                isSelected
                  ? "border-gray-900 bg-gray-50 font-medium text-gray-900"
                  : "border-gray-200 text-gray-700 hover:bg-gray-50 hover:border-gray-300",
              )}
            >
              {isSelected && <Check className="h-3.5 w-3.5 shrink-0 text-gray-900" />}
              <span className="truncate">{v.name}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
