"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/shared/page-header";
import { formatCurrency, formatDate } from "@/lib/formatters";
import { Download } from "lucide-react";
import Link from "next/link";

const BUCKET_LABELS: Record<string, string> = { "0-7": "0-7 days", "8-15": "8-15 days", "16-30": "16-30 days", "30+": "30+ days" };
const BUCKET_COLORS: Record<string, string> = { "0-7": "bg-emerald-50 text-emerald-700", "8-15": "bg-amber-50 text-amber-700", "16-30": "bg-orange-50 text-orange-700", "30+": "bg-red-50 text-red-700" };

export default function ReceivablesPage() {
  // TODO(backend): add global receivables API and replace static placeholders.
  const customerGroups: Array<{
    customer: { id: string; name: string; creditDays: number };
    items: Array<{
      id: string;
      tripId: string;
      tripCode: string;
      dueDate: string;
      followUpStatus: string;
      amount: number;
      agingBucket: "0-7" | "8-15" | "16-30" | "30+";
    }>;
    total: number;
  }> = [];

  const buckets = ["0-7", "8-15", "16-30", "30+"] as const;
  const bucketTotals = buckets.map((b) => ({
    bucket: b,
    total: 0,
    count: 0,
  }));
  const grandTotal = 0;

  return (
    <div className="p-4 sm:p-6 space-y-4">
      <PageHeader title="Receivables & Aging" description={`Total outstanding: ${formatCurrency(grandTotal)}`}>
        <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5">
          <Download className="h-3.5 w-3.5" /> Export
        </Button>
      </PageHeader>

      {/* Aging buckets */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {bucketTotals.map((b) => (
          <Card key={b.bucket}>
            <CardContent className="p-3">
              <p className="text-xs text-gray-500">{BUCKET_LABELS[b.bucket]}</p>
              <p className="text-lg font-semibold text-gray-900 mt-0.5">{formatCurrency(b.total)}</p>
              <p className="text-[11px] text-gray-400">{b.count} invoices</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardContent className="p-3 text-xs text-gray-600">
          TODO: Receivables summary and aging are temporarily static until global receivables APIs are wired.
        </CardContent>
      </Card>

      {/* Customer-wise breakdown */}
      <div className="space-y-3">
        {customerGroups.map(({ customer, items, total }) => (
          <Card key={customer.id}>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-sm font-medium text-gray-900">{customer.name}</CardTitle>
                  <p className="text-[11px] text-gray-500">Credit: {customer.creditDays} days</p>
                </div>
                <span className="text-sm font-semibold text-gray-900">{formatCurrency(total)}</span>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <div className="divide-y divide-gray-50">
                {items.map((r) => (
                  <div key={r.id} className="flex items-center justify-between px-4 py-2.5">
                    <div>
                      <Link href={`/trips/${r.tripId}`} className="text-sm text-blue-600 hover:underline">{r.tripCode}</Link>
                      <p className="text-[11px] text-gray-500">Due {formatDate(r.dueDate)}</p>
                      {r.followUpStatus && <p className="text-[11px] text-gray-400">{r.followUpStatus}</p>}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-gray-900">{formatCurrency(r.amount)}</span>
                      <Badge variant="outline" className={`text-[10px] border-0 ${BUCKET_COLORS[r.agingBucket]}`}>
                        {r.agingBucket}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
