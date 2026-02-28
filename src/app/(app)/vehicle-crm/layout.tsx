"use client";

import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { useAuth } from "@/lib/auth/auth-context";
import type { Role } from "@/lib/types";

const VEHICLE_CRM_ALLOWED_ROLES: Role[] = ["sales_vehicles", "admin", "super_admin"];

export default function VehicleCrmLayout({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();

  if (!user || !VEHICLE_CRM_ALLOWED_ROLES.includes(user.role)) {
    return (
      <div className="space-y-4">
        <PageHeader title="Vehicle CRM" description="Role-restricted module" />
        <Card>
          <CardContent className="p-6">
            <p className="text-sm text-gray-600">
              Vehicle CRM is available only to Vehicle Sales and Admin roles.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return <div className="space-y-4">{children}</div>;
}
