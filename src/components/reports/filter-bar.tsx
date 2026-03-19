"use client";

import { useMemo } from "react";
import { addDays, format } from "date-fns";
import { CalendarDays, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export interface DateRangeFilters {
  from?: string;
  to?: string;
}

function todayIso() {
  return format(new Date(), "yyyy-MM-dd");
}

function lastDaysIso(days: number) {
  return format(addDays(new Date(), -days), "yyyy-MM-dd");
}

export function createDefaultDateRange(): DateRangeFilters {
  return { from: lastDaysIso(29), to: todayIso() };
}

interface DateRangeFilterBarProps {
  filters: DateRangeFilters;
  onChange: (next: DateRangeFilters) => void;
}

export function DateRangeFilterBar({ filters, onChange }: DateRangeFilterBarProps) {
  const quickRanges = useMemo(
    () => [
      { label: "7D", from: lastDaysIso(6), to: todayIso() },
      { label: "30D", from: lastDaysIso(29), to: todayIso() },
      { label: "90D", from: lastDaysIso(89), to: todayIso() },
    ],
    [],
  );

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-3">
      <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
        <div className="grid flex-1 grid-cols-1 gap-2 sm:grid-cols-2 max-w-md">
          <label className="text-xs text-gray-500">
            <span className="mb-1 block">From</span>
            <Input
              type="date"
              value={filters.from ?? ""}
              onChange={(e) => onChange({ ...filters, from: e.target.value || undefined })}
              className="h-9"
            />
          </label>
          <label className="text-xs text-gray-500">
            <span className="mb-1 block">To</span>
            <Input
              type="date"
              value={filters.to ?? ""}
              onChange={(e) => onChange({ ...filters, to: e.target.value || undefined })}
              className="h-9"
            />
          </label>
        </div>
        <div className="flex items-center gap-1.5">
          {quickRanges.map((range) => (
            <Button
              key={range.label}
              variant="outline"
              size="sm"
              className="h-8 text-xs"
              onClick={() => onChange({ from: range.from, to: range.to })}
            >
              <CalendarDays className="mr-1 h-3 w-3" />
              {range.label}
            </Button>
          ))}
          <Button
            variant="outline"
            size="sm"
            className="h-8 text-xs"
            onClick={() => onChange(createDefaultDateRange())}
          >
            <RotateCcw className="mr-1 h-3 w-3" />
            Reset
          </Button>
        </div>
      </div>
    </div>
  );
}
