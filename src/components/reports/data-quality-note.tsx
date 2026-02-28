import { AlertTriangle } from "lucide-react";
import type { ReportDataQuality } from "@/lib/api/reports";

export function DataQualityNote({ dataQuality }: { dataQuality: ReportDataQuality }) {
  if (!dataQuality.notes.length) return null;

  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
      <div className="mb-1 flex items-center gap-2 text-sm font-medium text-amber-800">
        <AlertTriangle className="h-4 w-4" />
        Data Quality: {dataQuality.status.toUpperCase()}
      </div>
      <ul className="list-disc space-y-0.5 pl-5 text-xs text-amber-700">
        {dataQuality.notes.map((note) => (
          <li key={note}>{note}</li>
        ))}
      </ul>
    </div>
  );
}
