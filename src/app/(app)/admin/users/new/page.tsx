"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { CREATE_USER_ROLE_OPTIONS } from "@/lib/auth/roles";
import { createAdminUser, type AdminUserRow } from "@/lib/api/admin-users";
import { queryKeys } from "@/lib/query/keys";
import { UserUpsertForm, type UserUpsertFormValues } from "@/components/admin/user-upsert-form";

const DEFAULT_CREATE_VALUES: UserUpsertFormValues = {
  fullName: "",
  email: "",
  role: "operations_consigner",
  password: "",
  active: true,
};

export default function AddUserPage() {
  const queryClient = useQueryClient();
  const createUserMutation = useMutation({
    mutationFn: createAdminUser,
    onSuccess: (created) => {
      queryClient.setQueryData<AdminUserRow[]>(queryKeys.adminUsers, (current = []) => [created, ...current]);
      void queryClient.invalidateQueries({ queryKey: queryKeys.adminUsers });
    },
  });

  async function handleCreate(values: UserUpsertFormValues) {
    const payload = {
      fullName: values.fullName,
      email: values.email,
      role: values.role,
      password: values.password,
      active: values.active,
    };
    const result = await createUserMutation.mutateAsync(payload);
    return `User ${result.fullName} created successfully.`;
  }

  return (
    <UserUpsertForm
      mode="create"
      title="Add User"
      description="Create a new user account and assign a role"
      roleOptions={CREATE_USER_ROLE_OPTIONS}
      initialValues={DEFAULT_CREATE_VALUES}
      onSubmit={handleCreate}
    />
  );
}
