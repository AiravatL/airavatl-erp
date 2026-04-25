"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
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
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { queryKeys } from "@/lib/query/keys";
import { formatDate } from "@/lib/formatters";
import {
  KeyRound,
  Loader2,
  MoreVertical,
  Plus,
  ShieldCheck,
  Trash2,
  UserPlus,
} from "lucide-react";
import {
  createCustomerPortalUser,
  deleteCustomerPortalUser,
  listCustomerPortalUsers,
  updateCustomerPortalUser,
  type CustomerPortalUser,
} from "@/lib/api/customer-portal-users";

interface Props {
  customerId: string;
  isAdmin: boolean;
}

const ROLE_LABELS: Record<string, string> = {
  viewer: "Viewer",
  manager: "Manager",
};

export function PortalAccessCard({ customerId, isAdmin }: Props) {
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<CustomerPortalUser | null>(null);
  const [resetting, setResetting] = useState<CustomerPortalUser | null>(null);
  const [deleting, setDeleting] = useState<CustomerPortalUser | null>(null);

  const usersQuery = useQuery({
    queryKey: queryKeys.customerPortalUsers(customerId),
    queryFn: () => listCustomerPortalUsers(customerId),
    enabled: !!customerId,
  });

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: queryKeys.customerPortalUsers(customerId) });

  const users = usersQuery.data ?? [];

  return (
    <Card>
      <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
        <div>
          <CardTitle className="text-sm font-medium text-gray-900 flex items-center gap-1.5">
            <ShieldCheck className="h-3.5 w-3.5 text-gray-400" />
            Portal Access ({users.length})
          </CardTitle>
          <p className="text-[11px] text-gray-400 mt-0.5">
            Email/password accounts for the customer to monitor their trips
          </p>
        </div>
        {isAdmin && (
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-xs gap-1"
            onClick={() => setCreateOpen(true)}
          >
            <Plus className="h-3 w-3" /> Add user
          </Button>
        )}
      </CardHeader>
      <CardContent className="p-0">
        {usersQuery.isLoading && (
          <p className="px-4 py-3 text-sm text-gray-500">Loading…</p>
        )}
        {usersQuery.isError && (
          <p className="px-4 py-3 text-sm text-red-600">
            {usersQuery.error instanceof Error ? usersQuery.error.message : "Error"}
          </p>
        )}
        {!usersQuery.isLoading && !usersQuery.isError && users.length === 0 && (
          <div className="px-4 py-6 text-center">
            <UserPlus className="h-6 w-6 mx-auto text-gray-300 mb-1.5" />
            <p className="text-sm text-gray-500">No portal users yet.</p>
            {isAdmin && (
              <p className="text-xs text-gray-400 mt-0.5">
                Click &ldquo;Add user&rdquo; to invite the first one.
              </p>
            )}
          </div>
        )}
        {users.length > 0 && (
          <div className="divide-y divide-gray-50">
            {users.map((u) => (
              <div key={u.id} className="flex items-center justify-between px-4 py-2.5">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium text-gray-900 truncate">
                      {u.fullName}
                    </span>
                    <Badge
                      variant="outline"
                      className="text-[10px] border-0 bg-gray-100 text-gray-600"
                    >
                      {ROLE_LABELS[u.role] ?? u.role}
                    </Badge>
                    {!u.active && (
                      <Badge
                        variant="outline"
                        className="text-[10px] border-0 bg-red-50 text-red-700"
                      >
                        Disabled
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-gray-500 truncate">{u.email}</p>
                  <p className="text-[11px] text-gray-400">
                    Last login:{" "}
                    {u.lastLoginAt ? formatDate(u.lastLoginAt) : "Never"}
                  </p>
                </div>
                {isAdmin && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-7 w-7">
                        <MoreVertical className="h-4 w-4 text-gray-400" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-44">
                      <DropdownMenuItem onClick={() => setEditing(u)}>
                        Edit details
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => setResetting(u)}>
                        <KeyRound className="h-3.5 w-3.5 mr-2" /> Reset password
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        className="text-red-600 focus:text-red-600"
                        onClick={() => setDeleting(u)}
                      >
                        <Trash2 className="h-3.5 w-3.5 mr-2" /> Delete user
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>

      {createOpen && (
        <CreatePortalUserDialog
          customerId={customerId}
          onOpenChange={setCreateOpen}
          onSuccess={invalidate}
        />
      )}
      {editing && (
        <EditPortalUserDialog
          user={editing}
          onOpenChange={(open) => !open && setEditing(null)}
          onSuccess={invalidate}
        />
      )}
      {resetting && (
        <ResetPasswordDialog
          user={resetting}
          onOpenChange={(open) => !open && setResetting(null)}
          onSuccess={invalidate}
        />
      )}
      {deleting && (
        <DeletePortalUserDialog
          user={deleting}
          onOpenChange={(open) => !open && setDeleting(null)}
          onSuccess={invalidate}
        />
      )}
    </Card>
  );
}

function CreatePortalUserDialog({
  customerId,
  onOpenChange,
  onSuccess,
}: {
  customerId: string;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}) {
  const [form, setForm] = useState({
    fullName: "",
    email: "",
    password: "",
    role: "viewer" as "viewer" | "manager",
    active: true,
  });

  const mutation = useMutation({
    mutationFn: () =>
      createCustomerPortalUser(customerId, {
        fullName: form.fullName.trim(),
        email: form.email.trim().toLowerCase(),
        password: form.password,
        role: form.role,
        active: form.active,
      }),
    onSuccess: () => {
      onSuccess();
      onOpenChange(false);
    },
  });

  const valid =
    form.fullName.trim().length > 0 &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim()) &&
    form.password.length >= 8;

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-base">Add Portal User</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div className="space-y-1">
            <Label className="text-xs">Full name</Label>
            <Input
              className="h-8 text-sm"
              value={form.fullName}
              maxLength={100}
              onChange={(e) => setForm((p) => ({ ...p, fullName: e.target.value }))}
              placeholder="e.g. Rohit Sharma"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Email</Label>
            <Input
              type="email"
              className="h-8 text-sm"
              value={form.email}
              maxLength={254}
              onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))}
              placeholder="user@company.com"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Temporary password</Label>
            <Input
              type="text"
              className="h-8 text-sm font-mono"
              value={form.password}
              maxLength={72}
              onChange={(e) => setForm((p) => ({ ...p, password: e.target.value }))}
              placeholder="At least 8 characters"
            />
            <p className="text-[11px] text-gray-400">
              Share this with the customer. They can change it after first login.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3 items-end">
            <div className="space-y-1">
              <Label className="text-xs">Role</Label>
              <Select
                value={form.role}
                onValueChange={(v) =>
                  setForm((p) => ({ ...p, role: v as "viewer" | "manager" }))
                }
              >
                <SelectTrigger className="h-8 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="viewer">Viewer</SelectItem>
                  <SelectItem value="manager">Manager</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center justify-between rounded-md border border-gray-200 px-3 h-8">
              <span className="text-xs text-gray-600">Active</span>
              <Switch
                checked={form.active}
                onCheckedChange={(v) => setForm((p) => ({ ...p, active: v }))}
              />
            </div>
          </div>
          {mutation.isError && (
            <p className="text-sm text-red-600">
              {mutation.error instanceof Error ? mutation.error.message : "Failed"}
            </p>
          )}
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            size="sm"
            className="h-8 text-xs"
            onClick={() => onOpenChange(false)}
            disabled={mutation.isPending}
          >
            Cancel
          </Button>
          <Button
            size="sm"
            className="h-8 text-xs"
            disabled={!valid || mutation.isPending}
            onClick={() => mutation.mutate()}
          >
            {mutation.isPending && <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />}
            Create user
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EditPortalUserDialog({
  user,
  onOpenChange,
  onSuccess,
}: {
  user: CustomerPortalUser;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}) {
  const [form, setForm] = useState({
    fullName: user.fullName,
    role: user.role,
    active: user.active,
  });

  const mutation = useMutation({
    mutationFn: () =>
      updateCustomerPortalUser(user.customerId, user.id, {
        fullName: form.fullName.trim() || undefined,
        role: form.role,
        active: form.active,
      }),
    onSuccess: () => {
      onSuccess();
      onOpenChange(false);
    },
  });

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-base">Edit Portal User</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div className="space-y-1">
            <Label className="text-xs">Full name</Label>
            <Input
              className="h-8 text-sm"
              value={form.fullName}
              maxLength={100}
              onChange={(e) => setForm((p) => ({ ...p, fullName: e.target.value }))}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Email</Label>
            <Input className="h-8 text-sm bg-gray-50" value={user.email} disabled />
          </div>
          <div className="grid grid-cols-2 gap-3 items-end">
            <div className="space-y-1">
              <Label className="text-xs">Role</Label>
              <Select
                value={form.role}
                onValueChange={(v) =>
                  setForm((p) => ({ ...p, role: v as "viewer" | "manager" }))
                }
              >
                <SelectTrigger className="h-8 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="viewer">Viewer</SelectItem>
                  <SelectItem value="manager">Manager</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center justify-between rounded-md border border-gray-200 px-3 h-8">
              <span className="text-xs text-gray-600">Active</span>
              <Switch
                checked={form.active}
                onCheckedChange={(v) => setForm((p) => ({ ...p, active: v }))}
              />
            </div>
          </div>
          {mutation.isError && (
            <p className="text-sm text-red-600">
              {mutation.error instanceof Error ? mutation.error.message : "Failed"}
            </p>
          )}
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            size="sm"
            className="h-8 text-xs"
            onClick={() => onOpenChange(false)}
            disabled={mutation.isPending}
          >
            Cancel
          </Button>
          <Button
            size="sm"
            className="h-8 text-xs"
            disabled={mutation.isPending}
            onClick={() => mutation.mutate()}
          >
            {mutation.isPending && <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ResetPasswordDialog({
  user,
  onOpenChange,
  onSuccess,
}: {
  user: CustomerPortalUser;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}) {
  const [password, setPassword] = useState("");

  const mutation = useMutation({
    mutationFn: () =>
      updateCustomerPortalUser(user.customerId, user.id, { password }),
    onSuccess: () => {
      onSuccess();
      onOpenChange(false);
    },
  });

  const valid = password.length >= 8 && password.length <= 72;

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-base">Reset Password</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <p className="text-sm text-gray-600">
            Set a new password for <span className="font-medium">{user.email}</span>.
            Share it with the customer over a secure channel.
          </p>
          <div className="space-y-1">
            <Label className="text-xs">New password</Label>
            <Input
              type="text"
              className="h-8 text-sm font-mono"
              value={password}
              maxLength={72}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="At least 8 characters"
              autoFocus
            />
          </div>
          {mutation.isError && (
            <p className="text-sm text-red-600">
              {mutation.error instanceof Error ? mutation.error.message : "Failed"}
            </p>
          )}
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            size="sm"
            className="h-8 text-xs"
            onClick={() => onOpenChange(false)}
            disabled={mutation.isPending}
          >
            Cancel
          </Button>
          <Button
            size="sm"
            className="h-8 text-xs"
            disabled={!valid || mutation.isPending}
            onClick={() => mutation.mutate()}
          >
            {mutation.isPending && <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />}
            Reset password
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DeletePortalUserDialog({
  user,
  onOpenChange,
  onSuccess,
}: {
  user: CustomerPortalUser;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}) {
  const mutation = useMutation({
    mutationFn: () => deleteCustomerPortalUser(user.customerId, user.id),
    onSuccess: () => {
      onSuccess();
      onOpenChange(false);
    },
  });

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-base">Delete Portal User?</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <p className="text-sm text-gray-600">
            This will permanently remove portal access for{" "}
            <span className="font-medium">{user.email}</span>. This cannot be undone.
          </p>
          {mutation.isError && (
            <p className="text-sm text-red-600">
              {mutation.error instanceof Error ? mutation.error.message : "Failed"}
            </p>
          )}
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            size="sm"
            className="h-8 text-xs"
            onClick={() => onOpenChange(false)}
            disabled={mutation.isPending}
          >
            Cancel
          </Button>
          <Button
            size="sm"
            variant="destructive"
            className="h-8 text-xs"
            disabled={mutation.isPending}
            onClick={() => mutation.mutate()}
          >
            {mutation.isPending && <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />}
            Delete user
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
