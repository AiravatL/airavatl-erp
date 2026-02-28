"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Loader2, Plus, UserRound, Truck } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PageHeader } from "@/components/shared/page-header";
import { useAuth } from "@/lib/auth/auth-context";
import {
  assignFleetVehicleDriver,
  createFleetVendorDriver,
  createFleetVendorVehicle,
  getFleetVendor,
  listFleetVendorDrivers,
  listFleetVendorVehicles,
  setFleetVendorDriverActive,
  updateFleetVendorDriver,
  updateFleetVendorVehicle,
} from "@/lib/api/fleet";
import { listVehicleMasterOptions } from "@/lib/api/vehicle-master";
import { queryKeys } from "@/lib/query/keys";

const WRITE_ROLES = ["super_admin", "admin", "operations_vehicles"];

const STATUS_COLORS: Record<string, string> = {
  available: "bg-emerald-50 text-emerald-700",
  on_trip: "bg-blue-50 text-blue-700",
  maintenance: "bg-amber-50 text-amber-700",
};

export default function VendorDetailPage() {
  const { user } = useAuth();
  const router = useRouter();
  const params = useParams<{ vendorId: string }>();
  const vendorId = params.vendorId;
  const canWrite = !!user && WRITE_ROLES.includes(user.role);
  const queryClient = useQueryClient();

  const [driverForm, setDriverForm] = useState({
    fullName: "",
    phone: "",
    alternatePhone: "",
  });
  const [vehicleForm, setVehicleForm] = useState({
    number: "",
    type: "",
    vehicleLength: "",
  });
  const [vehicleDriverSelection, setVehicleDriverSelection] = useState<Record<string, string>>({});
  const [editingDriverId, setEditingDriverId] = useState<string | null>(null);
  const [driverEditForm, setDriverEditForm] = useState({
    fullName: "",
    phone: "",
    alternatePhone: "",
  });
  const [editingVehicleId, setEditingVehicleId] = useState<string | null>(null);
  const [vehicleEditForm, setVehicleEditForm] = useState({
    number: "",
    type: "",
    vehicleLength: "",
  });

  const vendorQuery = useQuery({
    queryKey: queryKeys.fleetVendor(vendorId),
    queryFn: () => getFleetVendor(vendorId),
    enabled: !!vendorId,
  });

  const driversQuery = useQuery({
    queryKey: queryKeys.fleetVendorDrivers(vendorId, {}),
    queryFn: () => listFleetVendorDrivers(vendorId),
    enabled: !!vendorId,
  });

  const vehiclesQuery = useQuery({
    queryKey: queryKeys.fleetVendorVehicles(vendorId, {}),
    queryFn: () => listFleetVendorVehicles(vendorId),
    enabled: !!vendorId,
  });

  const vehicleMasterQuery = useQuery({
    queryKey: queryKeys.vehicleMasterOptions,
    queryFn: listVehicleMasterOptions,
    enabled: canWrite,
  });

  const typeOptions = useMemo(() => {
    const fromMaster = vehicleMasterQuery.data?.map((item) => item.name) ?? [];
    const fromVehicles = (vehiclesQuery.data ?? []).map((item) => item.type);
    return Array.from(new Set([...fromMaster, ...fromVehicles].filter(Boolean)));
  }, [vehicleMasterQuery.data, vehiclesQuery.data]);

  const lengthOptions = useMemo(() => {
    if (!vehicleForm.type) return [];
    const selected = vehicleMasterQuery.data?.find((item) => item.name === vehicleForm.type);
    return selected?.lengths?.map((item) => item.value) ?? [];
  }, [vehicleMasterQuery.data, vehicleForm.type]);

  const createDriverMutation = useMutation({
    mutationFn: () =>
      createFleetVendorDriver(vendorId, {
        fullName: driverForm.fullName,
        phone: driverForm.phone,
        alternatePhone: driverForm.alternatePhone || null,
        isOwnerDriver: false,
      }),
    onSuccess: async () => {
      setDriverForm({ fullName: "", phone: "", alternatePhone: "" });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.fleetVendor(vendorId) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.fleetVendorDrivers(vendorId, {}) }),
      ]);
    },
  });

  const createVehicleMutation = useMutation({
    mutationFn: () =>
      createFleetVendorVehicle(vendorId, {
        number: vehicleForm.number.toUpperCase(),
        type: vehicleForm.type,
        vehicleLength: vehicleForm.vehicleLength || null,
      }),
    onSuccess: async () => {
      setVehicleForm({ number: "", type: "", vehicleLength: "" });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.fleetVendor(vendorId) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.fleetVendorVehicles(vendorId, {}) }),
        queryClient.invalidateQueries({ queryKey: ["fleet", "vehicles"] }),
      ]);
    },
  });

  const assignDriverMutation = useMutation({
    mutationFn: ({ vehicleId, driverId }: { vehicleId: string; driverId: string }) =>
      assignFleetVehicleDriver(vehicleId, driverId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.fleetVendorVehicles(vendorId, {}) });
    },
  });

  const updateDriverMutation = useMutation({
    mutationFn: (input: { driverId: string; fullName: string; phone: string; alternatePhone?: string }) =>
      updateFleetVendorDriver(input.driverId, {
        fullName: input.fullName,
        phone: input.phone,
        alternatePhone: input.alternatePhone || null,
      }),
    onSuccess: async () => {
      setEditingDriverId(null);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.fleetVendor(vendorId) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.fleetVendorDrivers(vendorId, {}) }),
      ]);
    },
  });

  const setDriverActiveMutation = useMutation({
    mutationFn: (input: { driverId: string; active: boolean }) => setFleetVendorDriverActive(input.driverId, input.active),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.fleetVendor(vendorId) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.fleetVendorDrivers(vendorId, {}) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.fleetVendorVehicles(vendorId, {}) }),
      ]);
    },
  });

  const updateVehicleMutation = useMutation({
    mutationFn: (input: { vehicleId: string; number: string; type: string; vehicleLength?: string }) =>
      updateFleetVendorVehicle(input.vehicleId, {
        number: input.number,
        type: input.type,
        vehicleLength: input.vehicleLength || null,
      }),
    onSuccess: async () => {
      setEditingVehicleId(null);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.fleetVendor(vendorId) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.fleetVendorVehicles(vendorId, {}) }),
        queryClient.invalidateQueries({ queryKey: ["fleet", "vehicles"] }),
      ]);
    },
  });

  if (vendorQuery.isLoading) {
    return (
      <div className="p-4 sm:p-6">
        <p className="text-sm text-gray-500">Loading vendor...</p>
      </div>
    );
  }

  if (vendorQuery.isError || !vendorQuery.data) {
    return (
      <div className="p-4 sm:p-6 space-y-2">
        <p className="text-sm text-red-600">
          {vendorQuery.error instanceof Error ? vendorQuery.error.message : "Unable to fetch vendor"}
        </p>
        <Link href="/vendors" className="text-sm text-blue-600 hover:underline">
          Back to Fleet
        </Link>
      </div>
    );
  }

  const vendor = vendorQuery.data;
  const drivers = driversQuery.data ?? [];
  const vehicles = vehiclesQuery.data ?? [];
  const canAddDriver = canWrite && (!vendor.isOwnerDriver || drivers.length === 0);
  const canAddVehicle = canWrite && (!vendor.isOwnerDriver || vehicles.length === 0);

  return (
    <div className="p-4 sm:p-6 space-y-4">
      <div className="flex items-center gap-2 text-sm">
        <button onClick={() => router.push("/vendors")} className="flex items-center gap-1 text-gray-500 hover:text-gray-700">
          <ArrowLeft className="h-4 w-4" />
          Fleet
        </button>
        <span className="text-gray-300">/</span>
        <span className="text-gray-700">{vendor.name}</span>
      </div>

      <PageHeader title={vendor.name} description="Manage vehicles and drivers for this vendor" />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-gray-500">Vehicles</p>
            <p className="text-xl font-semibold text-gray-900 mt-1">{vendor.vehiclesCount}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-gray-500">Drivers</p>
            <p className="text-xl font-semibold text-gray-900 mt-1">{vendor.driversCount}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-gray-500">Type</p>
            <div className="mt-2">
              <Badge variant="outline" className={`border-0 text-[11px] ${vendor.isOwnerDriver ? "bg-indigo-50 text-indigo-700" : "bg-gray-100 text-gray-700"}`}>
                {vendor.isOwnerDriver ? "Owner Driver" : "Vendor"}
              </Badge>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <UserRound className="h-4 w-4" />
              Drivers
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {canAddDriver && (
              <div className="space-y-3 rounded-md border border-gray-100 p-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <Label className="text-xs">Full Name</Label>
                    <Input
                      value={driverForm.fullName}
                      onChange={(event) => setDriverForm((prev) => ({ ...prev, fullName: event.target.value }))}
                      className="h-8 text-sm"
                      maxLength={120}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Phone</Label>
                    <Input
                      value={driverForm.phone}
                      onChange={(event) => setDriverForm((prev) => ({ ...prev, phone: event.target.value }))}
                      className="h-8 text-sm"
                      maxLength={20}
                    />
                  </div>
                  <div className="space-y-1 sm:col-span-2">
                    <Label className="text-xs">Alternate Phone</Label>
                    <Input
                      value={driverForm.alternatePhone}
                      onChange={(event) => setDriverForm((prev) => ({ ...prev, alternatePhone: event.target.value }))}
                      className="h-8 text-sm"
                      maxLength={20}
                    />
                  </div>
                </div>
                <Button
                  size="sm"
                  className="h-8 text-xs"
                  onClick={() => createDriverMutation.mutate()}
                  disabled={createDriverMutation.isPending || !driverForm.fullName.trim() || !driverForm.phone.trim()}
                >
                  {createDriverMutation.isPending ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Plus className="h-3.5 w-3.5 mr-1" />}
                  Add Driver
                </Button>
                {createDriverMutation.isError && (
                  <p className="text-xs text-red-600">
                    {createDriverMutation.error instanceof Error ? createDriverMutation.error.message : "Unable to add driver"}
                  </p>
                )}
              </div>
            )}
            {canWrite && !canAddDriver && (
              <div className="rounded-md border border-indigo-100 bg-indigo-50 px-3 py-2">
                <p className="text-xs text-indigo-700">
                  Owner Driver vendor allows only one driver.
                </p>
              </div>
            )}

            <div className="space-y-2">
              {driversQuery.isLoading && <p className="text-sm text-gray-500">Loading drivers...</p>}
              {!driversQuery.isLoading && drivers.length === 0 && (
                <p className="text-sm text-gray-500">No drivers added yet.</p>
              )}
              {drivers.map((driver) => (
                <div key={driver.id} className="rounded-md border border-gray-100 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-medium text-gray-900">{driver.fullName}</p>
                    <div className="flex items-center gap-1.5">
                      {driver.isOwnerDriver && (
                        <Badge variant="outline" className="border-0 text-[10px] bg-indigo-50 text-indigo-700">
                          Owner
                        </Badge>
                      )}
                      <Badge variant="outline" className={`border-0 text-[10px] ${driver.active ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}>
                        {driver.active ? "Active" : "Inactive"}
                      </Badge>
                    </div>
                  </div>
                  <p className="text-xs text-gray-500 mt-1">{driver.phone}{driver.alternatePhone ? ` · ${driver.alternatePhone}` : ""}</p>

                  {canWrite && (
                    <div className="mt-2 flex flex-wrap gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-[11px]"
                        onClick={() => {
                          setEditingDriverId(driver.id);
                          setDriverEditForm({
                            fullName: driver.fullName,
                            phone: driver.phone,
                            alternatePhone: driver.alternatePhone ?? "",
                          });
                        }}
                      >
                        Edit
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-[11px]"
                        onClick={() =>
                          setDriverActiveMutation.mutate({
                            driverId: driver.id,
                            active: !driver.active,
                          })
                        }
                        disabled={setDriverActiveMutation.isPending}
                      >
                        {driver.active ? "Deactivate" : "Activate"}
                      </Button>
                    </div>
                  )}

                  {editingDriverId === driver.id && (
                    <div className="mt-3 space-y-2 border-t border-gray-100 pt-3">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <Input
                          value={driverEditForm.fullName}
                          onChange={(event) =>
                            setDriverEditForm((prev) => ({ ...prev, fullName: event.target.value }))
                          }
                          className="h-8 text-sm"
                          maxLength={120}
                        />
                        <Input
                          value={driverEditForm.phone}
                          onChange={(event) =>
                            setDriverEditForm((prev) => ({ ...prev, phone: event.target.value }))
                          }
                          className="h-8 text-sm"
                          maxLength={20}
                        />
                        <Input
                          value={driverEditForm.alternatePhone}
                          onChange={(event) =>
                            setDriverEditForm((prev) => ({ ...prev, alternatePhone: event.target.value }))
                          }
                          className="h-8 text-sm sm:col-span-2"
                          placeholder="Alternate phone (optional)"
                          maxLength={20}
                        />
                      </div>
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          className="h-7 text-[11px]"
                          disabled={updateDriverMutation.isPending || !driverEditForm.fullName.trim() || !driverEditForm.phone.trim()}
                          onClick={() =>
                            updateDriverMutation.mutate({
                              driverId: driver.id,
                              fullName: driverEditForm.fullName.trim(),
                              phone: driverEditForm.phone.trim(),
                              alternatePhone: driverEditForm.alternatePhone.trim(),
                            })
                          }
                        >
                          Save
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-[11px]"
                          onClick={() => setEditingDriverId(null)}
                        >
                          Cancel
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
            {(updateDriverMutation.isError || setDriverActiveMutation.isError) && (
              <p className="text-xs text-red-600">
                {updateDriverMutation.error instanceof Error
                  ? updateDriverMutation.error.message
                  : setDriverActiveMutation.error instanceof Error
                    ? setDriverActiveMutation.error.message
                    : "Unable to update driver"}
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Truck className="h-4 w-4" />
              Vehicles
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {canAddVehicle && (
              <div className="space-y-3 rounded-md border border-gray-100 p-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <Label className="text-xs">Vehicle Number</Label>
                    <Input
                      value={vehicleForm.number}
                      onChange={(event) =>
                        setVehicleForm((prev) => ({ ...prev, number: event.target.value.toUpperCase() }))
                      }
                      className="h-8 text-sm uppercase"
                      maxLength={20}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Vehicle Type</Label>
                    <Select
                      value={vehicleForm.type}
                      onValueChange={(value) => setVehicleForm((prev) => ({ ...prev, type: value, vehicleLength: "" }))}
                    >
                      <SelectTrigger className="h-8 text-sm">
                        <SelectValue placeholder="Select type" />
                      </SelectTrigger>
                      <SelectContent>
                        {typeOptions.map((type) => (
                          <SelectItem key={type} value={type}>
                            {type}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1 sm:col-span-2">
                    <Label className="text-xs">Vehicle Length</Label>
                    <Select
                      value={vehicleForm.vehicleLength || "_none"}
                      onValueChange={(value) =>
                        setVehicleForm((prev) => ({ ...prev, vehicleLength: value === "_none" ? "" : value }))
                      }
                      disabled={!vehicleForm.type}
                    >
                      <SelectTrigger className="h-8 text-sm">
                        <SelectValue placeholder="Select length" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="_none">None</SelectItem>
                        {lengthOptions.map((length) => (
                          <SelectItem key={length} value={length}>
                            {length}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <Button
                  size="sm"
                  className="h-8 text-xs"
                  onClick={() => createVehicleMutation.mutate()}
                  disabled={createVehicleMutation.isPending || !vehicleForm.number.trim() || !vehicleForm.type.trim()}
                >
                  {createVehicleMutation.isPending ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Plus className="h-3.5 w-3.5 mr-1" />}
                  Add Vehicle
                </Button>
                {createVehicleMutation.isError && (
                  <p className="text-xs text-red-600">
                    {createVehicleMutation.error instanceof Error ? createVehicleMutation.error.message : "Unable to add vehicle"}
                  </p>
                )}
              </div>
            )}
            {canWrite && !canAddVehicle && (
              <div className="rounded-md border border-indigo-100 bg-indigo-50 px-3 py-2">
                <p className="text-xs text-indigo-700">
                  Owner Driver vendor allows only one vehicle.
                </p>
              </div>
            )}

            <div className="space-y-2">
              {vehiclesQuery.isLoading && <p className="text-sm text-gray-500">Loading vehicles...</p>}
              {!vehiclesQuery.isLoading && vehicles.length === 0 && (
                <p className="text-sm text-gray-500">No vehicles added yet.</p>
              )}
              {vehicles.map((vehicle) => {
                const selectedDriver =
                  vehicleDriverSelection[vehicle.id] ??
                  vehicle.currentDriverId ??
                  drivers[0]?.id ??
                  "";
                return (
                  <div key={vehicle.id} className="rounded-md border border-gray-100 p-3 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-sm font-medium text-gray-900">{vehicle.number}</p>
                        <p className="text-xs text-gray-500">
                          {vehicle.type}
                          {vehicle.vehicleLength ? ` · ${vehicle.vehicleLength}` : ""}
                        </p>
                        <p className="text-xs text-gray-400 mt-0.5">
                          Current driver: {vehicle.currentDriverName || "Not assigned"}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className={`border-0 text-[10px] ${STATUS_COLORS[vehicle.status] ?? "bg-gray-100 text-gray-700"}`}>
                          {vehicle.status.replace("_", " ")}
                        </Badge>
                        {canWrite && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-[11px]"
                            onClick={() => {
                              setEditingVehicleId(vehicle.id);
                              setVehicleEditForm({
                                number: vehicle.number,
                                type: vehicle.type,
                                vehicleLength: vehicle.vehicleLength ?? "",
                              });
                            }}
                          >
                            Edit
                          </Button>
                        )}
                      </div>
                    </div>

                    {canWrite && !vendor.isOwnerDriver && drivers.length > 0 && (
                      <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
                        <Select
                          value={selectedDriver}
                          onValueChange={(value) =>
                            setVehicleDriverSelection((prev) => ({ ...prev, [vehicle.id]: value }))
                          }
                        >
                          <SelectTrigger className="h-8 text-sm sm:w-[240px]">
                            <SelectValue placeholder="Select driver" />
                          </SelectTrigger>
                          <SelectContent>
                            {drivers.map((driver) => (
                              <SelectItem key={driver.id} value={driver.id}>
                                {driver.fullName} · {driver.phone}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-8 text-xs"
                          disabled={!selectedDriver || assignDriverMutation.isPending}
                          onClick={() =>
                            assignDriverMutation.mutate({
                              vehicleId: vehicle.id,
                              driverId: selectedDriver,
                            })
                          }
                        >
                          {assignDriverMutation.isPending ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : null}
                          Set Driver
                        </Button>
                      </div>
                    )}
                    {canWrite && vendor.isOwnerDriver && (
                      <p className="text-xs text-gray-500">
                        Owner Driver vendor uses its owner as driver.
                      </p>
                    )}

                    {editingVehicleId === vehicle.id && (
                      <div className="mt-2 space-y-2 border-t border-gray-100 pt-3">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          <Input
                            value={vehicleEditForm.number}
                            onChange={(event) =>
                              setVehicleEditForm((prev) => ({ ...prev, number: event.target.value.toUpperCase() }))
                            }
                            className="h-8 text-sm uppercase"
                            maxLength={20}
                          />
                          <Select
                            value={vehicleEditForm.type}
                            onValueChange={(value) =>
                              setVehicleEditForm((prev) => ({ ...prev, type: value, vehicleLength: "" }))
                            }
                          >
                            <SelectTrigger className="h-8 text-sm">
                              <SelectValue placeholder="Select type" />
                            </SelectTrigger>
                            <SelectContent>
                              {typeOptions.map((type) => (
                                <SelectItem key={type} value={type}>
                                  {type}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <div className="sm:col-span-2">
                            <Select
                              value={vehicleEditForm.vehicleLength || "_none"}
                              onValueChange={(value) =>
                                setVehicleEditForm((prev) => ({
                                  ...prev,
                                  vehicleLength: value === "_none" ? "" : value,
                                }))
                              }
                            >
                              <SelectTrigger className="h-8 text-sm">
                                <SelectValue placeholder="Select length" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="_none">None</SelectItem>
                                {(vehicleMasterQuery.data?.find((item) => item.name === vehicleEditForm.type)?.lengths ?? []).map((length) => (
                                  <SelectItem key={length.id} value={length.value}>
                                    {length.value}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            className="h-7 text-[11px]"
                            disabled={updateVehicleMutation.isPending || !vehicleEditForm.number.trim() || !vehicleEditForm.type.trim()}
                            onClick={() =>
                              updateVehicleMutation.mutate({
                                vehicleId: vehicle.id,
                                number: vehicleEditForm.number.trim(),
                                type: vehicleEditForm.type.trim(),
                                vehicleLength: vehicleEditForm.vehicleLength.trim(),
                              })
                            }
                          >
                            Save
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-[11px]"
                            onClick={() => setEditingVehicleId(null)}
                          >
                            Cancel
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            {assignDriverMutation.isError && (
              <p className="text-xs text-red-600">
                {assignDriverMutation.error instanceof Error ? assignDriverMutation.error.message : "Unable to set driver"}
              </p>
            )}
            {updateVehicleMutation.isError && (
              <p className="text-xs text-red-600">
                {updateVehicleMutation.error instanceof Error ? updateVehicleMutation.error.message : "Unable to update vehicle"}
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
