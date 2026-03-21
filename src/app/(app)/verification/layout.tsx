"use client";

import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { useAuth } from "@/lib/auth/auth-context";
import type { Role } from "@/lib/types";

const VERIFICATION_ALLOWED_ROLES: Role[] = [
  "sales_vehicles",
  "admin",
  "super_admin",
];

export default function VerificationLayout({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();

  if (!user || !VERIFICATION_ALLOWED_ROLES.includes(user.role)) {
    return (
      <div className="space-y-4">
        <PageHeader title="Partner Verification" description="Role-restricted module" />
        <Card>
          <CardContent className="p-6">
            <p className="text-sm text-gray-600">
              Partner Verification is available only to Vehicle Sales, Vehicle Operations, and Admin roles.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return <div className="space-y-4">{children}</div>;
}
