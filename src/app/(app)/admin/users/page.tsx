"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { PageHeader } from "@/components/shared/page-header";
import { ROLE_BADGE_COLORS, ROLE_LABELS, ROLE_OPTIONS } from "@/lib/auth/roles";
import {
  listAdminUsers,
  removeAdminUser,
  type AdminUserRow,
  updateAdminUserStatus,
} from "@/lib/api/admin-users";
import { queryKeys } from "@/lib/query/keys";
import { Mail, MoreVertical, Pencil, Plus, Trash2 } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export default function UsersAdminPage() {
  const queryClient = useQueryClient();
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionInfo, setActionInfo] = useState<string | null>(null);
  const [pendingUserIds, setPendingUserIds] = useState<string[]>([]);

  const usersQuery = useQuery({
    queryKey: queryKeys.adminUsers,
    queryFn: listAdminUsers,
  });

  const users = useMemo(() => usersQuery.data ?? [], [usersQuery.data]);
  const groupedByRole = useMemo(
    () =>
      ROLE_OPTIONS.map((roleOption) => ({
        ...roleOption,
        users: users.filter((user) => user.role === roleOption.value),
      })),
    [users],
  );

  function setPending(userId: string, pending: boolean) {
    setPendingUserIds((prev) => {
      if (pending) return prev.includes(userId) ? prev : [...prev, userId];
      return prev.filter((id) => id !== userId);
    });
  }

  const statusMutation = useMutation({
    mutationFn: async ({ userId, nextActive }: { userId: string; nextActive: boolean }) =>
      updateAdminUserStatus(userId, nextActive),
    onMutate: async ({ userId, nextActive }) => {
      setActionError(null);
      setActionInfo(null);
      setPending(userId, true);
      await queryClient.cancelQueries({ queryKey: queryKeys.adminUsers });
      const previousUsers = queryClient.getQueryData<AdminUserRow[]>(queryKeys.adminUsers) ?? [];
      queryClient.setQueryData<AdminUserRow[]>(queryKeys.adminUsers, (current = []) =>
        current.map((user) => (user.id === userId ? { ...user, active: nextActive } : user)),
      );
      return { previousUsers };
    },
    onSuccess: (_data, variables) => {
      setActionInfo(`User ${variables.nextActive ? "activated" : "deactivated"} successfully.`);
    },
    onError: (error, variables, context) => {
      if (context?.previousUsers) {
        queryClient.setQueryData(queryKeys.adminUsers, context.previousUsers);
      }
      setActionError(error instanceof Error ? error.message : "Unable to update status");
      setPending(variables.userId, false);
    },
    onSettled: (_data, _error, variables) => {
      setPending(variables.userId, false);
      void queryClient.invalidateQueries({ queryKey: queryKeys.adminUsers });
    },
  });

  const removeMutation = useMutation({
    mutationFn: async ({ userId }: { userId: string }) => removeAdminUser(userId),
    onMutate: async ({ userId }) => {
      setActionError(null);
      setActionInfo(null);
      setPending(userId, true);
      await queryClient.cancelQueries({ queryKey: queryKeys.adminUsers });
      const previousUsers = queryClient.getQueryData<AdminUserRow[]>(queryKeys.adminUsers) ?? [];
      queryClient.setQueryData<AdminUserRow[]>(queryKeys.adminUsers, (current = []) =>
        current.filter((user) => user.id !== userId),
      );
      return { previousUsers };
    },
    onSuccess: () => {
      setActionInfo("User removed (deactivated) successfully.");
    },
    onError: (error, variables, context) => {
      if (context?.previousUsers) {
        queryClient.setQueryData(queryKeys.adminUsers, context.previousUsers);
      }
      setActionError(error instanceof Error ? error.message : "Unable to remove user");
      setPending(variables.userId, false);
    },
    onSettled: (_data, _error, variables) => {
      setPending(variables.userId, false);
      void queryClient.invalidateQueries({ queryKey: queryKeys.adminUsers });
    },
  });

  async function handleStatusToggle(userId: string, nextActive: boolean) {
    await statusMutation.mutateAsync({ userId, nextActive });
  }

  async function handleRemove(user: AdminUserRow) {
    setActionError(null);
    setActionInfo(null);
    const confirmed = window.confirm(`Remove ${user.fullName}? This will deactivate the user account.`);
    if (!confirmed) return;
    await removeMutation.mutateAsync({ userId: user.id });
  }

  const loadError = usersQuery.error instanceof Error ? usersQuery.error.message : null;

  return (
    <div className="p-4 sm:p-6 space-y-4">
      <PageHeader title="User Management" description={`${users.length} users`}>
        <Button size="sm" className="h-8 text-xs gap-1.5" asChild>
          <Link href="/admin/users/new">
            <Plus className="h-3.5 w-3.5" /> Add User
          </Link>
        </Button>
      </PageHeader>

      {loadError && (
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-red-600">{loadError}</p>
          </CardContent>
        </Card>
      )}

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

      {!loadError && usersQuery.isLoading && (
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-gray-500">Loading users...</p>
          </CardContent>
        </Card>
      )}

      {!loadError && !usersQuery.isLoading && (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {groupedByRole.map((roleGroup) => (
            <Card key={roleGroup.value} className="bg-gray-50/60 border-gray-200">
              <CardContent className="p-3 space-y-3">
                <div className="flex items-center justify-between">
                  <Badge
                    variant="outline"
                    className={`text-[10px] border-0 ${ROLE_BADGE_COLORS[roleGroup.value]}`}
                  >
                    {ROLE_LABELS[roleGroup.value]}
                  </Badge>
                  <span className="text-[11px] text-gray-500">
                    {roleGroup.users.length} user{roleGroup.users.length === 1 ? "" : "s"}
                  </span>
                </div>

                {roleGroup.users.length === 0 ? (
                  <div className="rounded-md border border-dashed border-gray-200 bg-white px-3 py-4 text-center">
                    <p className="text-xs text-gray-400">No users in this role</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {roleGroup.users.map((user) => {
                      const isProtectedUser = user.role === "super_admin";
                      const isPending = pendingUserIds.includes(user.id);

                      return (
                        <div key={user.id} className="rounded-md border border-gray-200 bg-white p-3">
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex items-center gap-2 min-w-0">
                              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gray-200 text-xs font-medium text-gray-700">
                                {user.fullName
                                  .split(" ")
                                  .map((namePart) => namePart[0])
                                  .join("")}
                              </div>
                              <div className="min-w-0">
                                <p className="truncate text-sm font-medium text-gray-900">{user.fullName}</p>
                                <p className="truncate text-[11px] text-gray-500">ID: {user.id.slice(0, 8)}</p>
                              </div>
                            </div>
                            <div className="flex items-center gap-1">
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-7 w-7 text-gray-400 hover:text-gray-600"
                                    disabled={isPending}
                                  >
                                    <MoreVertical className="h-4 w-4" />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                  {isProtectedUser ? (
                                    <DropdownMenuItem disabled>
                                      <Pencil className="h-3.5 w-3.5 mr-2" />
                                      Edit
                                    </DropdownMenuItem>
                                  ) : (
                                    <DropdownMenuItem asChild>
                                      <Link href={`/admin/users/${user.id}/edit`}>
                                        <Pencil className="h-3.5 w-3.5 mr-2" />
                                        Edit
                                      </Link>
                                    </DropdownMenuItem>
                                  )}
                                  <DropdownMenuItem
                                    disabled={isProtectedUser || isPending}
                                    className="text-red-600 focus:text-red-600"
                                    onSelect={() => {
                                      if (isProtectedUser) return;
                                      void handleRemove(user);
                                    }}
                                  >
                                    <Trash2 className="h-3.5 w-3.5 mr-2" />
                                    Remove
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </div>
                          </div>

                          <div className="mt-2 flex items-center gap-1.5 text-xs text-gray-600">
                            <Mail className="h-3.5 w-3.5 text-gray-400" />
                            <span className="truncate">{user.email}</span>
                          </div>

                          <div className="mt-3 flex items-center justify-between rounded border border-gray-100 px-2.5 py-2">
                            <Badge
                              variant="outline"
                              className={`text-[10px] border-0 ${
                                user.active ? "bg-emerald-50 text-emerald-700" : "bg-gray-100 text-gray-500"
                              }`}
                            >
                              {user.active ? "Active" : "Inactive"}
                            </Badge>
                            <div className="flex items-center gap-2">
                              <span className="text-[11px] text-gray-500">
                                {isProtectedUser ? "Managed separately" : user.active ? "Deactivate" : "Activate"}
                              </span>
                              <Switch
                                checked={user.active}
                                disabled={isPending || isProtectedUser}
                                onCheckedChange={(checked) => {
                                  void handleStatusToggle(user.id, checked);
                                }}
                              />
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
