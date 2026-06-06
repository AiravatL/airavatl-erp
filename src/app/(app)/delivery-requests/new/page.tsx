"use client";

import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { VehicleTypePicker } from "@/components/shared/vehicle-type-picker";
import { format, parseISO, startOfDay } from "date-fns";
import {
  createDeliveryRequest,
  getDeliveryRequest,
  listAuctionConsigners,
  getDirections,
} from "@/lib/api/delivery-requests";
import { apiRequest } from "@/lib/api/http";
import type { PlaceDetails, RouteResult, AuctionConsigner } from "@/lib/api/delivery-requests";
import { getTripRequest, linkTripRequestToAuction } from "@/lib/api/trip-requests";
import { queryKeys } from "@/lib/query/keys";
import {
  CARGO_TYPE_LABELS,
  AUCTION_DURATION_OPTIONS,
} from "@/lib/types";
import type { CargoType } from "@/lib/types";
import { LocationPicker } from "./location-picker";
import { Save, X, Loader2, MapPin, Search, Check, CalendarIcon, Clock, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

// Common pickup-time presets. Ops can still type a custom time in the
// fallback input below; most requests land on one of these slots.
const PICKUP_TIME_PRESETS = [
  "06:00", "07:00", "08:00", "09:00", "10:00", "11:00",
  "12:00", "13:00", "14:00", "15:00", "16:00", "17:00",
  "18:00", "19:00", "20:00",
];

function formatPresetTime(hm: string) {
  const [h, m] = hm.split(":").map((n) => parseInt(n, 10));
  const period = h >= 12 ? "PM" : "AM";
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:${m.toString().padStart(2, "0")} ${period}`;
}

type WeightUnit = "ton" | "kg";

export default function CreateDeliveryRequestPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const [error, setError] = useState("");
  const sessionToken = useMemo(() => crypto.randomUUID(), []);

  // Edit or Repeat mode
  const editId = searchParams.get("edit") || null;
  const repeatId = searchParams.get("repeat") || null;
  const fromTripRequestId = searchParams.get("fromTripRequest") || null;
  const prefillId = editId || repeatId;
  const isEditMode = !!editId;
  const isRepeatMode = !!repeatId;

  const editQuery = useQuery({
    queryKey: queryKeys.deliveryRequest(prefillId ?? ""),
    queryFn: () => getDeliveryRequest(prefillId!),
    enabled: !!prefillId,
  });

  // Trip request prefill — pulls cargo + contact fields from a pending
  // trip request. Location coordinates aren't prefilled (trip requests may
  // be free-text), so ops still picks pickup/delivery via LocationPicker.
  const tripRequestQuery = useQuery({
    queryKey: queryKeys.tripRequest(fromTripRequestId ?? ""),
    queryFn: () => getTripRequest(fromTripRequestId!),
    enabled: !!fromTripRequestId,
  });

  // Form state
  const [consignerProfileId, setConsignerProfileId] = useState("");
  const [consignerSearch, setConsignerSearch] = useState("");
  const [selectedConsigner, setSelectedConsigner] = useState<AuctionConsigner | null>(null);
  const [showConsignerDropdown, setShowConsignerDropdown] = useState(false);

  const [pickup, setPickup] = useState<PlaceDetails | null>(null);
  const [pickupContactName, setPickupContactName] = useState("");
  const [pickupContactPhone, setPickupContactPhone] = useState("");

  const [delivery, setDelivery] = useState<PlaceDetails | null>(null);
  const [deliveryContactName, setDeliveryContactName] = useState("");
  const [deliveryContactPhone, setDeliveryContactPhone] = useState("");

  const [route, setRoute] = useState<RouteResult | null>(null);
  const [routeLoading, setRouteLoading] = useState(false);
  const [routeError, setRouteError] = useState("");

  const [vehicleMasterTypeId, setVehicleMasterTypeId] = useState("");
  const [cargoWeight, setCargoWeight] = useState("");
  const [weightUnit, setWeightUnit] = useState<WeightUnit>("ton");
  const [cargoDescription, setCargoDescription] = useState("");
  const [cargoType, setCargoType] = useState("general");
  const [specialInstructions, setSpecialInstructions] = useState("");

  const [consignmentDate, setConsignmentDate] = useState("");
  const [pickupTime, setPickupTime] = useState("");
  const [auctionDurationMinutes, setAuctionDurationMinutes] = useState("60");

  const [internalNotes, setInternalNotes] = useState("");

  // Pre-fill in edit/repeat mode
  const [editLoaded, setEditLoaded] = useState(false);
  useEffect(() => {
    if (!prefillId || !editQuery.data || editLoaded) return;
    const r = editQuery.data.request as Record<string, unknown>;
    if (!r) return;

    setPickup({
      placeId: (r.pickup_place_id as string) ?? "",
      formattedAddress: (r.pickup_formatted_address as string) ?? "",
      latitude: r.pickup_latitude as number,
      longitude: r.pickup_longitude as number,
      city: (r.pickup_city as string) ?? "",
      state: (r.pickup_state as string) ?? null,
      primaryText: (r.pickup_primary_text as string) ?? "",
      secondaryText: (r.pickup_secondary_text as string) ?? "",
      addressComponents: null,
    });
    setPickupContactName((r.pickup_contact_name as string) ?? "");
    setPickupContactPhone((r.pickup_contact_phone as string) ?? "");

    setDelivery({
      placeId: (r.delivery_place_id as string) ?? "",
      formattedAddress: (r.delivery_formatted_address as string) ?? "",
      latitude: r.delivery_latitude as number,
      longitude: r.delivery_longitude as number,
      city: (r.delivery_city as string) ?? "",
      state: (r.delivery_state as string) ?? null,
      primaryText: (r.delivery_primary_text as string) ?? "",
      secondaryText: (r.delivery_secondary_text as string) ?? "",
      addressComponents: null,
    });
    setDeliveryContactName((r.delivery_contact_name as string) ?? "");
    setDeliveryContactPhone((r.delivery_contact_phone as string) ?? "");

    // Prefill vehicle from the source request using its master type id
    // (the picker is keyed by uuid now, not by name). If the source row
    // doesn't carry vehicle_master_type_id the user must re-pick.
    setVehicleMasterTypeId((r.vehicle_master_type_id as string) ?? "");
    if (r.cargo_weight_kg) {
      setCargoWeight(String(Math.round((r.cargo_weight_kg as number) / 1000 * 100) / 100));
      setWeightUnit("ton");
    }
    setCargoDescription((r.cargo_description as string) ?? "");
    setCargoType((r.cargo_type as string) ?? "general");
    setSpecialInstructions((r.special_instructions as string) ?? "");

    // In repeat mode: clear date/time so user must pick new ones
    // In edit mode: pre-fill date/time from existing
    if (!isRepeatMode && r.consignment_date) {
      const d = new Date(r.consignment_date as string);
      setConsignmentDate(d.toISOString().split("T")[0]);
      const h = d.getHours().toString().padStart(2, "0");
      const m = d.getMinutes().toString().padStart(2, "0");
      if (h !== "08" || m !== "00") setPickupTime(`${h}:${m}`);
    }

    setAuctionDurationMinutes(String(r.auction_duration_minutes ?? 60));
    setEditLoaded(true);
  }, [prefillId, editQuery.data, editLoaded, isRepeatMode]);

  // Pre-fill from a trip request. We prefill cargo + (when present)
  // pickup/delivery coordinates. Linking happens in onSuccess.
  const [tripRequestPrefilled, setTripRequestPrefilled] = useState(false);
  useEffect(() => {
    if (!fromTripRequestId || !tripRequestQuery.data || tripRequestPrefilled) return;
    const r = tripRequestQuery.data;

    if (r.pickup_latitude != null && r.pickup_longitude != null) {
      setPickup({
        placeId: r.pickup_place_id ?? "",
        formattedAddress: r.pickup_address,
        latitude: r.pickup_latitude,
        longitude: r.pickup_longitude,
        city: r.pickup_city ?? "",
        state: r.pickup_state ?? null,
        primaryText: r.pickup_city ?? r.pickup_address,
        secondaryText: [r.pickup_city, r.pickup_state].filter(Boolean).join(", "),
        addressComponents: null,
      });
    }
    if (r.delivery_latitude != null && r.delivery_longitude != null) {
      setDelivery({
        placeId: r.delivery_place_id ?? "",
        formattedAddress: r.delivery_address,
        latitude: r.delivery_latitude,
        longitude: r.delivery_longitude,
        city: r.delivery_city ?? "",
        state: r.delivery_state ?? null,
        primaryText: r.delivery_city ?? r.delivery_address,
        secondaryText: [r.delivery_city, r.delivery_state].filter(Boolean).join(", "),
        addressComponents: null,
      });
    }

    setCargoDescription(r.cargo_description ?? "");
    if (r.cargo_weight_kg && r.cargo_weight_kg > 0) {
      setCargoWeight(String(Math.round((r.cargo_weight_kg / 1000) * 100) / 100));
      setWeightUnit("ton");
    }
    if (r.cargo_type) setCargoType(r.cargo_type);
    if (r.special_instructions) setSpecialInstructions(r.special_instructions);
    if (r.consigner_id) setConsignerProfileId(r.consigner_id);
    setTripRequestPrefilled(true);
  }, [fromTripRequestId, tripRequestQuery.data, tripRequestPrefilled]);

  // Consigner search — Popover handles open/close + outside-click.
  const [debouncedConsignerSearch, setDebouncedConsignerSearch] = useState("");
  const consignerDebounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  const handleConsignerSearchChange = useCallback((value: string) => {
    setConsignerSearch(value);
    if (consignerDebounceRef.current) clearTimeout(consignerDebounceRef.current);
    consignerDebounceRef.current = setTimeout(() => {
      setDebouncedConsignerSearch(value);
    }, 300);
  }, []);

  const consignersQuery = useQuery({
    queryKey: queryKeys.deliveryRequestConsigners(debouncedConsignerSearch),
    queryFn: () => listAuctionConsigners(debouncedConsignerSearch || undefined),
    enabled: showConsignerDropdown,
  });

  const consigners = consignersQuery.data?.items ?? [];

  // Auto-calculate route
  useEffect(() => {
    if (!pickup || !delivery) { setRoute(null); return; }
    let cancelled = false;
    setRouteLoading(true);
    setRouteError("");
    getDirections(
      { latitude: pickup.latitude, longitude: pickup.longitude },
      { latitude: delivery.latitude, longitude: delivery.longitude },
    )
      .then((result) => { if (!cancelled) setRoute(result); })
      .catch(() => { if (!cancelled) setRouteError("Route could not be calculated"); })
      .finally(() => { if (!cancelled) setRouteLoading(false); });
    return () => { cancelled = true; };
  }, [pickup, delivery]);

  const today = new Date().toISOString().split("T")[0];

  // Convert weight to kg for submission
  const cargoWeightKg = cargoWeight
    ? Math.round(weightUnit === "ton" ? Number(cargoWeight) * 1000 : Number(cargoWeight))
    : undefined;

  const isValid =
    pickup !== null &&
    delivery !== null &&
    vehicleMasterTypeId !== "" &&
    consignmentDate !== "" &&
    consignmentDate >= today;

  // Build consignment datetime from date + optional time
  const consignmentDateTime = consignmentDate
    ? pickupTime
      ? `${consignmentDate}T${pickupTime}:00`
      : `${consignmentDate}T08:00:00`
    : "";

  const createMutation = useMutation({
    mutationFn: async () => {
      if (isEditMode) {
        // Edit mode — PUT to update API
        return apiRequest<{ request_id: string }>(`/api/delivery-requests/${editId}/edit`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            pickupFormattedAddress: pickup!.formattedAddress,
            pickupLatitude: pickup!.latitude,
            pickupLongitude: pickup!.longitude,
            pickupCity: pickup!.city,
            pickupState: pickup!.state,
            pickupContactName: pickupContactName.trim() || undefined,
            pickupContactPhone: pickupContactPhone.trim() || undefined,
            deliveryFormattedAddress: delivery!.formattedAddress,
            deliveryLatitude: delivery!.latitude,
            deliveryLongitude: delivery!.longitude,
            deliveryCity: delivery!.city,
            deliveryState: delivery!.state,
            deliveryContactName: deliveryContactName.trim() || undefined,
            deliveryContactPhone: deliveryContactPhone.trim() || undefined,
            vehicleMasterTypeId,
            cargoWeightKg,
            cargoDescription: cargoDescription.trim() || undefined,
            cargoType: cargoType || undefined,
            specialInstructions: specialInstructions.trim() || undefined,
            consignmentDate: consignmentDateTime || undefined,
          }),
        });
      }
      // Create mode
      return createDeliveryRequest({
        consignerProfileId: consignerProfileId || undefined,
        pickup: {
          placeId: pickup!.placeId,
          formattedAddress: pickup!.formattedAddress,
          latitude: pickup!.latitude,
          longitude: pickup!.longitude,
          city: pickup!.city,
          state: pickup!.state ?? undefined,
          primaryText: pickup!.primaryText,
          secondaryText: pickup!.secondaryText,
          addressComponents: pickup!.addressComponents ?? undefined,
          contactName: pickupContactName.trim() || undefined,
          contactPhone: pickupContactPhone.trim() || undefined,
        },
        delivery: {
          placeId: delivery!.placeId,
          formattedAddress: delivery!.formattedAddress,
          latitude: delivery!.latitude,
          longitude: delivery!.longitude,
          city: delivery!.city,
          state: delivery!.state ?? undefined,
          primaryText: delivery!.primaryText,
          secondaryText: delivery!.secondaryText,
          addressComponents: delivery!.addressComponents ?? undefined,
          contactName: deliveryContactName.trim() || undefined,
          contactPhone: deliveryContactPhone.trim() || undefined,
        },
        route: route
          ? { distanceKm: route.distanceKm, durationMinutes: route.durationMinutes ?? undefined, polyline: route.polyline ?? undefined }
          : undefined,
        vehicleMasterTypeId,
        cargoWeightKg,
        cargoDescription: cargoDescription.trim() || undefined,
        cargoType: cargoType || undefined,
        specialInstructions: specialInstructions.trim() || undefined,
        consignmentDate: consignmentDateTime,
        auctionDurationMinutes: Number(auctionDurationMinutes),
        internalNotes: internalNotes.trim() || undefined,
      });
    },
    onSuccess: async (result) => {
      queryClient.invalidateQueries({ queryKey: ["delivery-requests"] });
      const id = (result as { requestId?: string; request_id?: string }).requestId
        ?? (result as { request_id?: string }).request_id
        ?? editId;

      // If we came from a trip request, link it (best-effort) so the trip
      // request flips to converted and points back at this auction. A link
      // failure doesn't block the redirect — ops can retry from the request.
      if (fromTripRequestId && id && !isEditMode) {
        try {
          await linkTripRequestToAuction(fromTripRequestId, id);
          queryClient.invalidateQueries({ queryKey: ["trip-requests"] });
        } catch (linkErr) {
          // Surface as warning but still navigate to the new auction.
          console.warn("Failed to link trip request to auction:", linkErr);
        }
      }
      router.push(`/delivery-requests/${id}`);
    },
    onError: (err) => {
      setError(err instanceof Error ? err.message : isEditMode ? "Failed to update auction" : "Failed to create delivery request");
    },
  });

  const handleSubmit = () => {
    if (!isValid) return;
    setError("");
    createMutation.mutate();
  };

  return (
    <div className="p-4 sm:p-6 space-y-4">
      <PageHeader
        title={isEditMode ? "Edit Auction" : isRepeatMode ? "Repeat Auction" : fromTripRequestId ? "Create Auction from Trip Request" : "Create Delivery Request"}
        description={isEditMode ? "Modify auction details (only before any bids)" : isRepeatMode ? "Create a new auction with pre-filled details from the previous one" : fromTripRequestId ? "Filling in vehicle, date, and auction duration to convert this request into an auction" : "Create an auction for drivers to bid on"}
      />

      {fromTripRequestId && tripRequestQuery.data && (
        <Card className="border-blue-200 bg-blue-50/50">
          <CardContent className="p-3 text-sm text-gray-800">
            <p className="font-medium text-blue-900">
              From trip request {tripRequestQuery.data.request_number}
            </p>
            <p className="mt-1 text-gray-700">
              <span className="text-gray-500">Pickup:</span> {tripRequestQuery.data.pickup_address}
              {tripRequestQuery.data.pickup_city ? ` · ${tripRequestQuery.data.pickup_city}` : ""}
            </p>
            <p className="text-gray-700">
              <span className="text-gray-500">Delivery:</span> {tripRequestQuery.data.delivery_address}
              {tripRequestQuery.data.delivery_city ? ` · ${tripRequestQuery.data.delivery_city}` : ""}
            </p>
            <p className="mt-1 text-xs text-gray-500">
              Cargo + contacts have been prefilled. Set pickup/delivery via the picker below and submit to create the auction; the request will be linked automatically.
            </p>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="p-4 sm:p-6">
          <div className="space-y-6">
            {error && (
              <div className="rounded-md bg-red-50 p-3">
                <p className="text-sm text-red-700">{error}</p>
              </div>
            )}

            {/* Section 1: Consigner */}
            <div>
              <h3 className="text-sm font-semibold text-gray-900 mb-3">Consigner</h3>
              <div className="space-y-1.5">
                <Label className="text-sm font-medium">
                  Select Consigner <span className="text-xs text-gray-400">(optional)</span>
                </Label>
                <Popover open={showConsignerDropdown} onOpenChange={setShowConsignerDropdown}>
                  <PopoverTrigger asChild>
                    <Button
                      type="button"
                      variant="outline"
                      role="combobox"
                      aria-expanded={showConsignerDropdown}
                      className={cn(
                        "w-full h-auto min-h-9 justify-between px-3 py-1.5 text-sm font-normal",
                        !selectedConsigner && "text-gray-500",
                      )}
                    >
                      {selectedConsigner ? (
                        <div className="flex items-center gap-2 min-w-0 text-left">
                          <Check className="h-4 w-4 text-green-600 shrink-0" />
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-gray-900 truncate">
                              {selectedConsigner.displayName}
                            </p>
                            <p className="text-[11px] text-gray-500 truncate">
                              {selectedConsigner.contactName} · {selectedConsigner.phone}
                            </p>
                          </div>
                        </div>
                      ) : (
                        <span className="flex items-center gap-2">
                          <Search className="h-4 w-4 text-gray-400" />
                          Search consigners…
                        </span>
                      )}
                      {selectedConsigner ? (
                        <span
                          role="button"
                          tabIndex={-1}
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            setSelectedConsigner(null);
                            setConsignerProfileId("");
                          }}
                          className="ml-2 rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                        >
                          <X className="h-3.5 w-3.5" />
                        </span>
                      ) : (
                        <ChevronDown className="h-4 w-4 text-gray-400 opacity-70" />
                      )}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="p-0 w-[--radix-popover-trigger-width] min-w-[280px]" align="start">
                    <Command shouldFilter={false}>
                      <CommandInput
                        placeholder="Type a name or phone…"
                        value={consignerSearch}
                        onValueChange={handleConsignerSearchChange}
                      />
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
                                  setConsignerProfileId(c.consignerId);
                                  setShowConsignerDropdown(false);
                                  setConsignerSearch("");
                                }}
                                className="flex-col items-start gap-0.5"
                              >
                                <span className="text-sm text-gray-900">{c.displayName}</span>
                                <span className="text-[11px] text-gray-500">
                                  {c.contactName} · {c.phone}
                                </span>
                              </CommandItem>
                            ))}
                          </CommandGroup>
                        )}
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
                <p className="text-xs text-gray-400">
                  Tracks which consigner this is for. The auction appears as &quot;Airavatl&quot; in the app.
                </p>
              </div>
            </div>

            {/* Section 2: Pickup Location */}
            <div>
              <h3 className="text-sm font-semibold text-gray-900 mb-3">Pickup Location</h3>
              <LocationPicker label="Pickup Address" required value={pickup}
                contactName={pickupContactName} contactPhone={pickupContactPhone}
                sessionToken={sessionToken} onSelect={setPickup} onClear={() => setPickup(null)}
                onContactNameChange={setPickupContactName} onContactPhoneChange={setPickupContactPhone} />
            </div>

            {/* Section 3: Delivery Location */}
            <div>
              <h3 className="text-sm font-semibold text-gray-900 mb-3">Delivery Location</h3>
              <LocationPicker label="Delivery Address" required value={delivery}
                contactName={deliveryContactName} contactPhone={deliveryContactPhone}
                sessionToken={sessionToken} onSelect={setDelivery} onClear={() => setDelivery(null)}
                onContactNameChange={setDeliveryContactName} onContactPhoneChange={setDeliveryContactPhone} />
            </div>

            {/* Section 4: Route Summary */}
            {pickup && delivery && (
              <div>
                <h3 className="text-sm font-semibold text-gray-900 mb-3">Route</h3>
                <div className="rounded-md border border-gray-200 bg-gray-50 p-3">
                  {routeLoading ? (
                    <div className="flex items-center gap-2 text-sm text-gray-500">
                      <Loader2 className="h-4 w-4 animate-spin" /> Calculating route...
                    </div>
                  ) : route ? (
                    <div className="flex items-center gap-4 text-sm">
                      <div className="flex items-center gap-1.5">
                        <MapPin className="h-4 w-4 text-green-600" />
                        <span className="font-medium text-gray-900">{route.distanceKm} km</span>
                      </div>
                      {route.durationMinutes && (
                        <div className="text-gray-500">~{Math.floor(route.durationMinutes / 60)}h {route.durationMinutes % 60}m</div>
                      )}
                    </div>
                  ) : routeError ? (
                    <p className="text-sm text-amber-600">{routeError}. Distance will be calculated on submit.</p>
                  ) : null}
                </div>
              </div>
            )}

            {/* Section 5: Cargo & Vehicle */}
            <div>
              <h3 className="text-sm font-semibold text-gray-900 mb-3">Cargo & Vehicle</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-sm font-medium">
                    Vehicle Type <span className="text-red-500">*</span>
                  </Label>
                  <VehicleTypePicker value={vehicleMasterTypeId} onChange={setVehicleMasterTypeId} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-sm font-medium">Cargo Weight</Label>
                  <div className="flex items-center gap-2">
                    <Input
                      type="text"
                      inputMode="decimal"
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
                        className={`px-2.5 py-1.5 text-xs font-medium transition-colors ${weightUnit === "ton" ? "bg-gray-900 text-white" : "bg-white text-gray-600 hover:bg-gray-50"}`}
                        onClick={() => { if (weightUnit !== "ton" && cargoWeight) { setCargoWeight(String(Math.round(Number(cargoWeight) / 1000 * 100) / 100)); } setWeightUnit("ton"); }}>
                        Ton
                      </button>
                      <button type="button"
                        className={`px-2.5 py-1.5 text-xs font-medium transition-colors ${weightUnit === "kg" ? "bg-gray-900 text-white" : "bg-white text-gray-600 hover:bg-gray-50"}`}
                        onClick={() => { if (weightUnit !== "kg" && cargoWeight) { setCargoWeight(String(Math.round(Number(cargoWeight) * 1000))); } setWeightUnit("kg"); }}>
                        Kg
                      </button>
                    </div>
                  </div>
                  {cargoWeightKg !== undefined && cargoWeightKg > 0 && (
                    <p className="text-[11px] text-gray-400">
                      {weightUnit === "ton" ? `${cargoWeightKg.toLocaleString("en-IN")} kg` : `${(cargoWeightKg / 1000).toFixed(2)} ton`}
                    </p>
                  )}
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
                <div className="space-y-1.5">
                  <Label className="text-sm font-medium">Cargo Type</Label>
                  <Select value={cargoType} onValueChange={setCargoType}>
                    <SelectTrigger className="w-full h-9 text-sm"><SelectValue placeholder="Select cargo type" /></SelectTrigger>
                    <SelectContent>
                      {(Object.entries(CARGO_TYPE_LABELS) as [CargoType, string][]).map(([key, label]) => (
                        <SelectItem key={key} value={key}>{label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-sm font-medium">Cargo Description</Label>
                  <Input placeholder="e.g. Steel coils" value={cargoDescription}
                    onChange={(e) => setCargoDescription(e.target.value.slice(0, 200))}
                    className="h-9 text-sm" maxLength={200} />
                </div>
              </div>
              <div className="mt-4 space-y-1.5">
                <Label className="text-sm font-medium">Special Instructions</Label>
                <Textarea placeholder="Any special handling instructions..." value={specialInstructions}
                  onChange={(e) => setSpecialInstructions(e.target.value.slice(0, 500))}
                  rows={2} className="text-sm resize-none" maxLength={500} />
              </div>
            </div>

            {/* Section 6: Schedule & Auction */}
            <div>
              <h3 className="text-sm font-semibold text-gray-900 mb-3">Schedule & Auction</h3>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {/* Consignment Date — Popover + Calendar. User never types; a
                 *  click opens the picker. Past dates are disabled. */}
                <div className="space-y-1.5">
                  <Label className="text-sm font-medium">
                    Consignment Date <span className="text-red-500">*</span>
                  </Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        type="button"
                        variant="outline"
                        className={cn(
                          "w-full h-9 justify-start font-normal text-sm px-3",
                          !consignmentDate && "text-gray-500",
                        )}
                      >
                        <CalendarIcon className="h-4 w-4 mr-2 text-gray-500" />
                        {consignmentDate
                          ? format(parseISO(consignmentDate), "EEE, dd MMM yyyy")
                          : "Pick a date"}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="p-0 w-auto" align="start">
                      <Calendar
                        mode="single"
                        selected={consignmentDate ? parseISO(consignmentDate) : undefined}
                        onSelect={(d) => {
                          if (d) setConsignmentDate(format(d, "yyyy-MM-dd"));
                        }}
                        disabled={(d) => d < startOfDay(new Date())}
                        captionLayout="dropdown"
                        fromYear={new Date().getFullYear()}
                        toYear={new Date().getFullYear() + 1}
                      />
                    </PopoverContent>
                  </Popover>
                </div>

                {/* Pickup Time — Popover with preset grid. User never types; each
                 *  chip sets the time directly. Clearing returns to default. */}
                <div className="space-y-1.5">
                  <Label className="text-sm font-medium">Pickup Time</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        type="button"
                        variant="outline"
                        className={cn(
                          "w-full h-9 justify-start font-normal text-sm px-3",
                          !pickupTime && "text-gray-500",
                        )}
                      >
                        <Clock className="h-4 w-4 mr-2 text-gray-500" />
                        {pickupTime ? formatPresetTime(pickupTime) : "Pick a time"}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="p-3 w-64" align="start">
                      <div className="grid grid-cols-3 gap-1.5">
                        {PICKUP_TIME_PRESETS.map((slot) => {
                          const active = pickupTime === slot;
                          return (
                            <button
                              key={slot}
                              type="button"
                              onClick={() => setPickupTime(slot)}
                              className={cn(
                                "rounded-md px-2 py-1.5 text-xs font-medium transition-colors",
                                active
                                  ? "bg-gray-900 text-white"
                                  : "bg-gray-50 text-gray-700 hover:bg-gray-100",
                              )}
                            >
                              {formatPresetTime(slot)}
                            </button>
                          );
                        })}
                      </div>
                      {pickupTime && (
                        <button
                          type="button"
                          onClick={() => setPickupTime("")}
                          className="mt-2 w-full rounded-md border border-gray-200 px-2 py-1.5 text-xs text-gray-600 hover:bg-gray-50"
                        >
                          Clear (defaults to 8:00 AM)
                        </button>
                      )}
                    </PopoverContent>
                  </Popover>
                  <p className="text-[11px] text-gray-400">Defaults to 8:00 AM if not set</p>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-sm font-medium">Auction Duration</Label>
                  <Select value={auctionDurationMinutes} onValueChange={setAuctionDurationMinutes}>
                    <SelectTrigger className="w-full h-9 text-sm"><SelectValue placeholder="Select duration" /></SelectTrigger>
                    <SelectContent>
                      {AUCTION_DURATION_OPTIONS.map((opt) => (
                        <SelectItem key={opt.value} value={String(opt.value)}>{opt.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            {/* Section 7: Internal Notes */}
            <div>
              <h3 className="text-sm font-semibold text-gray-900 mb-3">Internal Notes</h3>
              <div className="space-y-1.5">
                <Label className="text-xs text-gray-500">Only visible to ERP staff — not shown in the partner app</Label>
                <Textarea placeholder="Any internal notes about this request..." value={internalNotes}
                  onChange={(e) => setInternalNotes(e.target.value.slice(0, 500))}
                  rows={2} className="text-sm resize-none" maxLength={500} />
              </div>
            </div>

            {/* Actions */}
            <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => router.push("/delivery-requests")}
                className="h-9 text-sm" disabled={createMutation.isPending}>
                <X className="h-4 w-4 mr-1.5" /> Cancel
              </Button>
              <Button onClick={handleSubmit} disabled={!isValid || createMutation.isPending} className="h-9 text-sm">
                {createMutation.isPending ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Save className="h-4 w-4 mr-1.5" />}
                {isEditMode ? "Save Changes" : "Create Auction"}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
