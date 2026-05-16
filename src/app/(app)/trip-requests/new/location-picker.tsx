"use client";

import { useState, useRef, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { searchPlaces, getPlaceDetails } from "@/lib/api/delivery-requests";
import type { PlacePrediction, PlaceDetails } from "@/lib/api/delivery-requests";
import { useDebouncedValue } from "@/lib/hooks/use-debounced-value";
import { Search, MapPin, X, Loader2 } from "lucide-react";

interface LocationPickerProps {
  label: string;
  required?: boolean;
  value: PlaceDetails | null;
  sessionToken: string;
  onSelect: (place: PlaceDetails) => void;
  onClear: () => void;
}

const MIN_SEARCH_CHARS = 5;
const SEARCH_DEBOUNCE_MS = 650;
const SEARCH_CACHE_TTL_MS = 60_000;

function normalizeSearchQuery(input: string) {
  return input.replace(/\s+/g, " ").trim();
}

export function LocationPicker({
  label, required, value, sessionToken, onSelect, onClear,
}: LocationPickerProps) {
  const [query, setQuery] = useState("");
  const [predictions, setPredictions] = useState<PlacePrediction[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isResolving, setIsResolving] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const searchCacheRef = useRef(new Map<string, { expiresAt: number; predictions: PlacePrediction[] }>());
  const searchRequestIdRef = useRef(0);
  const debouncedQuery = useDebouncedValue(normalizeSearchQuery(query), SEARCH_DEBOUNCE_MS);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  useEffect(() => {
    if (value) return;
    if (debouncedQuery.length < MIN_SEARCH_CHARS) {
      setPredictions([]); setShowDropdown(false); setIsSearching(false);
      return;
    }
    const cached = searchCacheRef.current.get(debouncedQuery.toLowerCase());
    if (cached && cached.expiresAt > Date.now()) {
      setPredictions(cached.predictions);
      setShowDropdown(cached.predictions.length > 0);
      setIsSearching(false);
      return;
    }
    const requestId = ++searchRequestIdRef.current;
    setIsSearching(true);
    searchPlaces(debouncedQuery, sessionToken)
      .then((result) => {
        if (searchRequestIdRef.current !== requestId) return;
        searchCacheRef.current.set(debouncedQuery.toLowerCase(), {
          predictions: result.predictions,
          expiresAt: Date.now() + SEARCH_CACHE_TTL_MS,
        });
        setPredictions(result.predictions);
        setShowDropdown(result.predictions.length > 0);
      })
      .catch(() => {
        if (searchRequestIdRef.current !== requestId) return;
        setPredictions([]); setShowDropdown(false);
      })
      .finally(() => {
        if (searchRequestIdRef.current === requestId) setIsSearching(false);
      });
  }, [debouncedQuery, sessionToken, value]);

  const handleSelectPrediction = async (prediction: PlacePrediction) => {
    setShowDropdown(false);
    setIsResolving(true);
    try {
      const details = await getPlaceDetails(prediction.placeId);
      onSelect(details);
      setQuery(""); setPredictions([]);
    } catch {
      /* swallow */
    } finally {
      setIsResolving(false);
    }
  };

  const handleClear = () => {
    onClear();
    setQuery(""); setPredictions([]); setShowDropdown(false);
  };

  if (value) {
    return (
      <div className="space-y-1.5">
        <Label className="text-sm font-medium">
          {label}{required && <span className="text-red-500"> *</span>}
        </Label>
        <div className="rounded-md border border-gray-200 bg-gray-50 p-3">
          <div className="flex items-start justify-between">
            <div className="flex items-start gap-2 min-w-0">
              <MapPin className="h-4 w-4 text-green-600 mt-0.5 shrink-0" />
              <div className="min-w-0">
                <p className="text-sm font-medium text-gray-900 truncate">
                  {value.primaryText || value.formattedAddress}
                </p>
                {value.secondaryText && (
                  <p className="text-xs text-gray-500 truncate">{value.secondaryText}</p>
                )}
                <p className="text-xs text-gray-400 mt-0.5">
                  {value.city}{value.state ? `, ${value.state}` : ""}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={handleClear}
              className="rounded p-1 text-gray-400 hover:bg-gray-200 hover:text-gray-600 shrink-0"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-1.5" ref={containerRef}>
      <Label className="text-sm font-medium">
        {label}{required && <span className="text-red-500"> *</span>}
      </Label>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
        <Input
          placeholder={`Type at least ${MIN_SEARCH_CHARS} characters to search...`}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            if (normalizeSearchQuery(e.target.value).length < MIN_SEARCH_CHARS) {
              setPredictions([]); setShowDropdown(false);
            }
          }}
          onFocus={() => predictions.length > 0 && setShowDropdown(true)}
          className="pl-9 h-9 text-sm"
          maxLength={120}
          autoComplete="off"
          spellCheck={false}
        />
        {(isSearching || isResolving) && (
          <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-gray-400" />
        )}
      </div>

      {query.length > 0 && normalizeSearchQuery(query).length < MIN_SEARCH_CHARS && (
        <p className="text-xs text-gray-500">
          Keep typing to at least {MIN_SEARCH_CHARS} characters before search starts.
        </p>
      )}

      {showDropdown && predictions.length > 0 && (
        <div className="rounded-md border border-gray-200 bg-white shadow-md max-h-48 overflow-y-auto">
          {predictions.map((pred) => (
            <button
              key={pred.placeId}
              type="button"
              className="flex w-full items-start gap-2 px-3 py-2 text-left hover:bg-gray-50"
              onClick={() => handleSelectPrediction(pred)}
            >
              <MapPin className="h-4 w-4 text-gray-400 mt-0.5 shrink-0" />
              <div className="min-w-0">
                <p className="text-sm text-gray-900 truncate">{pred.primaryText}</p>
                <p className="text-xs text-gray-500 truncate">{pred.secondaryText}</p>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
