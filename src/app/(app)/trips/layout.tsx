"use client";

import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { useAuth } from "@/lib/auth/auth-context";
import type { Role } from "@/lib/types";

const ALLOWED_ROLES: Role[] = [
  "super_admin",
  "admin",
  "sales_consigner",
  "operations",
  "accounts",
];

export default function TripsLayout({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();

  if (!user || !ALLOWED_ROLES.includes(user.role)) {
    return (
      <div className="space-y-4">
        <PageHeader title="Trips" description="Role-restricted module" />
        <Card>
          <CardContent className="p-6">
            <p className="text-sm text-gray-600">
              Trips is available only to Admin, Sales, and Operations roles.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return <div className="space-y-4">{children}</div>;
}
