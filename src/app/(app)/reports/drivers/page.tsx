"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  useReactTable,
  getCoreRowModel,
  flexRender,
  createColumnHelper,
} from "@tanstack/react-table";
import { MapPin } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { KpiCard } from "@/components/reports/kpi-card";
import { CsvExportButton, type CsvColumn } from "@/components/reports/csv-export-button";
import { Card, CardContent } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from "@/components/ui/table";
import { formatRelativeTime } from "@/lib/formatters";
import { listDriverLocations, type DriverLocationItem } from "@/lib/api/app-reports";
import { queryKeys } from "@/lib/query/keys";

const col = createColumnHelper<DriverLocationItem>();

const columns = [
  col.accessor("driverName", {
    header: "Driver",
    cell: (info) => <span className="font-medium text-gray-900">{info.getValue()}</span>,
  }),
  col.accessor("phone", { header: "Phone" }),
  col.accessor("driverType", {
    header: "Type",
    cell: (info) => prettify(info.getValue()),
  }),
  col.accessor("isOnline", {
    header: "Online",
    cell: (info) => <Dot on={info.getValue()} />,
  }),
  col.accessor("isGpsEnabled", {
    header: "GPS",
    cell: (info) => <Dot on={info.getValue()} offColor="text-red-400" />,
  }),
  col.accessor("speedKmph", {
    header: "Speed",
    cell: (info) => {
      const v = info.getValue();
      return v !== null ? `${Math.round(v)} km/h` : <span className="text-gray-300">—</span>;
    },
  }),
  col.accessor("batteryLevel", {
    header: "Battery",
    cell: (info) => {
      const v = info.getValue();
      if (v === null) return <span className="text-gray-300">—</span>;
      const pct = Math.round(v * 100);
      const color = pct < 20 ? "text-red-600" : pct < 50 ? "text-amber-600" : "text-emerald-600";
      return <span className={color}>{pct}%</span>;
    },
  }),
  col.accessor("currentTripId", {
    header: "On Trip",
    cell: (info) => info.getValue() ? <span className="text-xs text-indigo-600">Yes</span> : <span className="text-gray-300">—</span>,
  }),
  col.accessor("updatedAt", {
    header: "Last Update",
    cell: (info) => <span className="text-gray-500 text-xs">{formatRelativeTime(info.getValue())}</span>,
  }),
];

const csvColumns: CsvColumn<DriverLocationItem>[] = [
  { key: "driverName", header: "Driver", value: (r) => r.driverName },
  { key: "phone", header: "Phone", value: (r) => r.phone },
  { key: "driverType", header: "Type", value: (r) => r.driverType },
  { key: "isOnline", header: "Online", value: (r) => r.isOnline ? "Yes" : "No" },
  { key: "isGpsEnabled", header: "GPS", value: (r) => r.isGpsEnabled ? "Yes" : "No" },
  { key: "speedKmph", header: "Speed (km/h)", value: (r) => r.speedKmph },
  { key: "batteryLevel", header: "Battery", value: (r) => r.batteryLevel !== null ? Math.round(r.batteryLevel * 100) : null },
  { key: "latitude", header: "Latitude", value: (r) => r.latitude },
  { key: "longitude", header: "Longitude", value: (r) => r.longitude },
  { key: "currentTripId", header: "Trip ID", value: (r) => r.currentTripId },
  { key: "updatedAt", header: "Last Update", value: (r) => r.updatedAt },
];

export default function DriversReportPage() {
  const [onlineOnly, setOnlineOnly] = useState(false);

  const query = useQuery({
    queryKey: queryKeys.appDriverLocations({ onlineOnly }),
    queryFn: () => listDriverLocations({ onlineOnly }),
    refetchInterval: 30_000,
  });

  const items = query.data?.items ?? [];
  const online = items.filter((d) => d.isOnline).length;
  const acceptingAuction = items.filter((d) => d.acceptingAuction).length;
  const acceptingInstant = items.filter((d) => d.acceptingInstant).length;
  const onTrip = items.filter((d) => d.currentTripId !== null).length;

  const table = useReactTable({ data: items, columns, getCoreRowModel: getCoreRowModel() });

  return (
    <div className="space-y-4 p-4 sm:p-6">
      <PageHeader title="Driver Analytics" description="Driver locations and availability status">
        <CsvExportButton fileName="drivers-report.csv" rows={items} columns={csvColumns} />
      </PageHeader>

      <div className="flex items-center gap-2">
        <Switch id="online-only" checked={onlineOnly} onCheckedChange={setOnlineOnly} />
        <Label htmlFor="online-only" className="text-sm text-gray-600">Online only</Label>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <KpiCard label="Total Drivers" value={items.length.toLocaleString("en-IN")} />
        <KpiCard label="Online Now" value={online.toLocaleString("en-IN")} />
        <KpiCard label="Accepting Auction" value={acceptingAuction.toLocaleString("en-IN")} />
        <KpiCard label="Accepting Instant" value={acceptingInstant.toLocaleString("en-IN")} />
        <KpiCard label="On Active Trip" value={onTrip.toLocaleString("en-IN")} />
      </div>

      <QueryState query={query} icon={MapPin} emptyLabel="No driver location data found." />
      {items.length > 0 && (
        <>
          <div className="hidden sm:block">
            <Card><CardContent className="p-0"><DataTable table={table} /></CardContent></Card>
          </div>
          <div className="sm:hidden space-y-2">
            {items.map((d) => (
              <Card key={d.driverId}>
                <CardContent className="p-3">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-sm font-medium text-gray-900">{d.driverName}</p>
                      <p className="text-xs text-gray-500">{d.phone}</p>
                      <p className="text-[11px] text-gray-400">{prettify(d.driverType)}</p>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Dot on={d.isOnline} />
                      <Dot on={d.isGpsEnabled} offColor="text-red-400" />
                    </div>
                  </div>
                  <div className="mt-1.5 flex items-center gap-3 text-[11px] text-gray-500">
                    {d.speedKmph !== null && <span>{Math.round(d.speedKmph)} km/h</span>}
                    {d.batteryLevel !== null && <span>{Math.round(d.batteryLevel * 100)}%</span>}
                    <span>{formatRelativeTime(d.updatedAt)}</span>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function prettify(value: string) {
  return value.split("_").map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join(" ");
}

function Dot({ on, offColor = "text-gray-300" }: { on: boolean; offColor?: string }) {
  return <span className={`inline-block h-2 w-2 rounded-full ${on ? "bg-emerald-500" : offColor}`} />;
}

function DataTable<T>({ table }: { table: ReturnType<typeof useReactTable<T>> }) {
  return (
    <Table>
      <TableHeader>
        {table.getHeaderGroups().map((hg) => (
          <TableRow key={hg.id} className="border-b border-gray-100 bg-gray-50/50">
            {hg.headers.map((h) => (
              <TableHead key={h.id} className="px-4 py-2.5 text-xs font-medium text-gray-500">
                {h.isPlaceholder ? null : flexRender(h.column.columnDef.header, h.getContext())}
              </TableHead>
            ))}
          </TableRow>
        ))}
      </TableHeader>
      <TableBody>
        {table.getRowModel().rows.map((row) => (
          <TableRow key={row.id} className="hover:bg-gray-50/50 transition-colors border-gray-50">
            {row.getVisibleCells().map((cell) => (
              <TableCell key={cell.id} className="px-4 py-3 text-sm">
                {flexRender(cell.column.columnDef.cell, cell.getContext())}
              </TableCell>
            ))}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function QueryState({
  query, icon: Icon, emptyLabel,
}: {
  query: { isLoading: boolean; isError: boolean; error: unknown; data?: { items: unknown[] } };
  icon: React.ComponentType<{ className?: string }>;
  emptyLabel: string;
}) {
  if (query.isLoading) return <Card><CardContent className="p-4 text-sm text-gray-500">Loading...</CardContent></Card>;
  if (query.isError) return <Card><CardContent className="p-4 text-sm text-red-600">{query.error instanceof Error ? query.error.message : "Error"}</CardContent></Card>;
  if (query.data && query.data.items.length === 0) {
    return <Card><CardContent className="p-6 text-center"><Icon className="h-8 w-8 text-gray-300 mx-auto mb-2" /><p className="text-sm text-gray-500">{emptyLabel}</p></CardContent></Card>;
  }
  return null;
}
