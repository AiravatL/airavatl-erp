"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { searchPlaces, getPlaceDetails } from "@/lib/api/delivery-requests";
import type { PlacePrediction, PlaceDetails } from "@/lib/api/delivery-requests";
import { Search, MapPin, X, Loader2 } from "lucide-react";

interface LocationPickerProps {
  label: string;
  required?: boolean;
  value: PlaceDetails | null;
  contactName: string;
  contactPhone: string;
  sessionToken: string;
  onSelect: (place: PlaceDetails) => void;
  onClear: () => void;
  onContactNameChange: (value: string) => void;
  onContactPhoneChange: (value: string) => void;
}

export function LocationPicker({
  label,
  required,
  value,
  contactName,
  contactPhone,
  sessionToken,
  onSelect,
  onClear,
  onContactNameChange,
  onContactPhoneChange,
}: LocationPickerProps) {
  const [query, setQuery] = useState("");
  const [predictions, setPredictions] = useState<PlacePrediction[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isResolving, setIsResolving] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const handleSearch = useCallback(
    (input: string) => {
      setQuery(input);
      if (debounceRef.current) clearTimeout(debounceRef.current);

      if (input.trim().length < 2) {
        setPredictions([]);
        setShowDropdown(false);
        return;
      }

      debounceRef.current = setTimeout(async () => {
        setIsSearching(true);
        try {
          const result = await searchPlaces(input.trim(), sessionToken);
          setPredictions(result.predictions);
          setShowDropdown(true);
        } catch {
          setPredictions([]);
        } finally {
          setIsSearching(false);
        }
      }, 300);
    },
    [sessionToken],
  );

  const handleSelectPrediction = async (prediction: PlacePrediction) => {
    setShowDropdown(false);
    setIsResolving(true);
    try {
      const details = await getPlaceDetails(prediction.placeId);
      onSelect(details);
      setQuery("");
      setPredictions([]);
    } catch {
      // Failed to resolve place details
    } finally {
      setIsResolving(false);
    }
  };

  const handleClear = () => {
    onClear();
    setQuery("");
    setPredictions([]);
  };

  if (value) {
    return (
      <div className="space-y-3">
        <Label className="text-sm font-medium">
          {label} {required && <span className="text-red-500">*</span>}
        </Label>
        <div className="rounded-md border border-gray-200 bg-gray-50 p-3">
          <div className="flex items-start justify-between">
            <div className="flex items-start gap-2">
              <MapPin className="h-4 w-4 text-green-600 mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-medium text-gray-900">{value.primaryText || value.formattedAddress}</p>
                {value.secondaryText && (
                  <p className="text-xs text-gray-500">{value.secondaryText}</p>
                )}
                <p className="text-xs text-gray-400 mt-0.5">
                  {value.city}{value.state ? `, ${value.state}` : ""}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={handleClear}
              className="rounded p-1 text-gray-400 hover:bg-gray-200 hover:text-gray-600"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor={`${label}-contact-name`} className="text-xs text-gray-500">
              Contact Name
            </Label>
            <Input
              id={`${label}-contact-name`}
              placeholder="Contact person"
              value={contactName}
              onChange={(e) => onContactNameChange(e.target.value)}
              className="h-8 text-sm"
              maxLength={100}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`${label}-contact-phone`} className="text-xs text-gray-500">
              Contact Phone
            </Label>
            <Input
              id={`${label}-contact-phone`}
              placeholder="Phone number"
              value={contactPhone}
              onChange={(e) => onContactPhoneChange(e.target.value)}
              className="h-8 text-sm"
              inputMode="tel"
              maxLength={15}
            />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-1.5" ref={containerRef}>
      <Label className="text-sm font-medium">
        {label} {required && <span className="text-red-500">*</span>}
      </Label>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
        <Input
          placeholder="Type to search places..."
          value={query}
          onChange={(e) => handleSearch(e.target.value)}
          onFocus={() => predictions.length > 0 && setShowDropdown(true)}
          className="pl-9 h-9 text-sm"
        />
        {(isSearching || isResolving) && (
          <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-gray-400" />
        )}
      </div>

      {showDropdown && predictions.length > 0 && (
        <div className="rounded-md border border-gray-200 bg-white shadow-md max-h-48 overflow-y-auto">
          {predictions.map((pred) => (
            <button
              key={pred.placeId}
              type="button"
              className="flex w-full items-start gap-2 px-3 py-2 text-left hover:bg-gray-50 transition-colors"
              onClick={() => handleSelectPrediction(pred)}
            >
              <MapPin className="h-4 w-4 text-gray-400 mt-0.5 shrink-0" />
              <div>
                <p className="text-sm text-gray-900">{pred.primaryText}</p>
                <p className="text-xs text-gray-500">{pred.secondaryText}</p>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
