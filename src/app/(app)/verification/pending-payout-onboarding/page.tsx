"use client";

import Link from "next/link";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/shared/page-header";
import {
  listPendingPayoutOnboarding,
  retryPayoutOnboarding,
  type PendingPayoutOnboardingItem,
} from "@/lib/api/verification";
import { queryKeys } from "@/lib/query/keys";
import { ArrowLeft, RefreshCw, Loader2, AlertTriangle, ExternalLink } from "lucide-react";

const TYPE_BADGE: Record<string, string> = {
  individual_driver: "bg-blue-50 text-blue-700",
  transporter: "bg-purple-50 text-purple-700",
};
const TYPE_LABEL: Record<string, string> = {
  individual_driver: "Individual Driver",
  transporter: "Transporter",
};

function formatPhone(phone: string) {
  const digits = phone.replace(/^91/, "");
  if (digits.length === 10) return `+91 ${digits.slice(0, 5)} ${digits.slice(5)}`;
  return phone;
}

function describePayoutMethod(item: PendingPayoutOnboardingItem) {
  const parts: string[] = [];
  if (item.bankAccountNumberLast4) {
    parts.push(`Bank ····${item.bankAccountNumberLast4}${item.bankIfscCode ? ` · ${item.bankIfscCode}` : ""}`);
  }
  if (item.upiVpa) {
    parts.push(`UPI ${item.upiVpa}`);
  }
  return parts.length > 0 ? parts.join(" + ") : "—";
}

export default function PendingPayoutOnboardingPage() {
  const queryClient = useQueryClient();
  const listQuery = useQuery({
    queryKey: queryKeys.pendingPayoutOnboarding,
    queryFn: listPendingPayoutOnboarding,
  });

  const items = listQuery.data?.items ?? [];
  const total = listQuery.data?.total ?? 0;

  const retryAllMutation = useMutation({
    mutationFn: async () => {
      const results: { userId: string; ok: boolean; message?: string }[] = [];
      for (const it of items) {
        try {
          await retryPayoutOnboarding(it.userId);
          results.push({ userId: it.userId, ok: true });
        } catch (err) {
          results.push({
            userId: it.userId,
            ok: false,
            message: err instanceof Error ? err.message : "Failed",
          });
        }
      }
      return results;
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.pendingPayoutOnboarding });
      queryClient.invalidateQueries({ queryKey: queryKeys.operationsHealth });
    },
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Link
          href="/reports"
          className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Reports
        </Link>
      </div>

      <PageHeader
        title="Partners Pending Onboarding"
        description="KYC verified but RazorpayX fund account isn't linked yet. Retry to re-run the onboarding step."
      >
        {items.length > 0 && (
          <Button
            size="sm"
            variant="outline"
            className="h-8 text-xs"
            onClick={() => retryAllMutation.mutate()}
            disabled={retryAllMutation.isPending}
          >
            {retryAllMutation.isPending ? (
              <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
            ) : (
              <RefreshCw className="h-3.5 w-3.5 mr-1" />
            )}
            Retry All ({total})
          </Button>
        )}
      </PageHeader>

      {retryAllMutation.data && (
        <Card>
          <CardContent className="p-3">
            <p className="text-xs text-gray-700">
              Retry-all finished:{" "}
              <span className="font-medium text-emerald-700">
                {retryAllMutation.data.filter((r) => r.ok).length} succeeded
              </span>
              {" · "}
              <span className="font-medium text-red-700">
                {retryAllMutation.data.filter((r) => !r.ok).length} failed
              </span>
            </p>
            {retryAllMutation.data.filter((r) => !r.ok).length > 0 && (
              <ul className="mt-2 space-y-0.5 text-[11px] text-red-700">
                {retryAllMutation.data
                  .filter((r) => !r.ok)
                  .map((r) => (
                    <li key={r.userId}>
                      {r.userId.slice(0, 8)}… — {r.message}
                    </li>
                  ))}
              </ul>
            )}
          </CardContent>
        </Card>
      )}

      {listQuery.isLoading && (
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-gray-500">Loading…</p>
          </CardContent>
        </Card>
      )}

      {listQuery.isError && (
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-red-600">
              {listQuery.error instanceof Error
                ? listQuery.error.message
                : "Unable to load partners"}
            </p>
          </CardContent>
        </Card>
      )}

      {!listQuery.isLoading && !listQuery.isError && items.length === 0 && (
        <Card>
          <CardContent className="p-8 text-center">
            <p className="text-sm font-medium text-gray-900">All partners onboarded</p>
            <p className="text-xs text-gray-500 mt-1">
              Every verified partner has a RazorpayX fund account linked.
            </p>
          </CardContent>
        </Card>
      )}

      {items.length > 0 && (
        <Card>
          <CardContent className="p-0">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50/50">
                  <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500">
                    Name
                  </th>
                  <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500 w-[140px]">
                    Type
                  </th>
                  <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500">
                    Payout method on file
                  </th>
                  <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500 w-[120px]">
                    City
                  </th>
                  <th className="px-4 py-2.5 text-right text-xs font-medium text-gray-500 w-[200px]">
                    Action
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {items.map((item) => (
                  <PartnerRow key={item.userId} item={item} />
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function PartnerRow({ item }: { item: PendingPayoutOnboardingItem }) {
  const queryClient = useQueryClient();
  const retryMutation = useMutation({
    mutationFn: () => retryPayoutOnboarding(item.userId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.pendingPayoutOnboarding });
      queryClient.invalidateQueries({ queryKey: queryKeys.operationsHealth });
      queryClient.invalidateQueries({
        queryKey: queryKeys.partnerPayoutStatus(item.userId),
      });
    },
  });

  return (
    <tr className="hover:bg-gray-50/50 transition-colors">
      <td className="px-4 py-3">
        <Link
          href={`/verification/${item.userId}`}
          className="font-medium text-blue-600 hover:underline"
        >
          {item.fullName || "—"}
        </Link>
        <p className="text-[11px] text-gray-500">{formatPhone(item.phone)}</p>
      </td>
      <td className="px-4 py-3">
        <Badge
          variant="outline"
          className={`border-0 text-[10px] ${TYPE_BADGE[item.userType] ?? "bg-gray-100 text-gray-700"}`}
        >
          {TYPE_LABEL[item.userType] ?? item.userType}
        </Badge>
      </td>
      <td className="px-4 py-3 text-gray-600 truncate max-w-[300px]">
        {describePayoutMethod(item)}
      </td>
      <td className="px-4 py-3 text-gray-600">{item.city ?? "—"}</td>
      <td className="px-4 py-3">
        <div className="flex items-center justify-end gap-2">
          {retryMutation.isError && (
            <span title={retryMutation.error instanceof Error ? retryMutation.error.message : ""}>
              <AlertTriangle className="h-3.5 w-3.5 text-red-500" />
            </span>
          )}
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-xs"
            onClick={() => retryMutation.mutate()}
            disabled={retryMutation.isPending}
          >
            {retryMutation.isPending ? (
              <Loader2 className="h-3 w-3 mr-1 animate-spin" />
            ) : (
              <RefreshCw className="h-3 w-3 mr-1" />
            )}
            Retry
          </Button>
          <Link
            href={`/verification/${item.userId}`}
            className="text-xs text-gray-500 hover:text-gray-700"
            title="Open verification page"
          >
            <ExternalLink className="h-3.5 w-3.5" />
          </Link>
        </div>
      </td>
    </tr>
  );
}
