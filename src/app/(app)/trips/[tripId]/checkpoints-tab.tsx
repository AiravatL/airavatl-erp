import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import type { OdometerCheckpoint } from "@/lib/types";
import { Camera, MapPin, Gauge, Clock, Check, AlertCircle } from "lucide-react";

const CHECKPOINT_LABELS: Record<string, string> = {
  dispatch: "Dispatch from Parking",
  fuel_stop: "Fuel Stop (Post-Loading)",
  destination: "Destination Arrival",
};

const CHECKPOINT_ORDER = ["dispatch", "fuel_stop", "destination"];

export function CheckpointsTab({ checkpoints }: { checkpoints: OdometerCheckpoint[] }) {
  const sorted = CHECKPOINT_ORDER.map(
    (type) => checkpoints.find((c) => c.checkpointType === type)
  );

  return (
    <div className="space-y-3">
      {sorted.map((cp, idx) => {
        const type = CHECKPOINT_ORDER[idx];
        const completed = cp?.reading != null;

        return (
          <Card key={type} className={completed ? "border-emerald-100" : ""}>
            <CardContent className="p-4">
              <div className="flex items-start gap-3">
                <div className={`flex h-9 w-9 items-center justify-center rounded-full shrink-0 ${
                  completed ? "bg-emerald-50" : "bg-gray-100"
                }`}>
                  {completed ? (
                    <Check className="h-4 w-4 text-emerald-500" />
                  ) : (
                    <AlertCircle className="h-4 w-4 text-gray-400" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-sm font-medium text-gray-900">
                      {CHECKPOINT_LABELS[type]}
                    </h3>
                    <span className={`text-xs font-medium ${completed ? "text-emerald-600" : "text-gray-400"}`}>
                      {completed ? "Completed" : "Pending"}
                    </span>
                  </div>

                  {completed ? (
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                      <InfoItem icon={Gauge} label="Reading" value={`${cp!.reading!.toLocaleString()} km`} />
                      <InfoItem icon={Camera} label="Photo" value={cp!.photoUploaded ? "Uploaded" : "Missing"} />
                      <InfoItem icon={Clock} label="Time" value={
                        cp!.timestamp
                          ? new Date(cp!.timestamp).toLocaleString("en-IN", { dateStyle: "short", timeStyle: "short" })
                          : "—"
                      } />
                      <InfoItem icon={MapPin} label="Location" value={cp!.location || "—"} />
                    </div>
                  ) : (
                    <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5 mt-1">
                      <Camera className="h-3.5 w-3.5" /> Capture Checkpoint
                    </Button>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        );
      })}

      {/* KM summary */}
      {checkpoints.filter(c => c.reading != null).length >= 2 && (
        <Card className="bg-gray-50">
          <CardContent className="p-4">
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">Distance Summary</p>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-xs text-gray-500">Total KM Covered</p>
                <p className="text-sm font-semibold text-gray-900">
                  {(() => {
                    const readings = checkpoints.filter(c => c.reading != null).map(c => c.reading!);
                    return readings.length >= 2 ? `${(Math.max(...readings) - Math.min(...readings)).toLocaleString()} km` : "—";
                  })()}
                </p>
              </div>
              <div>
                <p className="text-xs text-gray-500">Checkpoints Done</p>
                <p className="text-sm font-semibold text-gray-900">
                  {checkpoints.filter(c => c.reading != null).length} / 3
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function InfoItem({ icon: Icon, label, value }: { icon: React.ComponentType<{ className?: string }>; label: string; value: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <Icon className="h-3 w-3 text-gray-400 shrink-0" />
      <div>
        <p className="text-[10px] text-gray-400">{label}</p>
        <p className="text-xs text-gray-700">{value}</p>
      </div>
    </div>
  );
}
