"use client";

import { useMutation } from "@tanstack/react-query";
import { EmptyState } from "@/components/shared/empty-state";
import {
  EMPTY_RATE_FORM_VALUES,
  RateUpsertForm,
} from "@/components/rates/rate-upsert-form";
import { submitRate } from "@/lib/api/rates";
import { useAuth } from "@/lib/auth/auth-context";
import type { Role } from "@/lib/types";
import { ClipboardList } from "lucide-react";

const SUBMIT_ROLES: Role[] = ["sales_vehicles", "operations_vehicles", "admin", "super_admin"];
const AUTO_APPROVE_ROLES: Role[] = ["operations_vehicles", "admin", "super_admin"];
const REVIEW_ROLES: Role[] = ["operations_vehicles", "admin", "super_admin"];

function isRoleAllowed(role: Role, allowed: Role[]): boolean {
  return allowed.includes(role);
}

export default function SubmitRatePage() {
  const { user } = useAuth();
  const submitRateMutation = useMutation({ mutationFn: submitRate });

  if (user && !isRoleAllowed(user.role, SUBMIT_ROLES)) {
    return (
      <EmptyState
        icon={ClipboardList}
        title="Access restricted"
        description="Rate submission is available to Vehicle Sales and Vehicle Operations roles."
      />
    );
  }

  const isAutoApprove = user ? isRoleAllowed(user.role, AUTO_APPROVE_ROLES) : false;
  const helperNote = isAutoApprove
    ? "Rates submitted by your role are auto-approved and become visible in All Rates immediately."
    : "Rates submitted by your role are sent to Vehicle Operations/Admin for review before publishing.";

  async function handleSubmit(input: Parameters<typeof submitRate>[0]) {
    const created = await submitRateMutation.mutateAsync(input);
    const autoApproved = created.status === "approved";
    const canReview = user ? isRoleAllowed(user.role, REVIEW_ROLES) : false;

    return {
      successMessage: autoApproved ? "Rate added and approved." : "Rate submitted for review.",
      redirectTo: autoApproved ? "/rates" : canReview ? "/rates/review" : "/rates",
    };
  }

  return (
    <RateUpsertForm
      mode="create"
      title="Submit New Rate"
      description="Add a new market rate for your route and vehicle segment."
      initialValues={EMPTY_RATE_FORM_VALUES}
      submitButtonLabel={isAutoApprove ? "Save Rate" : "Submit for Review"}
      helperNote={helperNote}
      onSubmit={handleSubmit}
    />
  );
}
