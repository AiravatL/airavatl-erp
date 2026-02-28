import type { AuditLogEntry } from "@/lib/types";
import { GitCommitHorizontal } from "lucide-react";

export function TimelineTab({ entries, isLoading = false }: { entries: AuditLogEntry[]; isLoading?: boolean }) {
  if (isLoading) {
    return <p className="text-sm text-gray-500 text-center py-8">Loading activity...</p>;
  }

  const sorted = [...entries].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

  return (
    <div className="space-y-0">
      {sorted.map((entry, idx) => (
        <div key={entry.id} className="flex gap-3 pb-4">
          <div className="flex flex-col items-center">
            <div className="flex h-6 w-6 items-center justify-center rounded-full bg-gray-100 shrink-0">
              <GitCommitHorizontal className="h-3 w-3 text-gray-500" />
            </div>
            {idx < sorted.length - 1 && <div className="w-px flex-1 bg-gray-200 mt-1" />}
          </div>
          <div className="flex-1 pb-2">
            <p className="text-sm text-gray-900">{entry.details}</p>
            <p className="text-[11px] text-gray-500 mt-0.5">
              {entry.actorName} &middot;{" "}
              {new Date(entry.timestamp).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}
            </p>
          </div>
        </div>
      ))}
      {sorted.length === 0 && (
        <p className="text-sm text-gray-500 text-center py-8">No activity recorded yet.</p>
      )}
    </div>
  );
}
