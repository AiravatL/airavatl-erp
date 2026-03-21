"use client";

import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { useAuth } from "@/lib/auth/auth-context";
import type { Role } from "@/lib/types";

const ALLOWED_ROLES: Role[] = [
  "super_admin",
  "admin",
  "operations",
];

export default function DeliveryRequestsLayout({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();

  if (!user || !ALLOWED_ROLES.includes(user.role)) {
    return (
      <div className="space-y-4">
        <PageHeader title="Delivery Requests" description="Role-restricted module" />
        <Card>
          <CardContent className="p-6">
            <p className="text-sm text-gray-600">
              Delivery Requests is available only to Operations and Admin roles.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return <div className="space-y-4">{children}</div>;
}
