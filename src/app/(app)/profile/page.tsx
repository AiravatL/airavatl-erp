"use client";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/shared/page-header";
import { useAuth } from "@/lib/auth/auth-context";
import { ROLE_LABELS } from "@/lib/auth/roles";
import { UserRound } from "lucide-react";

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return parts.slice(0, 2).map((part) => part[0]?.toUpperCase() ?? "").join("") || "U";
}

function FieldRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-gray-200 bg-gray-50 p-3">
      <p className="text-[11px] uppercase tracking-wide text-gray-500">{label}</p>
      <p className="mt-1 text-sm font-medium text-gray-900 break-all">{value}</p>
    </div>
  );
}

export default function ProfilePage() {
  const { user } = useAuth();

  if (!user) {
    return (
      <div className="p-4 sm:p-6">
        <Card>
          <CardContent className="p-4 text-sm text-gray-500">Loading profile...</CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-4 p-4 sm:p-6">
      <PageHeader
        title="My Profile"
        description="Your account identity and access role"
      />

      <Card>
        <CardContent className="p-4 sm:p-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-gray-200 text-lg font-semibold text-gray-700">
              {initials(user.fullName)}
            </div>
            <div className="min-w-0">
              <p className="truncate text-base font-semibold text-gray-900">{user.fullName}</p>
              <p className="truncate text-sm text-gray-500">{user.email}</p>
              <div className="mt-1 flex items-center gap-2">
                <Badge variant="outline" className="text-[11px]">
                  {ROLE_LABELS[user.role]}
                </Badge>
                <Badge
                  variant="outline"
                  className={user.active ? "border-emerald-200 text-emerald-700" : "border-red-200 text-red-700"}
                >
                  {user.active ? "Active" : "Inactive"}
                </Badge>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm">
              <UserRound className="h-4 w-4" />
              Account Details
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <FieldRow label="Full Name" value={user.fullName} />
            <FieldRow label="Email" value={user.email} />
            <FieldRow label="Role" value={ROLE_LABELS[user.role]} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
