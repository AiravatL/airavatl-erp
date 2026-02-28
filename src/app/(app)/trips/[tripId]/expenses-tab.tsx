import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { ExpenseEntry } from "@/lib/types";
import { formatCurrency } from "@/lib/formatters";
import { Plus, AlertTriangle, Receipt } from "lucide-react";

const CATEGORY_LABELS: Record<string, string> = {
  driver_da: "Driver DA",
  vehicle_rent: "Vehicle Rent",
  fuel: "Fuel",
  def: "DEF",
  toll: "Toll",
  unofficial_gate: "Unofficial Gate",
  dala_kharcha: "Dala Kharcha",
  repair: "Repair",
  parking: "Parking",
  other: "Other",
};

const APPROVAL_LABELS: Record<string, string> = {
  pending: "Pending",
  approved: "Approved",
  rejected: "Rejected",
  escalated: "Escalated",
};

const APPROVAL_COLORS: Record<string, string> = {
  pending: "bg-amber-50 text-amber-700",
  approved: "bg-emerald-50 text-emerald-700",
  rejected: "bg-red-50 text-red-700",
  escalated: "bg-orange-50 text-orange-700",
};

export function ExpensesTab({ expenses }: { expenses: ExpenseEntry[] }) {
  const total = expenses.reduce((sum, e) => sum + e.amount, 0);
  const overCapCount = expenses.filter((e) => e.capStatus === "over_cap").length;

  return (
    <div className="space-y-4">
      {/* Summary */}
      <div className="flex items-center gap-4">
        <div>
          <p className="text-xs text-gray-500">Total Expenses</p>
          <p className="text-lg font-semibold text-gray-900">{formatCurrency(total)}</p>
        </div>
        {overCapCount > 0 && (
          <Badge variant="outline" className="border-orange-200 bg-orange-50 text-orange-700 text-xs gap-1">
            <AlertTriangle className="h-3 w-3" /> {overCapCount} over cap
          </Badge>
        )}
        <div className="ml-auto">
          <Button size="sm" className="h-8 text-xs gap-1.5">
            <Plus className="h-3.5 w-3.5" /> Add Expense
          </Button>
        </div>
      </div>

      {/* Expense list */}
      <div className="space-y-2">
        {expenses.map((e) => (
          <Card key={e.id}>
            <CardContent className="p-3 flex items-center justify-between">
              <div className="flex items-center gap-3 min-w-0 flex-1">
                <div className={`flex h-8 w-8 items-center justify-center rounded-lg shrink-0 ${
                  e.capStatus === "over_cap" ? "bg-orange-50" : "bg-gray-100"
                }`}>
                  <Receipt className={`h-4 w-4 ${e.capStatus === "over_cap" ? "text-orange-500" : "text-gray-400"}`} />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium text-gray-900">{CATEGORY_LABELS[e.category]}</p>
                    {e.capStatus === "over_cap" && (
                      <Badge variant="outline" className="text-[10px] px-1 py-0 border-orange-200 text-orange-600">Over Cap</Badge>
                    )}
                  </div>
                  <p className="text-[11px] text-gray-500 truncate">{e.reason}</p>
                </div>
              </div>
              <div className="flex items-center gap-3 shrink-0 ml-2">
                <span className="text-sm font-medium text-gray-900">{formatCurrency(e.amount)}</span>
                <Badge variant="outline" className={`border-0 text-[10px] font-medium ${APPROVAL_COLORS[e.approvalStatus]}`}>
                  {APPROVAL_LABELS[e.approvalStatus]}
                </Badge>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
