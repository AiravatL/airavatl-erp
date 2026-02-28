"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  createVehicleMasterLength,
  createVehicleMasterType,
  listAdminVehicleMaster,
  updateVehicleMasterLength,
  updateVehicleMasterType,
} from "@/lib/api/vehicle-master";
import { queryKeys } from "@/lib/query/keys";
import type { VehicleMasterTypeOption } from "@/lib/types";
import { Pencil, Plus, Trash2 } from "lucide-react";

export default function AdminVehicleMasterPage() {
  const queryClient = useQueryClient();
  const [newTypeName, setNewTypeName] = useState("");
  const [newLengthByType, setNewLengthByType] = useState<Record<string, string>>({});
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionInfo, setActionInfo] = useState<string | null>(null);

  const vehicleMasterQuery = useQuery({
    queryKey: queryKeys.adminVehicleMaster,
    queryFn: listAdminVehicleMaster,
  });

  async function refreshVehicleMaster() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.adminVehicleMaster }),
      queryClient.invalidateQueries({ queryKey: queryKeys.vehicleMasterOptions }),
    ]);
  }

  const createTypeMutation = useMutation({
    mutationFn: createVehicleMasterType,
    onSuccess: async (created) => {
      setActionInfo(`Vehicle type ${created.name} created.`);
      setNewTypeName("");
      await refreshVehicleMaster();
    },
    onError: (error) => {
      setActionError(error instanceof Error ? error.message : "Unable to create vehicle type");
    },
  });

  const updateTypeMutation = useMutation({
    mutationFn: ({ typeId, payload }: { typeId: string; payload: Parameters<typeof updateVehicleMasterType>[1] }) =>
      updateVehicleMasterType(typeId, payload),
    onSuccess: async () => {
      setActionInfo("Vehicle type updated.");
      await refreshVehicleMaster();
    },
    onError: (error) => {
      setActionError(error instanceof Error ? error.message : "Unable to update vehicle type");
    },
  });

  const createLengthMutation = useMutation({
    mutationFn: createVehicleMasterLength,
    onSuccess: async () => {
      setActionInfo("Vehicle length added.");
      await refreshVehicleMaster();
    },
    onError: (error) => {
      setActionError(error instanceof Error ? error.message : "Unable to add vehicle length");
    },
  });

  const updateLengthMutation = useMutation({
    mutationFn: ({ lengthId, payload }: { lengthId: string; payload: Parameters<typeof updateVehicleMasterLength>[1] }) =>
      updateVehicleMasterLength(lengthId, payload),
    onSuccess: async () => {
      setActionInfo("Vehicle length updated.");
      await refreshVehicleMaster();
    },
    onError: (error) => {
      setActionError(error instanceof Error ? error.message : "Unable to update vehicle length");
    },
  });

  async function handleCreateType() {
    setActionError(null);
    setActionInfo(null);
    const name = newTypeName.trim();
    if (!name) return;
    await createTypeMutation.mutateAsync({ name, active: true });
  }

  async function handleRenameType(type: VehicleMasterTypeOption) {
    setActionError(null);
    setActionInfo(null);
    const nextName = window.prompt("Update vehicle type name", type.name)?.trim();
    if (!nextName || nextName === type.name) return;
    await updateTypeMutation.mutateAsync({ typeId: type.id, payload: { name: nextName } });
  }

  async function handleToggleType(type: VehicleMasterTypeOption, active: boolean) {
    setActionError(null);
    setActionInfo(null);
    await updateTypeMutation.mutateAsync({
      typeId: type.id,
      payload: { active, applyToLengths: true },
    });
  }

  async function handleCreateLength(type: VehicleMasterTypeOption) {
    setActionError(null);
    setActionInfo(null);
    const lengthValue = (newLengthByType[type.id] ?? "").trim();
    if (!lengthValue) return;

    await createLengthMutation.mutateAsync({
      vehicleTypeId: type.id,
      lengthValue,
      active: true,
    });

    setNewLengthByType((prev) => ({ ...prev, [type.id]: "" }));
  }

  async function handleRenameLength(type: VehicleMasterTypeOption, length: VehicleMasterTypeOption["lengths"][number]) {
    setActionError(null);
    setActionInfo(null);
    const nextValue = window.prompt("Update vehicle length", length.value)?.trim();
    if (!nextValue || nextValue === length.value) return;

    await updateLengthMutation.mutateAsync({
      lengthId: length.id,
      payload: {
        vehicleTypeId: type.id,
        lengthValue: nextValue,
      },
    });
  }

  async function handleToggleLength(lengthId: string, active: boolean) {
    setActionError(null);
    setActionInfo(null);
    await updateLengthMutation.mutateAsync({
      lengthId,
      payload: { active },
    });
  }

  const types = vehicleMasterQuery.data ?? [];
  const queryError =
    vehicleMasterQuery.error instanceof Error ? vehicleMasterQuery.error.message : "Unable to load vehicle master";

  return (
    <div className="p-4 sm:p-6 space-y-4">
      <PageHeader
        title="Vehicle Master"
        description="Manage vehicle type and length options used in CRM forms"
      />

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold text-gray-900">Add Vehicle Type</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <div className="flex-1 space-y-1">
            <Label className="text-xs">Vehicle Type Name</Label>
            <Input
              value={newTypeName}
              onChange={(event) => setNewTypeName(event.target.value)}
              placeholder="e.g. 32ft MXL"
              className="h-9 text-sm"
            />
          </div>
          <Button
            size="sm"
            className="h-9"
            disabled={createTypeMutation.isPending || !newTypeName.trim()}
            onClick={() => void handleCreateType()}
          >
            <Plus className="h-4 w-4 mr-1" />
            Add Type
          </Button>
        </CardContent>
      </Card>

      {actionError && (
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-red-600">{actionError}</p>
          </CardContent>
        </Card>
      )}

      {actionInfo && (
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-emerald-700">{actionInfo}</p>
          </CardContent>
        </Card>
      )}

      {vehicleMasterQuery.isLoading && (
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-gray-500">Loading vehicle master...</p>
          </CardContent>
        </Card>
      )}

      {!vehicleMasterQuery.isLoading && vehicleMasterQuery.isError && (
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-red-600">{queryError}</p>
          </CardContent>
        </Card>
      )}

      {!vehicleMasterQuery.isLoading && !vehicleMasterQuery.isError && (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          {types.map((type) => (
            <Card key={type.id}>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <CardTitle className="truncate text-sm">{type.name}</CardTitle>
                    <p className="text-xs text-gray-500">{type.lengths.length} lengths</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge
                      variant="outline"
                      className={`border-0 text-[10px] ${type.active ? "bg-emerald-50 text-emerald-700" : "bg-gray-100 text-gray-500"}`}
                    >
                      {type.active ? "Active" : "Inactive"}
                    </Badge>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => void handleRenameType(type)}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Switch
                      checked={type.active}
                      onCheckedChange={(checked) => {
                        void handleToggleType(type, checked);
                      }}
                    />
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="space-y-2">
                  {type.lengths.length === 0 ? (
                    <div className="rounded border border-dashed border-gray-200 p-3">
                      <p className="text-xs text-gray-400">No lengths added</p>
                    </div>
                  ) : (
                    type.lengths.map((length) => (
                      <div
                        key={length.id}
                        className="flex items-center justify-between rounded border border-gray-200 px-2.5 py-2"
                      >
                        <div className="min-w-0">
                          <p className="truncate text-sm text-gray-900">{length.value}</p>
                          <p className="text-[11px] text-gray-500">{length.active ? "Active" : "Inactive"}</p>
                        </div>
                        <div className="flex items-center gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={() => {
                              void handleRenameLength(type, length);
                            }}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-red-600 hover:text-red-700"
                            onClick={() => {
                              void handleToggleLength(length.id, false);
                            }}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                          <Switch
                            checked={length.active}
                            onCheckedChange={(checked) => {
                              void handleToggleLength(length.id, checked);
                            }}
                          />
                        </div>
                      </div>
                    ))
                  )}
                </div>

                <div className="flex items-end gap-2">
                  <div className="flex-1 space-y-1">
                    <Label className="text-xs">Add Length</Label>
                    <Input
                      value={newLengthByType[type.id] ?? ""}
                      onChange={(event) =>
                        setNewLengthByType((prev) => ({ ...prev, [type.id]: event.target.value }))
                      }
                      placeholder="e.g. 32ft"
                      className="h-8 text-sm"
                    />
                  </div>
                  <Button
                    size="sm"
                    className="h-8"
                    disabled={createLengthMutation.isPending || !(newLengthByType[type.id] ?? "").trim()}
                    onClick={() => {
                      void handleCreateLength(type);
                    }}
                  >
                    <Plus className="h-3.5 w-3.5 mr-1" />
                    Add
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
