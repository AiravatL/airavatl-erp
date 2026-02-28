import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { QuoteVersion } from "@/lib/types";
import { formatCurrency, formatDate } from "@/lib/formatters";
import { AlertTriangle, Check } from "lucide-react";
import { EmptyState } from "@/components/shared/empty-state";
import { FileText } from "lucide-react";

export function QuoteTab({ quotes }: { quotes: QuoteVersion[] }) {
  if (quotes.length === 0) {
    return (
      <EmptyState
        icon={FileText}
        title="No quotes yet"
        description="Create a quote to get started with pricing for this trip."
        action={<Button size="sm" className="h-8 text-xs">Create Quote</Button>}
      />
    );
  }

  return (
    <div className="space-y-3">
      {quotes.map((q) => (
        <Card key={q.id}>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium text-gray-900">
                Version {q.version}
              </CardTitle>
              <div className="flex items-center gap-2">
                {q.lowMarginFlag && (
                  <Badge variant="outline" className="border-amber-200 bg-amber-50 text-amber-700 text-[10px] gap-1">
                    <AlertTriangle className="h-3 w-3" /> Low Margin
                  </Badge>
                )}
                {q.approved && (
                  <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-700 text-[10px] gap-1">
                    <Check className="h-3 w-3" /> Approved
                  </Badge>
                )}
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <QuoteField label="Market Rate" value={formatCurrency(q.marketRate)} />
              <QuoteField label="Vendor Cost" value={formatCurrency(q.vendorExpectedCost)} />
              <QuoteField label="Airavat Margin" value={formatCurrency(q.airavatMargin)} highlight={q.lowMarginFlag} />
              <QuoteField label="Customer Price" value={formatCurrency(q.customerQuotedPrice)} />
            </div>
            <p className="text-[11px] text-gray-400 mt-3">Created {formatDate(q.createdAt)}</p>
          </CardContent>
        </Card>
      ))}
      <Button variant="outline" size="sm" className="h-8 text-xs">
        New Quote Version
      </Button>
    </div>
  );
}

function QuoteField({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div>
      <p className="text-xs text-gray-500 mb-0.5">{label}</p>
      <p className={`text-sm font-medium ${highlight ? "text-amber-600" : "text-gray-900"}`}>{value}</p>
    </div>
  );
}
