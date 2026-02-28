"use client";

import { useMemo } from "react";
import { addDays, format } from "date-fns";
import { CalendarDays, RotateCcw } from "lucide-react";
import type { ReportFilters } from "@/lib/api/reports";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

function todayIso() {
  return format(new Date(), "yyyy-MM-dd");
}

function lastDaysIso(days: number) {
  return format(addDays(new Date(), -days), "yyyy-MM-dd");
}

export function createDefaultReportFilters(): Required<Pick<ReportFilters, "fromDate" | "toDate">> {
  return {
    fromDate: lastDaysIso(29),
    toDate: todayIso(),
  };
}

interface ReportFilterBarProps {
  filters: ReportFilters;
  onChange: (next: ReportFilters) => void;
  vehicleTypes: string[];
}

export function ReportFilterBar({ filters, onChange, vehicleTypes }: ReportFilterBarProps) {
  const quickRanges = useMemo(
    () => [
      { label: "7D", fromDate: lastDaysIso(6), toDate: todayIso() },
      { label: "30D", fromDate: lastDaysIso(29), toDate: todayIso() },
      { label: "90D", fromDate: lastDaysIso(89), toDate: todayIso() },
    ],
    [],
  );

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-3">
      <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
        <div className="grid flex-1 grid-cols-1 gap-2 sm:grid-cols-3">
          <label className="text-xs text-gray-500">
            <span className="mb-1 block">From</span>
            <Input
              type="date"
              value={filters.fromDate ?? ""}
              onChange={(event) => onChange({ ...filters, fromDate: event.target.value || undefined })}
              className="h-9"
            />
          </label>

          <label className="text-xs text-gray-500">
            <span className="mb-1 block">To</span>
            <Input
              type="date"
              value={filters.toDate ?? ""}
              onChange={(event) => onChange({ ...filters, toDate: event.target.value || undefined })}
              className="h-9"
            />
          </label>

          <label className="text-xs text-gray-500">
            <span className="mb-1 block">Vehicle Type</span>
            <Select
              value={filters.vehicleType ?? "all"}
              onValueChange={(value) => onChange({ ...filters, vehicleType: value === "all" ? undefined : value })}
            >
              <SelectTrigger className="h-9 w-full">
                <SelectValue placeholder="All Vehicle Types" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Vehicle Types</SelectItem>
                {vehicleTypes.map((vehicleType) => (
                  <SelectItem key={vehicleType} value={vehicleType}>
                    {vehicleType}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>
        </div>

        <div className="flex items-center gap-1.5">
          {quickRanges.map((range) => (
            <Button
              key={range.label}
              variant="outline"
              size="sm"
              className="h-8 text-xs"
              onClick={() => onChange({ ...filters, fromDate: range.fromDate, toDate: range.toDate })}
            >
              <CalendarDays className="mr-1 h-3 w-3" />
              {range.label}
            </Button>
          ))}
          <Button
            variant="outline"
            size="sm"
            className="h-8 text-xs"
            onClick={() => onChange(createDefaultReportFilters())}
          >
            <RotateCcw className="mr-1 h-3 w-3" />
            Reset
          </Button>
        </div>
      </div>
    </div>
  );
}
