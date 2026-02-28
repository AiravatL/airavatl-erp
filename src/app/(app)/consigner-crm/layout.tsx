"use client";

import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { useAuth } from "@/lib/auth/auth-context";
import type { Role } from "@/lib/types";

const CONSIGNER_CRM_ALLOWED_ROLES: Role[] = ["sales_consigner", "admin", "super_admin"];

export default function ConsignerCrmLayout({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();

  if (!user || !CONSIGNER_CRM_ALLOWED_ROLES.includes(user.role)) {
    return (
      <div className="space-y-4">
        <PageHeader title="Consigner CRM" description="Role-restricted module" />
        <Card>
          <CardContent className="p-6">
            <p className="text-sm text-gray-600">
              Consigner CRM is available only to Sales (Consigner) and Admin roles.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return <div className="space-y-4">{children}</div>;
}
