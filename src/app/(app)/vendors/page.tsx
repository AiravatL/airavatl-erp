"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import {
  useReactTable,
  getCoreRowModel,
  flexRender,
  createColumnHelper,
} from "@tanstack/react-table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from "@/components/ui/table";
import { PageHeader } from "@/components/shared/page-header";
import { useAuth } from "@/lib/auth/auth-context";
import { listAppUsers, type AppUser } from "@/lib/api/fleet-users";
import { queryKeys } from "@/lib/query/keys";
import { FIELD_LIMITS } from "@/lib/validation/client/field-limits";
import { Search, Truck, Building2, UserRound } from "lucide-react";

type FleetTab = "drivers" | "transporters";

/* ---------- Column definitions ---------- */

const driverCol = createColumnHelper<AppUser>();

const driverColumns = [
  driverCol.accessor("fullName", {
    header: "Name",
    cell: (info) => (
      <Link
        href={`/vendors/user/${info.row.original.id}`}
        className="font-medium text-gray-900 hover:underline"
      >
        {info.getValue()}
      </Link>
    ),
  }),
  driverCol.accessor("phone", {
    header: "Phone",
    cell: (info) => <span className="text-gray-600">{info.getValue()}</span>,
  }),
  driverCol.accessor("city", {
    header: "City",
    cell: (info) => (
      <span className="text-gray-600">{info.getValue() ?? "—"}</span>
    ),
  }),
  driverCol.accessor("vehicleNumber", {
    header: "Vehicle",
    cell: (info) => {
      const number = info.getValue();
      const type = info.row.original.vehicleType;
      if (!number) return <span className="text-gray-300">—</span>;
      return (
        <span className="text-gray-600">
          {number} <span className="text-gray-400">&middot;</span> {type}
        </span>
      );
    },
  }),
  driverCol.accessor("documentsVerified", {
    header: "Docs Status",
    cell: (info) => <DocsBadge verified={info.getValue()} />,
  }),
];

const transporterCol = createColumnHelper<AppUser>();

const transporterColumns = [
  transporterCol.accessor("accountName", {
    header: "Organization",
    cell: (info) => (
      <Link
        href={`/vendors/user/${info.row.original.id}`}
        className="font-medium text-gray-900 hover:underline"
      >
        {info.getValue() ?? info.row.original.fullName}
      </Link>
    ),
  }),
  transporterCol.accessor("fullName", {
    header: "Name",
    cell: (info) => <span className="text-gray-600">{info.getValue()}</span>,
  }),
  transporterCol.accessor("phone", {
    header: "Phone",
    cell: (info) => <span className="text-gray-600">{info.getValue()}</span>,
  }),
  transporterCol.accessor("city", {
    header: "City",
    cell: (info) => (
      <span className="text-gray-600">{info.getValue() ?? "—"}</span>
    ),
  }),
  transporterCol.accessor("documentsVerified", {
    header: "Docs Status",
    cell: (info) => <DocsBadge verified={info.getValue()} />,
  }),
];

/* ---------- Page ---------- */

export default function FleetPage() {
  const { user } = useAuth();
  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState<FleetTab>("drivers");

  const driverFilters = {
    userType: "individual_driver",
    search: search || undefined,
    limit: 200,
  };
  const transporterFilters = {
    userType: "transporter",
    search: search || undefined,
    limit: 200,
  };

  const driversQuery = useQuery({
    queryKey: queryKeys.fleetAppUsers(driverFilters),
    queryFn: () => listAppUsers(driverFilters),
    enabled: !!user,
  });

  const transportersQuery = useQuery({
    queryKey: queryKeys.fleetAppUsers(transporterFilters),
    queryFn: () => listAppUsers(transporterFilters),
    enabled: !!user,
  });

  const driverCount = driversQuery.data?.total ?? 0;
  const transporterCount = transportersQuery.data?.total ?? 0;
  const drivers = driversQuery.data?.items ?? [];
  const transporters = transportersQuery.data?.items ?? [];

  const driverTable = useReactTable({
    data: drivers,
    columns: driverColumns,
    getCoreRowModel: getCoreRowModel(),
  });

  const transporterTable = useReactTable({
    data: transporters,
    columns: transporterColumns,
    getCoreRowModel: getCoreRowModel(),
  });

  return (
    <div className="p-4 sm:p-6 space-y-4">
      <PageHeader title="Fleet" description="Partner app drivers and transporters" />

      {/* Stat cards */}
      <div className="grid grid-cols-2 gap-3 sm:max-w-md">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-50">
                <UserRound className="h-4 w-4 text-blue-600" />
              </div>
              <div>
                <p className="text-2xl font-semibold text-gray-900">{driverCount}</p>
                <p className="text-xs text-gray-500">Individual Drivers</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-purple-50">
                <Building2 className="h-4 w-4 text-purple-600" />
              </div>
              <div>
                <p className="text-2xl font-semibold text-gray-900">{transporterCount}</p>
                <p className="text-xs text-gray-500">Transporters</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Search */}
      <div className="relative max-w-md">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
        <Input
          placeholder="Search by name, phone..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="h-8 pl-8 text-sm"
          maxLength={FIELD_LIMITS.search}
        />
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as FleetTab)}>
        <TabsList className="bg-gray-100 h-8">
          <TabsTrigger value="drivers" className="text-xs h-7 data-[state=active]:bg-white">
            Drivers
          </TabsTrigger>
          <TabsTrigger value="transporters" className="text-xs h-7 data-[state=active]:bg-white">
            Transporters
          </TabsTrigger>
        </TabsList>

        {/* Drivers Tab */}
        <TabsContent value="drivers" className="mt-4 space-y-3">
          <ListState query={driversQuery} emptyIcon={UserRound} emptyLabel="No drivers found." />
          {!driversQuery.isLoading && !driversQuery.isError && drivers.length > 0 && (
            <>
              {/* Desktop table */}
              <div className="hidden sm:block">
                <Card>
                  <CardContent className="p-0">
                    <DataTable table={driverTable} />
                  </CardContent>
                </Card>
              </div>
              {/* Mobile cards */}
              <div className="sm:hidden space-y-2">
                {drivers.map((d) => (
                  <Link key={d.id} href={`/vendors/user/${d.id}`}>
                    <Card className="hover:bg-gray-50/50 transition-colors">
                      <CardContent className="p-3">
                        <div className="flex items-start justify-between">
                          <div>
                            <p className="text-sm font-medium text-gray-900">{d.fullName}</p>
                            <p className="text-xs text-gray-500">{d.phone}</p>
                            {d.city && <p className="text-[11px] text-gray-400">{d.city}</p>}
                          </div>
                          <DocsBadge verified={d.documentsVerified} />
                        </div>
                        {d.vehicleNumber && (
                          <p className="text-[11px] text-gray-500 mt-1.5">
                            <Truck className="h-3 w-3 inline mr-1" />
                            {d.vehicleNumber} &middot; {d.vehicleType}
                          </p>
                        )}
                      </CardContent>
                    </Card>
                  </Link>
                ))}
              </div>
            </>
          )}
        </TabsContent>

        {/* Transporters Tab */}
        <TabsContent value="transporters" className="mt-4 space-y-3">
          <ListState query={transportersQuery} emptyIcon={Building2} emptyLabel="No transporters found." />
          {!transportersQuery.isLoading && !transportersQuery.isError && transporters.length > 0 && (
            <>
              {/* Desktop table */}
              <div className="hidden sm:block">
                <Card>
                  <CardContent className="p-0">
                    <DataTable table={transporterTable} />
                  </CardContent>
                </Card>
              </div>
              {/* Mobile cards */}
              <div className="sm:hidden space-y-2">
                {transporters.map((t) => (
                  <Link key={t.id} href={`/vendors/user/${t.id}`}>
                    <Card className="hover:bg-gray-50/50 transition-colors">
                      <CardContent className="p-3">
                        <div className="flex items-start justify-between">
                          <div>
                            <p className="text-sm font-medium text-gray-900">{t.accountName ?? t.fullName}</p>
                            <p className="text-xs text-gray-500">{t.fullName}</p>
                            <p className="text-[11px] text-gray-400">{t.phone}</p>
                            {t.city && <p className="text-[11px] text-gray-400">{t.city}</p>}
                          </div>
                          <DocsBadge verified={t.documentsVerified} />
                        </div>
                      </CardContent>
                    </Card>
                  </Link>
                ))}
              </div>
            </>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

/* ---------- Shared components ---------- */

function DataTable<T>({ table }: { table: ReturnType<typeof useReactTable<T>> }) {
  return (
    <Table>
      <TableHeader>
        {table.getHeaderGroups().map((headerGroup) => (
          <TableRow key={headerGroup.id} className="border-b border-gray-100 bg-gray-50/50">
            {headerGroup.headers.map((header) => (
              <TableHead key={header.id} className="px-4 py-2.5 text-xs font-medium text-gray-500">
                {header.isPlaceholder
                  ? null
                  : flexRender(header.column.columnDef.header, header.getContext())}
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

function DocsBadge({ verified }: { verified: boolean | null }) {
  if (verified === true) {
    return (
      <Badge variant="outline" className="text-[10px] border-0 bg-emerald-50 text-emerald-700">
        Verified
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="text-[10px] border-0 bg-amber-50 text-amber-700">
      Pending
    </Badge>
  );
}

function ListState({
  query,
  emptyIcon: Icon,
  emptyLabel,
}: {
  query: { isLoading: boolean; isError: boolean; error: unknown; data?: { items: unknown[] } };
  emptyIcon: React.ComponentType<{ className?: string }>;
  emptyLabel: string;
}) {
  if (query.isLoading) {
    return (
      <Card>
        <CardContent className="p-4">
          <p className="text-sm text-gray-500">Loading...</p>
        </CardContent>
      </Card>
    );
  }
  if (query.isError) {
    return (
      <Card>
        <CardContent className="p-4">
          <p className="text-sm text-red-600">
            {query.error instanceof Error ? query.error.message : "Unable to fetch data"}
          </p>
        </CardContent>
      </Card>
    );
  }
  if (query.data && query.data.items.length === 0) {
    return (
      <Card>
        <CardContent className="p-6 text-center">
          <Icon className="h-8 w-8 text-gray-300 mx-auto mb-2" />
          <p className="text-sm text-gray-500">{emptyLabel}</p>
        </CardContent>
      </Card>
    );
  }
  return null;
}
