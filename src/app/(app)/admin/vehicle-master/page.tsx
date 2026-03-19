"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Truck, Plus, Pencil, Trash2, Weight } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  listVehicleMasterCatalog,
  createVehicle, updateVehicle, deleteVehicle,
  createSegment, updateSegment, deleteSegment,
  type UpsertVehicleInput, type UpsertSegmentInput,
} from "@/lib/api/vehicle-master";
import type { VehicleMasterVehicle, VehicleMasterSegment } from "@/lib/types";
import { queryKeys } from "@/lib/query/keys";

export default function AdminVehicleMasterPage() {
  const queryClient = useQueryClient();
  const catalogQuery = useQuery({
    queryKey: queryKeys.adminVehicleMaster(true),
    queryFn: () => listVehicleMasterCatalog(true),
  });

  const vehicles = catalogQuery.data?.vehicles ?? [];
  const segments = catalogQuery.data?.segments ?? [];
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["admin-vehicle-master"] });

  return (
    <div className="space-y-4 p-4 sm:p-6">
      <PageHeader title="Vehicle Master" description="Manage vehicle catalog and weight segments across the platform" />

      {catalogQuery.isLoading ? (
        <Card><CardContent className="p-4 text-sm text-gray-500">Loading...</CardContent></Card>
      ) : catalogQuery.isError ? (
        <Card><CardContent className="p-4 text-sm text-red-600">
          {catalogQuery.error instanceof Error ? catalogQuery.error.message : "Unable to load vehicle master"}
        </CardContent></Card>
      ) : (
        <Tabs defaultValue="vehicles">
          <TabsList className="bg-gray-100 h-8">
            <TabsTrigger value="vehicles" className="text-xs h-7 data-[state=active]:bg-white">
              Vehicles ({vehicles.length})
            </TabsTrigger>
            <TabsTrigger value="segments" className="text-xs h-7 data-[state=active]:bg-white">
              Weight Segments ({segments.length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="vehicles" className="mt-4">
            <VehiclesTab vehicles={vehicles} onMutate={invalidate} />
          </TabsContent>
          <TabsContent value="segments" className="mt-4">
            <SegmentsTab segments={segments} onMutate={invalidate} />
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}

/* ========== Vehicles Tab ========== */

function VehiclesTab({ vehicles, onMutate }: { vehicles: VehicleMasterVehicle[]; onMutate: () => void }) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<VehicleMasterVehicle | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<VehicleMasterVehicle | null>(null);

  const createMut = useMutation({ mutationFn: (input: UpsertVehicleInput) => createVehicle(input), onSuccess: () => { onMutate(); setDialogOpen(false); } });
  const updateMut = useMutation({ mutationFn: ({ id, input }: { id: string; input: UpsertVehicleInput }) => updateVehicle(id, input), onSuccess: () => { onMutate(); setDialogOpen(false); setEditing(null); } });
  const deleteMut = useMutation({ mutationFn: (id: string) => deleteVehicle(id), onSuccess: () => { onMutate(); setDeleteTarget(null); } });

  const openCreate = () => { setEditing(null); setDialogOpen(true); };
  const openEdit = (v: VehicleMasterVehicle) => { setEditing(v); setDialogOpen(true); };

  const openBodies = vehicles.filter((v) => v.bodyType === "open");
  const containerBodies = vehicles.filter((v) => v.bodyType === "container");

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500">{vehicles.length} vehicle{vehicles.length !== 1 ? "s" : ""} in catalog</p>
        <Button size="sm" className="h-8 text-xs" onClick={openCreate}>
          <Plus className="mr-1 h-3.5 w-3.5" /> Add Vehicle
        </Button>
      </div>

      {openBodies.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Badge variant="outline" className="border-0 bg-blue-50 text-blue-700 text-[10px]">Open</Badge>
              Open Trucks ({openBodies.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <VehicleTable vehicles={openBodies} onEdit={openEdit} onDelete={setDeleteTarget} />
          </CardContent>
        </Card>
      )}

      {containerBodies.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Badge variant="outline" className="border-0 bg-purple-50 text-purple-700 text-[10px]">Container</Badge>
              Containers ({containerBodies.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <VehicleTable vehicles={containerBodies} onEdit={openEdit} onDelete={setDeleteTarget} />
          </CardContent>
        </Card>
      )}

      {vehicles.length === 0 && (
        <Card><CardContent className="p-6 text-center">
          <Truck className="h-8 w-8 text-gray-300 mx-auto mb-2" />
          <p className="text-sm text-gray-500">No vehicles yet. Add your first vehicle.</p>
        </CardContent></Card>
      )}

      <VehicleDialog
        open={dialogOpen}
        editing={editing}
        isLoading={createMut.isPending || updateMut.isPending}
        error={createMut.error ?? updateMut.error}
        onClose={() => { setDialogOpen(false); setEditing(null); createMut.reset(); updateMut.reset(); }}
        onSubmit={(input) => editing ? updateMut.mutate({ id: editing.id, input }) : createMut.mutate(input)}
      />

      <ConfirmDeleteDialog
        open={!!deleteTarget}
        title={`Delete "${deleteTarget?.name}"?`}
        description="This vehicle will be permanently removed. If it's referenced by market rates, deletion will fail — deactivate it instead."
        isLoading={deleteMut.isPending}
        error={deleteMut.error}
        onClose={() => { setDeleteTarget(null); deleteMut.reset(); }}
        onConfirm={() => deleteTarget && deleteMut.mutate(deleteTarget.id)}
      />
    </div>
  );
}

function VehicleTable({ vehicles, onEdit, onDelete }: {
  vehicles: VehicleMasterVehicle[];
  onEdit: (v: VehicleMasterVehicle) => void;
  onDelete: (v: VehicleMasterVehicle) => void;
}) {
  return (
    <Table>
      <TableHeader>
        <TableRow className="border-b border-gray-100 bg-gray-50/50">
          <TableHead className="px-4 py-2.5 text-xs font-medium text-gray-500">Weight</TableHead>
          <TableHead className="px-4 py-2.5 text-xs font-medium text-gray-500">Length</TableHead>
          <TableHead className="px-4 py-2.5 text-xs font-medium text-gray-500">Wheels</TableHead>
          <TableHead className="px-4 py-2.5 text-xs font-medium text-gray-500">Name</TableHead>
          <TableHead className="px-4 py-2.5 text-xs font-medium text-gray-500">Status</TableHead>
          <TableHead className="px-4 py-2.5 text-xs font-medium text-gray-500 text-right">Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {vehicles.map((v) => (
          <TableRow key={v.id} className="hover:bg-gray-50/50 transition-colors border-gray-50">
            <TableCell className="px-4 py-3 text-sm font-medium text-gray-900">{v.capacityTons}T</TableCell>
            <TableCell className="px-4 py-3 text-sm text-gray-600">{v.lengthFeet ? `${v.lengthFeet}ft` : "—"}</TableCell>
            <TableCell className="px-4 py-3 text-sm text-gray-600">{v.wheelCount ? `${v.wheelCount}W` : "—"}</TableCell>
            <TableCell className="px-4 py-3 text-sm text-gray-700">{v.name}</TableCell>
            <TableCell className="px-4 py-3">
              <Badge variant="outline" className={`text-[10px] border-0 ${v.active ? "bg-emerald-50 text-emerald-700" : "bg-gray-100 text-gray-500"}`}>
                {v.active ? "Active" : "Inactive"}
              </Badge>
            </TableCell>
            <TableCell className="px-4 py-3 text-right">
              <div className="flex items-center justify-end gap-1">
                <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => onEdit(v)}>
                  <Pencil className="h-3.5 w-3.5 text-gray-500" />
                </Button>
                <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => onDelete(v)}>
                  <Trash2 className="h-3.5 w-3.5 text-red-500" />
                </Button>
              </div>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

/* ========== Segments Tab ========== */

function SegmentsTab({ segments, onMutate }: { segments: VehicleMasterSegment[]; onMutate: () => void }) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<VehicleMasterSegment | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<VehicleMasterSegment | null>(null);

  const createMut = useMutation({ mutationFn: (input: UpsertSegmentInput) => createSegment(input), onSuccess: () => { onMutate(); setDialogOpen(false); } });
  const updateMut = useMutation({ mutationFn: ({ id, input }: { id: string; input: UpsertSegmentInput }) => updateSegment(id, input), onSuccess: () => { onMutate(); setDialogOpen(false); setEditing(null); } });
  const deleteMut = useMutation({ mutationFn: (id: string) => deleteSegment(id), onSuccess: () => { onMutate(); setDeleteTarget(null); } });

  const openSegs = segments.filter((s) => s.bodyType === "open");
  const containerSegs = segments.filter((s) => s.bodyType === "container");

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500">{segments.length} weight segment{segments.length !== 1 ? "s" : ""}</p>
        <Button size="sm" className="h-8 text-xs" onClick={() => { setEditing(null); setDialogOpen(true); }}>
          <Plus className="mr-1 h-3.5 w-3.5" /> Add Segment
        </Button>
      </div>

      {openSegs.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Badge variant="outline" className="border-0 bg-blue-50 text-blue-700 text-[10px]">Open</Badge>
              Open Truck Segments
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <SegmentTable segments={openSegs} onEdit={(s) => { setEditing(s); setDialogOpen(true); }} onDelete={setDeleteTarget} />
          </CardContent>
        </Card>
      )}

      {containerSegs.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Badge variant="outline" className="border-0 bg-purple-50 text-purple-700 text-[10px]">Container</Badge>
              Container Segments
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <SegmentTable segments={containerSegs} onEdit={(s) => { setEditing(s); setDialogOpen(true); }} onDelete={setDeleteTarget} />
          </CardContent>
        </Card>
      )}

      {segments.length === 0 && (
        <Card><CardContent className="p-6 text-center">
          <Weight className="h-8 w-8 text-gray-300 mx-auto mb-2" />
          <p className="text-sm text-gray-500">No weight segments yet.</p>
        </CardContent></Card>
      )}

      <SegmentDialog
        open={dialogOpen}
        editing={editing}
        isLoading={createMut.isPending || updateMut.isPending}
        error={createMut.error ?? updateMut.error}
        onClose={() => { setDialogOpen(false); setEditing(null); createMut.reset(); updateMut.reset(); }}
        onSubmit={(input) => editing ? updateMut.mutate({ id: editing.id, input }) : createMut.mutate(input)}
      />

      <ConfirmDeleteDialog
        open={!!deleteTarget}
        title={`Delete "${deleteTarget?.label}"?`}
        description="This weight segment will be permanently removed."
        isLoading={deleteMut.isPending}
        error={deleteMut.error}
        onClose={() => { setDeleteTarget(null); deleteMut.reset(); }}
        onConfirm={() => deleteTarget && deleteMut.mutate(deleteTarget.id)}
      />
    </div>
  );
}

function SegmentTable({ segments, onEdit, onDelete }: {
  segments: VehicleMasterSegment[];
  onEdit: (s: VehicleMasterSegment) => void;
  onDelete: (s: VehicleMasterSegment) => void;
}) {
  return (
    <Table>
      <TableHeader>
        <TableRow className="border-b border-gray-100 bg-gray-50/50">
          <TableHead className="px-4 py-2.5 text-xs font-medium text-gray-500">Label</TableHead>
          <TableHead className="px-4 py-2.5 text-xs font-medium text-gray-500">Min Weight</TableHead>
          <TableHead className="px-4 py-2.5 text-xs font-medium text-gray-500">Max Weight</TableHead>
          <TableHead className="px-4 py-2.5 text-xs font-medium text-gray-500">Status</TableHead>
          <TableHead className="px-4 py-2.5 text-xs font-medium text-gray-500 text-right">Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {segments.map((s) => (
          <TableRow key={s.id} className="hover:bg-gray-50/50 transition-colors border-gray-50">
            <TableCell className="px-4 py-3 text-sm font-medium text-gray-900">{s.label}</TableCell>
            <TableCell className="px-4 py-3 text-sm text-gray-600">{s.weightMinKg.toLocaleString("en-IN")} kg</TableCell>
            <TableCell className="px-4 py-3 text-sm text-gray-600">{s.weightMaxKg ? `${s.weightMaxKg.toLocaleString("en-IN")} kg` : "No limit"}</TableCell>
            <TableCell className="px-4 py-3">
              <Badge variant="outline" className={`text-[10px] border-0 ${s.active ? "bg-emerald-50 text-emerald-700" : "bg-gray-100 text-gray-500"}`}>
                {s.active ? "Active" : "Inactive"}
              </Badge>
            </TableCell>
            <TableCell className="px-4 py-3 text-right">
              <div className="flex items-center justify-end gap-1">
                <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => onEdit(s)}>
                  <Pencil className="h-3.5 w-3.5 text-gray-500" />
                </Button>
                <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => onDelete(s)}>
                  <Trash2 className="h-3.5 w-3.5 text-red-500" />
                </Button>
              </div>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

/* ========== Dialogs ========== */

function VehicleDialog({ open, editing, isLoading, error, onClose, onSubmit }: {
  open: boolean;
  editing: VehicleMasterVehicle | null;
  isLoading: boolean;
  error: Error | null;
  onClose: () => void;
  onSubmit: (input: UpsertVehicleInput) => void;
}) {
  const [capacityTons, setCapacityTons] = useState("");
  const [lengthFeet, setLengthFeet] = useState("");
  const [bodyType, setBodyType] = useState("open");
  const [wheelCount, setWheelCount] = useState("");
  const [active, setActive] = useState(true);

  const resetForm = () => {
    if (editing) {
      setCapacityTons(String(editing.capacityTons));
      setLengthFeet(editing.lengthFeet ? String(editing.lengthFeet) : "");
      setBodyType(editing.bodyType);
      setWheelCount(editing.wheelCount ? String(editing.wheelCount) : "");
      setActive(editing.active);
    } else {
      setCapacityTons(""); setLengthFeet(""); setBodyType("open"); setWheelCount(""); setActive(true);
    }
  };

  const previewName = (() => {
    const ct = Number(capacityTons);
    if (!ct) return "";
    let n = `${ct}T`;
    if (lengthFeet) n += ` ${Number(lengthFeet)}ft`;
    if (wheelCount) n += ` ${Number(wheelCount)}W`;
    n += ` ${bodyType === "container" ? "Container" : "Open"}`;
    return n;
  })();

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); else resetForm(); }}>
      <DialogContent className="sm:max-w-md" onOpenAutoFocus={resetForm as () => void}>
        <DialogHeader>
          <DialogTitle className="text-base">{editing ? "Edit Vehicle" : "Add Vehicle"}</DialogTitle>
          {previewName && (
            <DialogDescription className="text-xs">
              Preview: <span className="font-medium text-gray-800">{previewName}</span>
            </DialogDescription>
          )}
        </DialogHeader>
        <form onSubmit={(e) => { e.preventDefault(); onSubmit({
          capacityTons: Number(capacityTons),
          lengthFeet: lengthFeet ? Number(lengthFeet) : null,
          bodyType,
          wheelCount: wheelCount ? Number(wheelCount) : null,
          active,
        }); }} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Weight (Tons) *</Label>
              <Input type="number" step="0.1" min="0.1" value={capacityTons} onChange={(e) => setCapacityTons(e.target.value)} className="h-9 mt-1" required />
            </div>
            <div>
              <Label className="text-xs">Length (ft)</Label>
              <Input type="number" step="0.5" min="1" value={lengthFeet} onChange={(e) => setLengthFeet(e.target.value)} className="h-9 mt-1" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Body Type *</Label>
              <Select value={bodyType} onValueChange={setBodyType}>
                <SelectTrigger className="h-9 mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="open">Open</SelectItem>
                  <SelectItem value="container">Container</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Wheels</Label>
              <Input type="number" min="3" max="22" value={wheelCount} onChange={(e) => setWheelCount(e.target.value)} className="h-9 mt-1" />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Switch id="v-active" checked={active} onCheckedChange={setActive} />
            <Label htmlFor="v-active" className="text-xs">Active</Label>
          </div>
          {error && <p className="text-xs text-red-600">{error.message}</p>}
          <DialogFooter>
            <Button type="button" variant="outline" size="sm" onClick={onClose} className="h-8 text-xs">Cancel</Button>
            <Button type="submit" size="sm" disabled={isLoading || !capacityTons} className="h-8 text-xs">
              {isLoading ? "Saving..." : editing ? "Update" : "Create"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function SegmentDialog({ open, editing, isLoading, error, onClose, onSubmit }: {
  open: boolean;
  editing: VehicleMasterSegment | null;
  isLoading: boolean;
  error: Error | null;
  onClose: () => void;
  onSubmit: (input: UpsertSegmentInput) => void;
}) {
  const [label, setLabel] = useState("");
  const [bodyType, setBodyType] = useState("open");
  const [weightMinKg, setWeightMinKg] = useState("");
  const [weightMaxKg, setWeightMaxKg] = useState("");
  const [active, setActive] = useState(true);

  const resetForm = () => {
    if (editing) {
      setLabel(editing.label); setBodyType(editing.bodyType);
      setWeightMinKg(String(editing.weightMinKg));
      setWeightMaxKg(editing.weightMaxKg ? String(editing.weightMaxKg) : "");
      setActive(editing.active);
    } else {
      setLabel(""); setBodyType("open"); setWeightMinKg(""); setWeightMaxKg(""); setActive(true);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); else resetForm(); }}>
      <DialogContent className="sm:max-w-md" onOpenAutoFocus={resetForm as () => void}>
        <DialogHeader>
          <DialogTitle className="text-base">{editing ? "Edit Segment" : "Add Segment"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={(e) => { e.preventDefault(); onSubmit({
          label, bodyType,
          weightMinKg: Number(weightMinKg || 0),
          weightMaxKg: weightMaxKg ? Number(weightMaxKg) : null,
          active,
        }); }} className="space-y-3">
          <div>
            <Label className="text-xs">Label *</Label>
            <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g., 2.5-5 Ton" className="h-9 mt-1" required />
          </div>
          <div>
            <Label className="text-xs">Body Type *</Label>
            <Select value={bodyType} onValueChange={setBodyType}>
              <SelectTrigger className="h-9 mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="open">Open</SelectItem>
                <SelectItem value="container">Container</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Min Weight (kg) *</Label>
              <Input type="number" min="0" value={weightMinKg} onChange={(e) => setWeightMinKg(e.target.value)} className="h-9 mt-1" required />
            </div>
            <div>
              <Label className="text-xs">Max Weight (kg)</Label>
              <Input type="number" min="0" value={weightMaxKg} onChange={(e) => setWeightMaxKg(e.target.value)} placeholder="No limit" className="h-9 mt-1" />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Switch id="s-active" checked={active} onCheckedChange={setActive} />
            <Label htmlFor="s-active" className="text-xs">Active</Label>
          </div>
          {error && <p className="text-xs text-red-600">{error.message}</p>}
          <DialogFooter>
            <Button type="button" variant="outline" size="sm" onClick={onClose} className="h-8 text-xs">Cancel</Button>
            <Button type="submit" size="sm" disabled={isLoading || !label} className="h-8 text-xs">
              {isLoading ? "Saving..." : editing ? "Update" : "Create"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ConfirmDeleteDialog({ open, title, description, isLoading, error, onClose, onConfirm }: {
  open: boolean;
  title: string;
  description: string;
  isLoading: boolean;
  error: Error | null;
  onClose: () => void;
  onConfirm: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-base">{title}</DialogTitle>
          <DialogDescription className="text-xs">{description}</DialogDescription>
        </DialogHeader>
        {error && <p className="text-xs text-red-600">{error.message}</p>}
        <DialogFooter>
          <Button type="button" variant="outline" size="sm" onClick={onClose} className="h-8 text-xs">Cancel</Button>
          <Button type="button" variant="destructive" size="sm" disabled={isLoading} onClick={onConfirm} className="h-8 text-xs">
            {isLoading ? "Deleting..." : "Delete"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
