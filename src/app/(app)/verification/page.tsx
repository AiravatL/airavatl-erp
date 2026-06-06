"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { PageHeader } from "@/components/shared/page-header";
import { useAuth } from "@/lib/auth/auth-context";
import {
  listPendingVerifications,
  updatePartnerProfile,
  deletePartner,
  type DriverUserType,
} from "@/lib/api/verification";
import { queryKeys } from "@/lib/query/keys";
import { formatDate } from "@/lib/formatters";
import type { PendingVerificationItem, PendingVerificationKind } from "@/lib/types";
import {
  Search,
  Plus,
  Clock,
  User,
  Building2,
  Users,
  Truck,
  MoreVertical,
  Pencil,
  Trash2,
  Loader2,
  AlertTriangle,
} from "lucide-react";

const KIND_BADGE: Record<PendingVerificationKind, string> = {
  individual_driver: "bg-blue-50 text-blue-700",
  transporter: "bg-purple-50 text-purple-700",
  employee_driver: "bg-sky-50 text-sky-700",
  vehicle: "bg-amber-50 text-amber-700",
};

const KIND_LABEL: Record<PendingVerificationKind, string> = {
  individual_driver: "Individual Driver",
  transporter: "Transporter",
  employee_driver: "Employee Driver",
  vehicle: "Vehicle",
};

function TabCount({ n }: { n: number | undefined }) {
  if (n === undefined) return null;
  return (
    <span className="inline-flex min-w-[1.25rem] items-center justify-center rounded-full bg-gray-200 px-1 text-[10px] font-semibold leading-none text-gray-700 py-0.5">
      {n}
    </span>
  );
}

function formatPhone(phone: string | null | undefined) {
  if (!phone) return "";
  const digits = phone.replace(/^91/, "");
  if (digits.length === 10) return `${digits.slice(0, 5)} ${digits.slice(5)}`;
  return digits;
}

function timeAgo(dateStr: string) {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffMs = now - then;
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays === 1) return "1 day ago";
  if (diffDays < 30) return `${diffDays} days ago`;
  return formatDate(dateStr);
}

function hrefFor(item: PendingVerificationItem): string {
  switch (item.kind) {
    case "individual_driver":
    case "transporter":
      return `/verification/${item.id}`;
    case "employee_driver":
      return `/verification/employee-driver/${item.id}`;
    case "vehicle":
      return `/verification/vehicle/${item.id}`;
  }
}

function subtitleFor(item: PendingVerificationItem): string {
  // For users we show phone; for vehicle we show spec; employee also includes parent transporter.
  switch (item.kind) {
    case "individual_driver":
    case "transporter":
      return item.subtitle ? formatPhone(item.subtitle) : "";
    case "employee_driver":
      return [item.subtitle ? formatPhone(item.subtitle) : null, item.parentTitle]
        .filter(Boolean)
        .join(" · ");
    case "vehicle":
      return [item.subtitle, item.parentTitle].filter(Boolean).join(" · ");
  }
}

export default function VerificationPendingPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [kindFilter, setKindFilter] = useState<string>("individual_driver");
  const [editTarget, setEditTarget] = useState<{
    id: string;
    title: string;
    kind: "individual_driver" | "transporter";
    city: string | null;
  } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{
    id: string;
    title: string;
  } | null>(null);

  const isAdmin = user?.role === "super_admin" || user?.role === "admin";
  // Vehicle sales runs verification → can edit info / swap role; delete is admin-only.
  const isVerifier = isAdmin || user?.role === "sales_vehicles";

  const editMutation = useMutation({
    mutationFn: (input: {
      userId: string;
      fullName?: string;
      userType?: DriverUserType;
      city?: string | null;
      state?: string | null;
    }) =>
      updatePartnerProfile(input.userId, {
        fullName: input.fullName,
        userType: input.userType,
        city: input.city,
        state: input.state,
      }),
    onSuccess: () => {
      setEditTarget(null);
      queryClient.invalidateQueries({ queryKey: ["verification", "pending"] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (userId: string) => deletePartner(userId),
    onSuccess: () => {
      setDeleteTarget(null);
      queryClient.invalidateQueries({ queryKey: ["verification", "pending"] });
    },
  });

  const pendingQuery = useQuery({
    queryKey: queryKeys.verificationPending({
      userType: kindFilter,
      search: search || undefined,
      limit: 50,
      offset: 0,
    }),
    queryFn: () =>
      listPendingVerifications({
        userType: kindFilter,
        search: search || undefined,
        limit: 50,
        offset: 0,
      }),
    enabled: !!user,
  });

  // Per-type counts are only correct when fetched unfiltered (the RPC zeroes
  // the other types when p_user_type is set), so the tab badges + stat cards
  // read from a dedicated all-types query that still respects search.
  const countsQuery = useQuery({
    queryKey: queryKeys.verificationPending({
      search: search || undefined,
      limit: 1,
      offset: 0,
    }),
    queryFn: () =>
      listPendingVerifications({
        search: search || undefined,
        limit: 1,
        offset: 0,
      }),
    enabled: !!user,
  });

  const counts = countsQuery.data;
  const data = pendingQuery.data;
  const items = data?.items ?? [];
  const canAddPartner =
    user?.role === "super_admin" ||
    user?.role === "admin" ||
    user?.role === "sales_vehicles";

  return (
    <div className="space-y-4">
      <PageHeader
        title="Verification"
        description="Verify partners, employee drivers, and fleet vehicles."
      >
        {canAddPartner && (
          <Button size="sm" className="h-8 text-xs" asChild>
            <Link href="/verification/add">
              <Plus className="h-3.5 w-3.5" />
              Add Partner
            </Link>
          </Button>
        )}
      </PageHeader>

      {/* Stats row */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <Card>
          <CardContent className="p-3 flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gray-100">
              <Clock className="h-4 w-4 text-gray-600" />
            </div>
            <div>
              <p className="text-xs text-gray-500">Total Pending</p>
              <p className="text-lg font-semibold text-gray-900">{counts?.total ?? "—"}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-50">
              <User className="h-4 w-4 text-blue-600" />
            </div>
            <div>
              <p className="text-xs text-gray-500">Individual</p>
              <p className="text-lg font-semibold text-gray-900">
                {counts?.individualDriverCount ?? "—"}
              </p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-purple-50">
              <Building2 className="h-4 w-4 text-purple-600" />
            </div>
            <div>
              <p className="text-xs text-gray-500">Transporters</p>
              <p className="text-lg font-semibold text-gray-900">
                {counts?.transporterCount ?? "—"}
              </p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-sky-50">
              <Users className="h-4 w-4 text-sky-600" />
            </div>
            <div>
              <p className="text-xs text-gray-500">Employees</p>
              <p className="text-lg font-semibold text-gray-900">
                {counts?.employeeDriverCount ?? "—"}
              </p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-50">
              <Truck className="h-4 w-4 text-amber-600" />
            </div>
            <div>
              <p className="text-xs text-gray-500">Vehicles</p>
              <p className="text-lg font-semibold text-gray-900">
                {counts?.vehicleCount ?? "—"}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Type tabs — badge shows the unverified count per type */}
      <Tabs value={kindFilter} onValueChange={setKindFilter}>
        <TabsList className="bg-gray-100 h-8">
          <TabsTrigger value="individual_driver" className="text-xs h-7 gap-1.5 data-[state=active]:bg-white">
            Individual
            <TabCount n={counts?.individualDriverCount} />
          </TabsTrigger>
          <TabsTrigger value="transporter" className="text-xs h-7 gap-1.5 data-[state=active]:bg-white">
            Transporter
            <TabCount n={counts?.transporterCount} />
          </TabsTrigger>
          <TabsTrigger value="employee_driver" className="text-xs h-7 gap-1.5 data-[state=active]:bg-white">
            Employee
            <TabCount n={counts?.employeeDriverCount} />
          </TabsTrigger>
          <TabsTrigger value="vehicle" className="text-xs h-7 gap-1.5 data-[state=active]:bg-white">
            Vehicle
            <TabCount n={counts?.vehicleCount} />
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
        <Input
          placeholder="Search by name, phone or registration..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="h-8 pl-8 text-sm"
          maxLength={100}
        />
      </div>

      {pendingQuery.isLoading && (
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-gray-500">Loading pending verifications...</p>
          </CardContent>
        </Card>
      )}

      {!pendingQuery.isLoading && pendingQuery.isError && (
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-red-600">
              {pendingQuery.error instanceof Error
                ? pendingQuery.error.message
                : "Unable to fetch pending verifications"}
            </p>
          </CardContent>
        </Card>
      )}

      {!pendingQuery.isLoading && !pendingQuery.isError && (
        <>
          {items.length === 0 && (
            <Card>
              <CardContent className="p-8 text-center">
                <p className="text-sm font-medium text-gray-900">
                  No pending verifications
                </p>
                <p className="text-xs text-gray-500 mt-1">
                  Everything is verified. New partners, employees, and vehicles
                  will appear here.
                </p>
              </CardContent>
            </Card>
          )}

          {items.length > 0 && (
            <>
              {/* Desktop table */}
              <div className="hidden sm:block">
                <Card>
                  <CardContent className="p-0">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-gray-100 bg-gray-50/50">
                          <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500">
                            Name
                          </th>
                          <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500 w-[140px]">
                            Type
                          </th>
                          <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500">
                            Details
                          </th>
                          <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500 w-[120px]">
                            Added
                          </th>
                          {isVerifier && (
                            <th className="px-4 py-2.5 text-right text-xs font-medium text-gray-500 w-[60px]">
                              {""}
                            </th>
                          )}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50">
                        {items.map((p) => {
                          const isPartnerRow =
                            p.kind === "individual_driver" || p.kind === "transporter";
                          return (
                            <tr
                              key={`${p.kind}-${p.id}`}
                              className="hover:bg-gray-50/50 transition-colors"
                            >
                              <td className="px-4 py-3">
                                <Link
                                  href={hrefFor(p)}
                                  className="font-medium text-blue-600 hover:underline"
                                >
                                  {p.title}
                                </Link>
                              </td>
                              <td className="px-4 py-3">
                                <Badge
                                  variant="outline"
                                  className={`border-0 text-[10px] ${KIND_BADGE[p.kind]}`}
                                >
                                  {KIND_LABEL[p.kind]}
                                </Badge>
                              </td>
                              <td className="px-4 py-3 text-gray-600 truncate max-w-[260px]">
                                {subtitleFor(p) || "—"}
                              </td>
                              <td className="px-4 py-3 text-xs text-gray-500">
                                {timeAgo(p.createdAt)}
                              </td>
                              {isVerifier && (
                                <td className="px-4 py-3 text-right">
                                  {isPartnerRow ? (
                                    <DropdownMenu>
                                      <DropdownMenuTrigger asChild>
                                        <Button
                                          variant="ghost"
                                          size="sm"
                                          className="h-7 w-7 p-0"
                                          aria-label="Row actions"
                                        >
                                          <MoreVertical className="h-3.5 w-3.5" />
                                        </Button>
                                      </DropdownMenuTrigger>
                                      <DropdownMenuContent align="end" className="w-36">
                                        <DropdownMenuItem
                                          onClick={() =>
                                            setEditTarget({
                                              id: p.id,
                                              title: p.title,
                                              kind: p.kind as
                                                | "individual_driver"
                                                | "transporter",
                                              city: p.city ?? null,
                                            })
                                          }
                                        >
                                          <Pencil className="h-3.5 w-3.5 mr-2" />
                                          Edit
                                        </DropdownMenuItem>
                                        {isAdmin && (
                                          <DropdownMenuItem
                                            className="text-red-600 focus:text-red-700 focus:bg-red-50"
                                            onClick={() =>
                                              setDeleteTarget({ id: p.id, title: p.title })
                                            }
                                          >
                                            <Trash2 className="h-3.5 w-3.5 mr-2" />
                                            Delete
                                          </DropdownMenuItem>
                                        )}
                                      </DropdownMenuContent>
                                    </DropdownMenu>
                                  ) : null}
                                </td>
                              )}
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </CardContent>
                </Card>
              </div>

              {/* Mobile cards */}
              <div className="sm:hidden space-y-2">
                {items.map((p) => (
                  <Link key={`${p.kind}-${p.id}`} href={hrefFor(p)}>
                    <Card className="hover:bg-gray-50/50 transition-colors">
                      <CardContent className="p-3">
                        <div className="flex items-start justify-between mb-1">
                          <p className="text-sm font-medium text-gray-900 truncate">
                            {p.title}
                          </p>
                          <Badge
                            variant="outline"
                            className={`border-0 text-[10px] ${KIND_BADGE[p.kind]}`}
                          >
                            {KIND_LABEL[p.kind]}
                          </Badge>
                        </div>
                        <p className="text-xs text-gray-500 truncate">
                          {subtitleFor(p) || "—"}
                        </p>
                        <p className="text-[11px] text-gray-400 mt-1">
                          {p.city ? `${p.city} · ` : ""}Added {timeAgo(p.createdAt)}
                        </p>
                      </CardContent>
                    </Card>
                  </Link>
                ))}
              </div>
            </>
          )}
        </>
      )}

      {/* Quick Edit dialog (row-level) */}
      <QuickEditDialog
        target={editTarget}
        isPending={editMutation.isPending}
        error={editMutation.error instanceof Error ? editMutation.error.message : null}
        onClose={() => setEditTarget(null)}
        onSubmit={(input) =>
          editTarget && editMutation.mutate({ userId: editTarget.id, ...input })
        }
      />

      {/* Delete confirm dialog */}
      <Dialog
        open={!!deleteTarget}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Delete Partner</DialogTitle>
            <DialogDescription className="flex items-start gap-2 pt-2">
              <AlertTriangle className="h-4 w-4 text-red-500 shrink-0 mt-0.5" />
              <span>
                Permanently remove <strong>{deleteTarget?.title}</strong>? Their phone will be
                freed for a fresh signup. This cannot be undone.
              </span>
            </DialogDescription>
          </DialogHeader>
          {deleteMutation.isError && (
            <p className="text-sm text-red-600">
              {deleteMutation.error instanceof Error
                ? deleteMutation.error.message
                : "Failed to delete"}
            </p>
          )}
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setDeleteTarget(null)}>
              Cancel
            </Button>
            <Button
              size="sm"
              className="bg-red-600 hover:bg-red-700 text-white"
              onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending && (
                <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
              )}
              Delete Permanently
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function QuickEditDialog({
  target,
  isPending,
  error,
  onClose,
  onSubmit,
}: {
  target: {
    id: string;
    title: string;
    kind: "individual_driver" | "transporter";
    city: string | null;
  } | null;
  isPending: boolean;
  error: string | null;
  onClose: () => void;
  onSubmit: (input: {
    fullName?: string;
    userType?: DriverUserType;
    city?: string | null;
    state?: string | null;
  }) => void;
}) {
  const [fullName, setFullName] = useState("");
  const [userType, setUserType] = useState<DriverUserType>("individual_driver");
  const [city, setCity] = useState("");

  useEffect(() => {
    if (target) {
      setFullName(target.title);
      setUserType(target.kind);
      setCity(target.city ?? "");
    }
  }, [target]);

  if (!target) return null;

  const trimmed = fullName.trim();
  const dirty =
    trimmed !== target.title ||
    userType !== target.kind ||
    (city.trim() || null) !== (target.city ?? null);
  const canSave = !!trimmed && dirty && !isPending;

  return (
    <Dialog open={!!target} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Edit Partner</DialogTitle>
          <DialogDescription>
            Phone is not editable. Role swap requires no bids/trips/payments on file.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-1">
          <div className="space-y-1.5">
            <Label className="text-sm font-medium">Full Name</Label>
            <Input
              value={fullName}
              onChange={(e) => setFullName(e.target.value.slice(0, 100))}
              maxLength={100}
              className="h-9 text-sm"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-sm font-medium">Role</Label>
            <Select value={userType} onValueChange={(v) => setUserType(v as DriverUserType)}>
              <SelectTrigger className="h-9 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="individual_driver">Individual Driver</SelectItem>
                <SelectItem value="transporter">Transporter</SelectItem>
                <SelectItem value="employee_driver">Employee Driver</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-sm font-medium">City</Label>
            <Input
              value={city}
              onChange={(e) => setCity(e.target.value.slice(0, 100))}
              maxLength={100}
              className="h-9 text-sm"
            />
          </div>
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button
            size="sm"
            disabled={!canSave}
            onClick={() => {
              const payload: {
                fullName?: string;
                userType?: DriverUserType;
                city?: string | null;
              } = {};
              if (trimmed !== target.title) payload.fullName = trimmed;
              if (userType !== target.kind) payload.userType = userType;
              const cityVal = city.trim() || null;
              if (cityVal !== (target.city ?? null)) payload.city = cityVal;
              onSubmit(payload);
            }}
          >
            {isPending && <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
