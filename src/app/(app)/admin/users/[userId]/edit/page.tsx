"use client";

import { useMemo } from "react";
import { useParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { CREATE_USER_ROLE_OPTIONS } from "@/lib/auth/roles";
import {
  getAdminUser,
  type AdminUserRow,
  updateAdminUser,
} from "@/lib/api/admin-users";
import { queryKeys } from "@/lib/query/keys";
import { UserUpsertForm, type UserUpsertFormValues } from "@/components/admin/user-upsert-form";

const EMPTY_EDIT_VALUES: UserUpsertFormValues = {
  fullName: "",
  email: "",
  role: "operations_consigner",
  password: "",
  active: true,
};

export default function EditUserPage() {
  const params = useParams<{ userId: string }>();
  const userId = params?.userId ?? "";
  const queryClient = useQueryClient();

  const userQuery = useQuery({
    queryKey: queryKeys.adminUser(userId),
    queryFn: () => getAdminUser(userId),
    enabled: Boolean(userId),
  });

  const updateUserMutation = useMutation({
    mutationFn: async (values: UserUpsertFormValues) => {
      if (!userId) throw new Error("Missing userId");
      return updateAdminUser(userId, {
        fullName: values.fullName,
        role: values.role,
        active: values.active,
        password: values.password.trim().length > 0 ? values.password : undefined,
      });
    },
    onSuccess: (updated) => {
      queryClient.setQueryData(queryKeys.adminUser(userId), updated);
      queryClient.setQueryData<AdminUserRow[]>(queryKeys.adminUsers, (current = []) =>
        current.map((user) => (user.id === updated.id ? updated : user)),
      );
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.adminUser(userId) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.adminUsers });
    },
  });

  const user = userQuery.data ?? null;
  const initialValues = useMemo<UserUpsertFormValues>(() => {
    if (!user) return EMPTY_EDIT_VALUES;
    return {
      fullName: user.fullName,
      email: user.email,
      role: user.role,
      password: "",
      active: user.active,
    };
  }, [user]);

  async function handleSubmit(values: UserUpsertFormValues) {
    const result = await updateUserMutation.mutateAsync(values);
    return values.password.trim().length > 0
      ? `User ${result.fullName} updated and password reset successfully.`
      : `User ${result.fullName} updated successfully.`;
  }

  if (!userId) {
    return (
      <div className="p-4 sm:p-6">
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-red-600">Missing userId</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (userQuery.isLoading) {
    return (
      <div className="p-4 sm:p-6">
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-gray-500">Loading user...</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!user || userQuery.isError) {
    return (
      <div className="p-4 sm:p-6">
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-red-600">
              {userQuery.error instanceof Error ? userQuery.error.message : "Unable to load user"}
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <UserUpsertForm
      mode="edit"
      title="Edit User"
      description="Update user details and access role"
      roleOptions={CREATE_USER_ROLE_OPTIONS}
      initialValues={initialValues}
      onSubmit={handleSubmit}
    />
  );
}
