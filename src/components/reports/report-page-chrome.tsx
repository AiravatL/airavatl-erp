"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import type { ReportDataQuality, ReportFilters } from "@/lib/api/reports";
import { listVehicleMasterOptions } from "@/lib/api/vehicle-master";
import { queryKeys } from "@/lib/query/keys";
import { PageHeader } from "@/components/shared/page-header";
import { DataQualityNote } from "@/components/reports/data-quality-note";
import { ReportFilterBar } from "@/components/reports/filter-bar";

interface ReportPageChromeProps {
  title: string;
  description: string;
  filters: ReportFilters;
  onFiltersChange: (next: ReportFilters) => void;
  dataQuality?: ReportDataQuality;
  actions?: React.ReactNode;
}

export function ReportPageChrome({
  title,
  description,
  filters,
  onFiltersChange,
  dataQuality,
  actions,
}: ReportPageChromeProps) {
  const vehicleTypeQuery = useQuery({
    queryKey: queryKeys.vehicleMasterOptions,
    queryFn: () => listVehicleMasterOptions(),
  });

  const vehicleTypes = useMemo(
    () => (vehicleTypeQuery.data ?? []).filter((item) => item.active).map((item) => item.name),
    [vehicleTypeQuery.data],
  );

  return (
    <div className="space-y-3">
      <PageHeader title={title} description={description}>
        {actions}
      </PageHeader>
      <ReportFilterBar filters={filters} onChange={onFiltersChange} vehicleTypes={vehicleTypes} />
      {dataQuality ? <DataQualityNote dataQuality={dataQuality} /> : null}
    </div>
  );
}
