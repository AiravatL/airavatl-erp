"use client";

import { useMemo } from "react";
import { useParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { EmptyState } from "@/components/shared/empty-state";
import { RateUpsertForm, toRateFormValues } from "@/components/rates/rate-upsert-form";
import { Card, CardContent } from "@/components/ui/card";
import { getRateById, updateRate } from "@/lib/api/rates";
import { useAuth } from "@/lib/auth/auth-context";
import { queryKeys } from "@/lib/query/keys";
import type { MarketRate, Role } from "@/lib/types";
import { ClipboardList } from "lucide-react";

const EDIT_ROLES: Role[] = ["sales_vehicles", "operations_vehicles", "admin", "super_admin"];
const AUTO_APPROVE_ROLES: Role[] = ["operations_vehicles", "admin", "super_admin"];
const REVIEW_ROLES: Role[] = ["operations_vehicles", "admin", "super_admin"];

function isRoleAllowed(role: Role, allowed: Role[]): boolean {
  return allowed.includes(role);
}

function canUserEditRate(user: { id: string; role: Role }, rate: MarketRate): boolean {
  if (!isRoleAllowed(user.role, EDIT_ROLES)) return false;
  if (user.role === "sales_vehicles") return rate.submittedBy === user.id;
  return true;
}

export default function EditRatePage() {
  const params = useParams<{ rateId: string }>();
  const rateId = params?.rateId ?? "";
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const rateQuery = useQuery({
    queryKey: queryKeys.rateById(rateId),
    queryFn: () => getRateById(rateId),
    enabled: Boolean(rateId),
  });

  const updateRateMutation = useMutation({
    mutationFn: (input: Parameters<typeof updateRate>[1]) => updateRate(rateId, input),
    onSuccess: (updated) => {
      queryClient.setQueryData(queryKeys.rateById(rateId), updated);
      void queryClient.invalidateQueries({ queryKey: ["rates"] });
    },
  });

  const rate = rateQuery.data ?? null;
  const hasEditRole = user ? isRoleAllowed(user.role, EDIT_ROLES) : false;
  const canEditLoadedRate = user && rate ? canUserEditRate(user, rate) : false;
  const helperNote = user && isRoleAllowed(user.role, AUTO_APPROVE_ROLES)
    ? "Changes saved by your role are auto-approved and published immediately."
    : "Changes from your role are submitted for review before publishing.";

  const initialValues = useMemo(() => {
    if (!rate) return null;
    return toRateFormValues({
      fromLocation: rate.fromLocation,
      toLocation: rate.toLocation,
      vehicleType: rate.vehicleType,
      rateCategory: rate.rateCategory,
      freightRate: rate.freightRate,
      ratePerTon: rate.ratePerTon,
      ratePerKg: rate.ratePerKg,
      confidenceLevel: rate.confidenceLevel,
      source: rate.source,
      remarks: rate.remarks,
    });
  }, [rate]);

  async function handleSubmit(input: Parameters<typeof updateRate>[1]) {
    const updated = await updateRateMutation.mutateAsync(input);
    const isApproved = updated.status === "approved";
    const canReview = user ? isRoleAllowed(user.role, REVIEW_ROLES) : false;

    return {
      successMessage: isApproved
        ? "Rate updated and approved."
        : "Rate updated and submitted for review.",
      redirectTo: isApproved ? "/rates" : canReview ? "/rates/review" : "/rates",
    };
  }

  if (!rateId) {
    return (
      <Card>
        <CardContent className="p-4">
          <p className="text-sm text-red-600">Missing rateId</p>
        </CardContent>
      </Card>
    );
  }

  if (user && !hasEditRole) {
    return (
      <EmptyState
        icon={ClipboardList}
        title="Access restricted"
        description="Rate editing is available to Vehicle Sales and Vehicle Operations roles."
      />
    );
  }

  if (rateQuery.isLoading) {
    return (
      <Card>
        <CardContent className="p-4">
          <p className="text-sm text-gray-500">Loading rate...</p>
        </CardContent>
      </Card>
    );
  }

  if (rateQuery.isError || !rate || !initialValues) {
    return (
      <Card>
        <CardContent className="p-4">
          <p className="text-sm text-red-600">
            {rateQuery.error instanceof Error ? rateQuery.error.message : "Unable to load rate"}
          </p>
        </CardContent>
      </Card>
    );
  }

  if (user && !canEditLoadedRate) {
    return (
      <EmptyState
        icon={ClipboardList}
        title="Access restricted"
        description="You can only edit rates you are allowed to manage."
      />
    );
  }

  return (
    <RateUpsertForm
      mode="edit"
      title="Edit Rate"
      description="Update the selected market rate."
      initialValues={initialValues}
      submitButtonLabel="Save Changes"
      helperNote={helperNote}
      onSubmit={handleSubmit}
    />
  );
}
