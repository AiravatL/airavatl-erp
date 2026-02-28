"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PageHeader } from "@/components/shared/page-header";
import { useAuth } from "@/lib/auth/auth-context";
import { listLeasedVehicles } from "@/lib/api/leased-vehicles";
import { listFleetVehicles, listFleetVendors } from "@/lib/api/fleet";
import { listVehicleMasterOptions } from "@/lib/api/vehicle-master";
import { queryKeys } from "@/lib/query/keys";
import { FIELD_LIMITS } from "@/lib/validation/client/field-limits";
import { Plus, Search, Phone, Truck, Building2, Gauge, AlertTriangle, UserRound } from "lucide-react";

type FleetTab = "all_vehicles" | "vendors" | "leased_vehicles";

const KYC_COLORS: Record<string, string> = {
  verified: "bg-emerald-50 text-emerald-700",
  pending: "bg-amber-50 text-amber-700",
  rejected: "bg-red-50 text-red-700",
};

const VEHICLE_STATUS_COLORS: Record<string, string> = {
  available: "bg-emerald-50 text-emerald-700",
  on_trip: "bg-blue-50 text-blue-700",
  maintenance: "bg-amber-50 text-amber-700",
};

const OWNERSHIP_COLORS = {
  leased: "bg-indigo-50 text-indigo-700",
  vendor: "bg-gray-100 text-gray-700",
  owner_driver: "bg-violet-50 text-violet-700",
} as const;

const WRITE_ROLES = ["admin", "super_admin"];

export default function FleetPage() {
  const { user } = useAuth();
  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState<FleetTab>("all_vehicles");
  const [allVehicleType, setAllVehicleType] = useState("all");
  const [allOwnershipKind, setAllOwnershipKind] = useState("all");
  const [vendorVehicleType, setVendorVehicleType] = useState("all");
  const [vendorKind, setVendorKind] = useState("all");
  const canWrite = !!user && WRITE_ROLES.includes(user.role);

  const vehicleMasterQuery = useQuery({
    queryKey: queryKeys.vehicleMasterOptions,
    queryFn: listVehicleMasterOptions,
    enabled: !!user,
  });

  const masterTypes = vehicleMasterQuery.data?.map((type) => type.name) ?? [];

  const fleetVehiclesQuery = useQuery({
    queryKey: queryKeys.fleetVehicles({
      search,
      ownershipKind: allOwnershipKind,
      vehicleType: allVehicleType,
    }),
    queryFn: () =>
      listFleetVehicles({
        search: search || undefined,
        ownershipKind:
          allOwnershipKind === "leased" || allOwnershipKind === "vendor" || allOwnershipKind === "owner_driver"
            ? allOwnershipKind
            : undefined,
        vehicleType: allVehicleType !== "all" ? allVehicleType : undefined,
        limit: 300,
      }),
    enabled: !!user && activeTab === "all_vehicles",
  });

  const fleetVendorsQuery = useQuery({
    queryKey: queryKeys.fleetVendors({
      search,
      vendorKind,
      vehicleType: vendorVehicleType,
    }),
    queryFn: () =>
      listFleetVendors({
        search: search || undefined,
        vendorKind: vendorKind === "vendor" || vendorKind === "owner_driver" ? vendorKind : undefined,
        vehicleType: vendorVehicleType !== "all" ? vendorVehicleType : undefined,
        limit: 300,
      }),
    enabled: !!user && activeTab === "vendors",
  });

  const leasedQuery = useQuery({
    queryKey: queryKeys.leasedVehicles({ search: search || undefined }),
    queryFn: () => listLeasedVehicles({ search: search || undefined, limit: 200 }),
    enabled: !!user && activeTab === "leased_vehicles",
  });

  const allVehicles = fleetVehiclesQuery.data ?? [];
  const vendors = fleetVendorsQuery.data ?? [];
  const leasedVehicles = leasedQuery.data ?? [];

  const allVehicleTypeOptions = Array.from(
    new Set([...masterTypes, ...allVehicles.map((vehicle) => vehicle.type)].filter(Boolean)),
  );

  const searchPlaceholder =
    activeTab === "vendors" ? "Search vendors..." : "Search vehicle number, type, vendor...";

  const getOwnershipMeta = (vehicle: { ownershipType: "leased" | "vendor"; isOwnerDriver: boolean }) => {
    if (vehicle.ownershipType === "leased") {
      return { label: "Leased", color: OWNERSHIP_COLORS.leased };
    }
    if (vehicle.isOwnerDriver) {
      return { label: "Owner Driver", color: OWNERSHIP_COLORS.owner_driver };
    }
    return { label: "Vendor", color: OWNERSHIP_COLORS.vendor };
  };

  return (
    <div className="p-4 sm:p-6 space-y-4">
      <PageHeader title="Fleet" description="Vehicles, vendors and leased fleet overview" />

      <div className="relative max-w-md">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
        <Input
          placeholder={searchPlaceholder}
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          className="h-8 pl-8 text-sm"
          maxLength={FIELD_LIMITS.search}
        />
      </div>

      <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as FleetTab)}>
        <TabsList className="bg-gray-100 h-8">
          <TabsTrigger value="all_vehicles" className="text-xs h-7 data-[state=active]:bg-white">
            All Vehicles
          </TabsTrigger>
          <TabsTrigger value="vendors" className="text-xs h-7 data-[state=active]:bg-white">
            Vendors
          </TabsTrigger>
          <TabsTrigger value="leased_vehicles" className="text-xs h-7 data-[state=active]:bg-white">
            Leased Vehicles
          </TabsTrigger>
        </TabsList>

        <TabsContent value="all_vehicles" className="mt-4 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <Select value={allVehicleType} onValueChange={setAllVehicleType}>
              <SelectTrigger className="h-8 w-[180px] text-xs">
                <SelectValue placeholder="Vehicle Type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Vehicle Types</SelectItem>
                {allVehicleTypeOptions.map((type) => (
                  <SelectItem key={type} value={type}>
                    {type}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={allOwnershipKind} onValueChange={setAllOwnershipKind}>
              <SelectTrigger className="h-8 w-[180px] text-xs">
                <SelectValue placeholder="Ownership" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Ownership</SelectItem>
                <SelectItem value="leased">Leased</SelectItem>
                <SelectItem value="vendor">Vendor</SelectItem>
                <SelectItem value="owner_driver">Owner Driver</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {fleetVehiclesQuery.isLoading && (
            <Card>
              <CardContent className="p-4">
                <p className="text-sm text-gray-500">Loading vehicles...</p>
              </CardContent>
            </Card>
          )}

          {!fleetVehiclesQuery.isLoading && fleetVehiclesQuery.isError && (
            <Card>
              <CardContent className="p-4">
                <p className="text-sm text-red-600">
                  {fleetVehiclesQuery.error instanceof Error
                    ? fleetVehiclesQuery.error.message
                    : "Unable to fetch vehicles"}
                </p>
              </CardContent>
            </Card>
          )}

          {!fleetVehiclesQuery.isLoading && !fleetVehiclesQuery.isError && allVehicles.length === 0 && (
            <Card>
              <CardContent className="p-6 text-center">
                <Truck className="h-8 w-8 text-gray-300 mx-auto mb-2" />
                <p className="text-sm text-gray-500">No vehicles found.</p>
              </CardContent>
            </Card>
          )}

          {!fleetVehiclesQuery.isLoading && !fleetVehiclesQuery.isError && allVehicles.length > 0 && (
            <>
              <div className="hidden sm:block">
                <Card>
                  <CardContent className="p-0">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-gray-100 bg-gray-50/50">
                          <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500">Vehicle No.</th>
                          <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500">Type</th>
                          <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500">Ownership</th>
                          <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500">Vendor / Owner</th>
                          <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500">Status</th>
                          <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500">Policy</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50">
                        {allVehicles.map((vehicle) => {
                          const ownership = getOwnershipMeta(vehicle);
                          return (
                          <tr key={vehicle.id} className="hover:bg-gray-50/50 transition-colors">
                            <td className="px-4 py-3 font-medium text-gray-900">{vehicle.number}</td>
                            <td className="px-4 py-3 text-gray-600">{vehicle.type}</td>
                            <td className="px-4 py-3">
                              <Badge
                                variant="outline"
                                className={`text-[10px] border-0 ${ownership.color}`}
                              >
                                {ownership.label}
                              </Badge>
                            </td>
                            <td className="px-4 py-3 text-gray-600">{vehicle.vendorName ?? "-"}</td>
                            <td className="px-4 py-3">
                              <Badge
                                variant="outline"
                                className={`text-[10px] border-0 ${VEHICLE_STATUS_COLORS[vehicle.status]}`}
                              >
                                {vehicle.status.replace("_", " ")}
                              </Badge>
                            </td>
                            <td className="px-4 py-3 text-xs text-gray-500">
                              {vehicle.ownershipType === "leased"
                                ? vehicle.hasPolicy
                                  ? "Configured"
                                  : "Not configured"
                                : "-"}
                            </td>
                          </tr>
                        )})}
                      </tbody>
                    </table>
                  </CardContent>
                </Card>
              </div>

              <div className="sm:hidden space-y-2">
                {allVehicles.map((vehicle) => {
                  const ownership = getOwnershipMeta(vehicle);
                  return (
                  <Card key={vehicle.id}>
                    <CardContent className="p-3">
                      <div className="flex items-start justify-between">
                        <div>
                          <p className="text-sm font-medium text-gray-900">{vehicle.number}</p>
                          <p className="text-xs text-gray-500">{vehicle.type}</p>
                          <p className="text-[11px] text-gray-400">{vehicle.vendorName ?? "No vendor assigned"}</p>
                        </div>
                        <Badge
                          variant="outline"
                          className={`text-[10px] border-0 ${VEHICLE_STATUS_COLORS[vehicle.status]}`}
                        >
                          {vehicle.status.replace("_", " ")}
                        </Badge>
                      </div>
                      <div className="mt-2 flex items-center gap-2">
                        <Badge
                          variant="outline"
                          className={`text-[10px] border-0 ${ownership.color}`}
                        >
                          {ownership.label}
                        </Badge>
                        {vehicle.ownershipType === "leased" && (
                          <span className="text-[11px] text-gray-500">
                            {vehicle.hasPolicy ? "Policy configured" : "Policy pending"}
                          </span>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                )})}
              </div>
            </>
          )}
        </TabsContent>

        <TabsContent value="vendors" className="mt-4 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <Select value={vendorKind} onValueChange={setVendorKind}>
              <SelectTrigger className="h-8 w-[180px] text-xs">
                <SelectValue placeholder="Vendor Type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Vendor Types</SelectItem>
                <SelectItem value="vendor">Vendors</SelectItem>
                <SelectItem value="owner_driver">Owner Driver</SelectItem>
              </SelectContent>
            </Select>
            <Select value={vendorVehicleType} onValueChange={setVendorVehicleType}>
              <SelectTrigger className="h-8 w-[180px] text-xs">
                <SelectValue placeholder="Vehicle Type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Vehicle Types</SelectItem>
                {masterTypes.map((type) => (
                  <SelectItem key={type} value={type}>
                    {type}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {fleetVendorsQuery.isLoading && (
            <Card>
              <CardContent className="p-4">
                <p className="text-sm text-gray-500">Loading vendors...</p>
              </CardContent>
            </Card>
          )}

          {!fleetVendorsQuery.isLoading && fleetVendorsQuery.isError && (
            <Card>
              <CardContent className="p-4">
                <p className="text-sm text-red-600">
                  {fleetVendorsQuery.error instanceof Error
                    ? fleetVendorsQuery.error.message
                    : "Unable to fetch vendors"}
                </p>
              </CardContent>
            </Card>
          )}

          {!fleetVendorsQuery.isLoading && !fleetVendorsQuery.isError && vendors.length === 0 && (
            <Card>
              <CardContent className="p-6 text-center">
                <Building2 className="h-8 w-8 text-gray-300 mx-auto mb-2" />
                <p className="text-sm text-gray-500">No vendors found.</p>
              </CardContent>
            </Card>
          )}

          {!fleetVendorsQuery.isLoading && !fleetVendorsQuery.isError && vendors.length > 0 && (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {vendors.map((vendor) => (
                <Card key={vendor.id} className="hover:bg-gray-50/50 transition-colors">
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gray-100">
                          <Building2 className="h-4 w-4 text-gray-500" />
                        </div>
                        <div>
                          <p className="text-sm font-medium text-gray-900">{vendor.name}</p>
                          <p className="text-[11px] text-gray-500 flex items-center gap-1">
                            <Phone className="h-3 w-3" /> {vendor.contactPhone ?? "-"}
                          </p>
                        </div>
                      </div>
                      <Badge variant="outline" className={`text-[10px] border-0 ${KYC_COLORS[vendor.kycStatus]}`}>
                        {vendor.kycStatus}
                      </Badge>
                    </div>

                    <div className="flex items-center justify-between mt-3 gap-2">
                      <div className="flex items-center gap-3 text-xs text-gray-500">
                        <span>
                          <Truck className="h-3 w-3 inline mr-1" />
                          {vendor.vehiclesCount} vehicles
                        </span>
                        {!vendor.isOwnerDriver && (
                          <span>
                            <UserRound className="h-3 w-3 inline mr-1" />
                            {vendor.driversCount} drivers
                          </span>
                        )}
                      </div>
                      <Badge
                        variant="outline"
                        className={`text-[10px] border-0 ${vendor.isOwnerDriver ? "bg-indigo-50 text-indigo-700" : "bg-gray-100 text-gray-700"}`}
                      >
                        {vendor.isOwnerDriver ? "Owner Driver" : "Vendor"}
                      </Badge>
                    </div>

                    {vendor.notes && (
                      <p className="text-[11px] text-gray-400 mt-2 line-clamp-2">{vendor.notes}</p>
                    )}

                    <div className="mt-3 pt-3 border-t border-gray-100 flex justify-end">
                      <Button asChild size="sm" variant="outline" className="h-7 text-[11px]">
                        <Link href={`/vendors/vendor/${vendor.id}`}>Manage</Link>
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="leased_vehicles" className="mt-4 space-y-3">
          {canWrite && (
            <div className="flex justify-end">
              <Button size="sm" className="h-8 text-xs gap-1.5" asChild>
                <Link href="/vendors/leased/new">
                  <Plus className="h-3.5 w-3.5" /> Add Leased Vehicle
                </Link>
              </Button>
            </div>
          )}

          {leasedQuery.isLoading && (
            <Card>
              <CardContent className="p-4">
                <p className="text-sm text-gray-500">Loading leased vehicles...</p>
              </CardContent>
            </Card>
          )}

          {!leasedQuery.isLoading && leasedQuery.isError && (
            <Card>
              <CardContent className="p-4">
                <p className="text-sm text-red-600">
                  {leasedQuery.error instanceof Error
                    ? leasedQuery.error.message
                    : "Unable to fetch leased vehicles"}
                </p>
              </CardContent>
            </Card>
          )}

          {!leasedQuery.isLoading && !leasedQuery.isError && leasedVehicles.length === 0 && (
            <Card>
              <CardContent className="p-6 text-center">
                <Truck className="h-8 w-8 text-gray-300 mx-auto mb-2" />
                <p className="text-sm text-gray-500 mb-3">No leased vehicles found.</p>
                {canWrite && (
                  <Button size="sm" className="h-8 text-xs" asChild>
                    <Link href="/vendors/leased/new">Add your first leased vehicle</Link>
                  </Button>
                )}
              </CardContent>
            </Card>
          )}

          {!leasedQuery.isLoading && !leasedQuery.isError && leasedVehicles.length > 0 && (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {leasedVehicles.map((vehicle) => (
                <Link key={vehicle.id} href={`/vendors/${vehicle.id}`}>
                  <Card className="hover:bg-gray-50/50 transition-colors cursor-pointer">
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-50">
                            <Truck className="h-4 w-4 text-indigo-600" />
                          </div>
                          <div>
                            <p className="text-sm font-medium text-gray-900">{vehicle.number}</p>
                            <p className="text-[11px] text-gray-500">
                              {vehicle.type}
                              {vehicle.vehicleLength ? ` · ${vehicle.vehicleLength}` : ""}
                              {vehicle.vendorName ? ` · ${vehicle.vendorName}` : ""}
                            </p>
                          </div>
                        </div>
                        <Badge variant="outline" className={`text-[10px] border-0 ${VEHICLE_STATUS_COLORS[vehicle.status]}`}>
                          {vehicle.status.replace("_", " ")}
                        </Badge>
                      </div>

                      {vehicle.policyId ? (
                        <div className="space-y-2 mt-3">
                          <div className="flex items-center justify-between text-[11px] pt-2 border-t border-gray-100">
                            <span className="text-gray-400">
                              DA: ₹{vehicle.driverDaPerDay.toLocaleString("en-IN")}/day
                            </span>
                            <span className="text-gray-400">
                              Rent: ₹{vehicle.vehicleRentPerDay.toLocaleString("en-IN")}/day
                            </span>
                          </div>
                          <div className="flex items-center gap-1 text-[11px] text-gray-400">
                            <Gauge className="h-3 w-3" />
                            <span>
                              Mileage: {vehicle.mileageMin}-{vehicle.mileageMax} km/l ({vehicle.defaultTerrain})
                            </span>
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1.5 mt-3 text-xs text-amber-600">
                          <AlertTriangle className="h-3.5 w-3.5" />
                          No policy configured
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
