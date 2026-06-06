"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from "@/components/ui/command";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import type { PlaceDetails } from "@/lib/api/delivery-requests";
import {
  createTripRequest,
  listTripRequestConsigners,
} from "@/lib/api/trip-requests";
import type { TripRequestConsigner } from "@/lib/api/trip-requests";
import { CARGO_TYPE_LABELS } from "@/lib/types";
import type { CargoType } from "@/lib/types";
import { LocationPicker } from "./location-picker";
import {
  Save, X, Loader2, Search, Check, ChevronDown,
} from "lucide-react";
import { cn } from "@/lib/utils";

type WeightUnit = "ton" | "kg";

export default function NewTripRequestPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [error, setError] = useState("");
  const sessionToken = useMemo(() => crypto.randomUUID(), []);

  const [consignerId, setConsignerId] = useState("");
  const [selectedConsigner, setSelectedConsigner] = useState<TripRequestConsigner | null>(null);
  const [consignerSearch, setConsignerSearch] = useState("");
  const [debouncedConsignerSearch, setDebouncedConsignerSearch] = useState("");
  const [showConsignerDropdown, setShowConsignerDropdown] = useState(false);
  const consignerDebounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  const handleConsignerSearchChange = useCallback((value: string) => {
    setConsignerSearch(value);
    if (consignerDebounceRef.current) clearTimeout(consignerDebounceRef.current);
    consignerDebounceRef.current = setTimeout(() => {
      setDebouncedConsignerSearch(value);
    }, 300);
  }, []);

  const consignersQuery = useQuery({
    queryKey: ["trip-request-consigners", debouncedConsignerSearch] as const,
    queryFn: () => listTripRequestConsigners(debouncedConsignerSearch || undefined),
    enabled: showConsignerDropdown,
  });
  const consigners = consignersQuery.data?.items ?? [];

  const [pickup, setPickup] = useState<PlaceDetails | null>(null);
  const [delivery, setDelivery] = useState<PlaceDetails | null>(null);

  const [cargoDescription, setCargoDescription] = useState("");
  const [cargoWeight, setCargoWeight] = useState("");
  const [weightUnit, setWeightUnit] = useState<WeightUnit>("ton");
  const [cargoType, setCargoType] = useState("general");
  const [specialInstructions, setSpecialInstructions] = useState("");

  const [preferredPickupDate, setPreferredPickupDate] = useState("");
  const [preferredPickupTime, setPreferredPickupTime] = useState("");
  const [notes, setNotes] = useState("");

  const cargoWeightKg = cargoWeight
    ? Math.round(weightUnit === "ton" ? Number(cargoWeight) * 1000 : Number(cargoWeight))
    : undefined;

  const preferredPickupAt = preferredPickupDate
    ? `${preferredPickupDate}T${preferredPickupTime || "08:00"}:00`
    : "";

  const isValid =
    consignerId !== "" &&
    pickup !== null &&
    delivery !== null &&
    cargoDescription.trim() !== "";

  const createMutation = useMutation({
    mutationFn: () =>
      createTripRequest({
        consignerId,
        pickupAddress: pickup!.formattedAddress,
        pickupCity: pickup!.city || undefined,
        pickupState: pickup!.state ?? undefined,
        pickupLatitude: pickup!.latitude,
        pickupLongitude: pickup!.longitude,
        pickupPlaceId: pickup!.placeId,
        deliveryAddress: delivery!.formattedAddress,
        deliveryCity: delivery!.city || undefined,
        deliveryState: delivery!.state ?? undefined,
        deliveryLatitude: delivery!.latitude,
        deliveryLongitude: delivery!.longitude,
        deliveryPlaceId: delivery!.placeId,
        cargoDescription: cargoDescription.trim(),
        cargoWeightKg: cargoWeightKg && cargoWeightKg > 0 ? cargoWeightKg : undefined,
        cargoType,
        specialInstructions: specialInstructions.trim() || undefined,
        preferredPickupAt: preferredPickupAt || undefined,
        notes: notes.trim() || undefined,
      }),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["trip-requests"] });
      router.push(`/trip-requests/${result.id}`);
    },
    onError: (err) =>
      setError(err instanceof Error ? err.message : "Failed to create trip request"),
  });

  return (
    <div className="p-4 sm:p-6 space-y-4">
      <PageHeader
        title="New Trip Request"
        description="Capture a request from a consigner — ops will review and create an auction"
      />

      <Card>
        <CardContent className="p-4 sm:p-6 space-y-6">
          {error && (
            <div className="rounded-md bg-red-50 p-3">
              <p className="text-sm text-red-700">{error}</p>
            </div>
          )}

          <Section title="Consigner">
            <Label className="text-sm font-medium">
              Select Consigner <span className="text-red-500">*</span>
            </Label>
            <Popover open={showConsignerDropdown} onOpenChange={setShowConsignerDropdown}>
              <PopoverTrigger asChild>
                <Button
                  type="button" variant="outline" role="combobox"
                  aria-expanded={showConsignerDropdown}
                  className={cn(
                    "w-full h-auto min-h-9 justify-between px-3 py-1.5 text-sm font-normal mt-1.5",
                    !selectedConsigner && "text-gray-500",
                  )}
                >
                  {selectedConsigner ? (
                    <div className="flex items-center gap-2 min-w-0 text-left">
                      <Check className="h-4 w-4 text-green-600 shrink-0" />
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">{selectedConsigner.displayName}</p>
                        <p className="text-[11px] text-gray-500 truncate">
                          {selectedConsigner.contactName} · {selectedConsigner.phone}
                        </p>
                      </div>
                    </div>
                  ) : (
                    <span className="flex items-center gap-2">
                      <Search className="h-4 w-4 text-gray-400" /> Search consigners…
                    </span>
                  )}
                  {selectedConsigner ? (
                    <span role="button" tabIndex={-1}
                      onClick={(e) => {
                        e.preventDefault(); e.stopPropagation();
                        setSelectedConsigner(null); setConsignerId("");
                      }}
                      className="ml-2 rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600">
                      <X className="h-3.5 w-3.5" />
                    </span>
                  ) : (
                    <ChevronDown className="h-4 w-4 text-gray-400 opacity-70" />
                  )}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="p-0 w-[--radix-popover-trigger-width] min-w-[280px]" align="start">
                <Command shouldFilter={false}>
                  <CommandInput placeholder="Type a name or phone…" value={consignerSearch} onValueChange={handleConsignerSearchChange} />
                  <CommandList>
                    {consignersQuery.isLoading ? (
                      <div className="flex items-center justify-center py-4">
                        <Loader2 className="h-4 w-4 animate-spin text-gray-400" />
                      </div>
                    ) : consigners.length === 0 ? (
                      <CommandEmpty>No consigners found.</CommandEmpty>
                    ) : (
                      <CommandGroup>
                        {consigners.map((c) => (
                          <CommandItem
                            key={c.consignerId}
                            value={`${c.displayName} ${c.contactName} ${c.phone}`}
                            onSelect={() => {
                              setSelectedConsigner(c);
                              setConsignerId(c.consignerId);
                              setShowConsignerDropdown(false);
                              setConsignerSearch("");
                            }}
                            className="flex-col items-start gap-0.5">
                            <span className="text-sm text-gray-900">{c.displayName}</span>
                            <span className="text-[11px] text-gray-500">{c.contactName} · {c.phone}</span>
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    )}
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          </Section>

          <Section title="Pickup">
            <LocationPicker label="Pickup Address" required value={pickup}
              sessionToken={sessionToken} onSelect={setPickup} onClear={() => setPickup(null)} />
          </Section>

          <Section title="Delivery">
            <LocationPicker label="Delivery Address" required value={delivery}
              sessionToken={sessionToken} onSelect={setDelivery} onClear={() => setDelivery(null)} />
          </Section>

          <Section title="Cargo">
            <div className="space-y-3">
              <Field label="Description" required>
                <Input value={cargoDescription} maxLength={300}
                  onChange={(e) => setCargoDescription(e.target.value.slice(0, 300))}
                  placeholder="e.g. Steel coils, 5 boxes of electronics…" />
              </Field>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Field label="Weight">
                  <div className="flex items-center gap-2">
                    <Input
                      type="text" inputMode="decimal"
                      placeholder={weightUnit === "ton" ? "e.g. 5" : "e.g. 5000"}
                      value={cargoWeight}
                      onChange={(e) => {
                        const v = e.target.value.replace(/[^\d.]/g, "");
                        setCargoWeight(v.slice(0, 8));
                      }}
                      className="h-9 text-sm flex-1"
                    />
                    <div className="flex rounded-md border border-gray-200 overflow-hidden shrink-0">
                      <button type="button"
                        className={`px-2.5 py-1.5 text-xs font-medium ${weightUnit === "ton" ? "bg-gray-900 text-white" : "bg-white text-gray-600 hover:bg-gray-50"}`}
                        onClick={() => setWeightUnit("ton")}>Ton</button>
                      <button type="button"
                        className={`px-2.5 py-1.5 text-xs font-medium ${weightUnit === "kg" ? "bg-gray-900 text-white" : "bg-white text-gray-600 hover:bg-gray-50"}`}
                        onClick={() => setWeightUnit("kg")}>Kg</button>
                    </div>
                  </div>
                </Field>
                <Field label="Type">
                  <Select value={cargoType} onValueChange={setCargoType}>
                    <SelectTrigger className="w-full h-9 text-sm">
                      <SelectValue placeholder="Select cargo type" />
                    </SelectTrigger>
                    <SelectContent>
                      {(Object.entries(CARGO_TYPE_LABELS) as [CargoType, string][]).map(([key, label]) => (
                        <SelectItem key={key} value={key}>{label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
              </div>
              <Field label="Special Instructions">
                <Textarea rows={2} value={specialInstructions} maxLength={500}
                  onChange={(e) => setSpecialInstructions(e.target.value.slice(0, 500))}
                  placeholder="Any handling instructions…" />
              </Field>
            </div>
          </Section>

          <Section title="Preferred schedule & notes (optional)">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="Preferred pickup date">
                <Input type="date" value={preferredPickupDate}
                  onChange={(e) => setPreferredPickupDate(e.target.value)} />
              </Field>
              <Field label="Preferred pickup time">
                <Input type="time" value={preferredPickupTime}
                  onChange={(e) => setPreferredPickupTime(e.target.value)} />
              </Field>
            </div>
            <div className="mt-3">
              <Field label="Notes">
                <Textarea rows={2} value={notes} maxLength={500}
                  onChange={(e) => setNotes(e.target.value.slice(0, 500))}
                  placeholder="Anything ops should know…" />
              </Field>
            </div>
          </Section>

          <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => router.push("/trip-requests")}
              className="h-9 text-sm" disabled={createMutation.isPending}>
              <X className="h-4 w-4 mr-1.5" /> Cancel
            </Button>
            <Button onClick={() => {
              if (!isValid) return;
              setError("");
              createMutation.mutate();
            }} disabled={!isValid || createMutation.isPending} className="h-9 text-sm">
              {createMutation.isPending ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Save className="h-4 w-4 mr-1.5" />}
              Create Request
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="text-sm font-semibold text-gray-900 mb-3">{title}</h3>
      {children}
    </div>
  );
}

function Field({
  label, required, children,
}: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-sm font-medium">
        {label}{required && <span className="text-red-500"> *</span>}
      </Label>
      {children}
    </div>
  );
}
