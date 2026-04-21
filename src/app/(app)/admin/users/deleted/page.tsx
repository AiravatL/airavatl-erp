"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Mail, Trash2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { useAuth } from "@/lib/auth/auth-context";
import { ROLE_BADGE_COLORS, ROLE_LABELS } from "@/lib/auth/roles";
import { listDeletedAdminUsers } from "@/lib/api/admin-users";
import { queryKeys } from "@/lib/query/keys";
import { formatDate } from "@/lib/formatters";

export default function DeletedAdminUsersPage() {
  const { user: currentUser } = useAuth();
  const isSuperAdmin = currentUser?.role === "super_admin";

  const query = useQuery({
    queryKey: queryKeys.adminUsersDeleted,
    queryFn: listDeletedAdminUsers,
    enabled: isSuperAdmin,
  });

  const rows = useMemo(() => query.data ?? [], [query.data]);

  if (!isSuperAdmin) {
    return (
      <div className="space-y-4 p-4 sm:p-6">
        <Link
          href="/admin/users"
          className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700"
        >
          <ArrowLeft className="h-4 w-4" /> Back to Users
        </Link>
        <Card>
          <CardContent className="p-6 text-sm text-red-600">
            Only Super Admin can view deleted users.
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-4 p-4 sm:p-6">
      <Link
        href="/admin/users"
        className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700"
      >
        <ArrowLeft className="h-4 w-4" /> Back to Users
      </Link>

      <PageHeader
        title="Deleted Users"
        description="Permanently-deleted admin accounts. Profile rows are retained for audit and FK integrity; the auth user has been removed."
      />

      {query.isLoading ? (
        <Card>
          <CardContent className="p-4 text-sm text-gray-500">Loading…</CardContent>
        </Card>
      ) : query.isError ? (
        <Card>
          <CardContent className="p-4 text-sm text-red-600">
            {query.error instanceof Error ? query.error.message : "Unable to load"}
          </CardContent>
        </Card>
      ) : rows.length === 0 ? (
        <EmptyState
          icon={Trash2}
          title="No deleted users"
          description="Users permanently deleted from the Users page will appear here."
        />
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="divide-y divide-gray-100">
              {rows.map((u) => {
                const roleLabel = ROLE_LABELS[u.role as keyof typeof ROLE_LABELS] ?? u.role;
                const roleColor =
                  ROLE_BADGE_COLORS[u.role as keyof typeof ROLE_BADGE_COLORS] ??
                  "bg-gray-100 text-gray-700";
                return (
                  <div key={u.id} className="flex items-start justify-between gap-3 p-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-medium text-gray-900 truncate">
                          {u.fullName || u.email}
                        </p>
                        <Badge variant="outline" className={`border-0 text-[10px] ${roleColor}`}>
                          {roleLabel}
                        </Badge>
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-gray-500">
                        <span className="inline-flex items-center gap-1">
                          <Mail className="h-3 w-3" /> {u.email}
                        </span>
                        {u.deletedAt && (
                          <span className="text-red-600">
                            Deleted {formatDate(u.deletedAt)}
                          </span>
                        )}
                        {u.createdAt && (
                          <span>Created {formatDate(u.createdAt)}</span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
