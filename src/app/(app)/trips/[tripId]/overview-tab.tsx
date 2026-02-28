import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { Trip } from "@/lib/types";
import { formatDate, formatCurrency } from "@/lib/formatters";
import { MapPin, Calendar, Weight, Route, User, TruckIcon, IndianRupee, Phone } from "lucide-react";

export function OverviewTab({ trip }: { trip: Trip }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-xs font-medium text-gray-500 uppercase tracking-wider">Route & Schedule</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <InfoRow icon={MapPin} label="Pickup" value={trip.pickupLocation || "—"} />
          <InfoRow icon={MapPin} label="Drop" value={trip.dropLocation || "—"} />
          <InfoRow icon={Route} label="Planned KM" value={trip.plannedKm ? `${trip.plannedKm} km` : "—"} />
          <InfoRow icon={Calendar} label="Schedule" value={trip.scheduleDate ? formatDate(trip.scheduleDate) : "—"} />
          <InfoRow icon={Weight} label="Weight" value={trip.weightEstimate ? `${trip.weightEstimate} MT` : "—"} />
          <InfoRow icon={IndianRupee} label="Trip Amount" value={trip.tripAmount ? formatCurrency(trip.tripAmount) : "—"} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-xs font-medium text-gray-500 uppercase tracking-wider">Vehicle & Owners</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <InfoRow icon={TruckIcon} label="Vehicle" value={trip.vehicleNumber || "Not assigned"} />
          <InfoRow icon={User} label="Driver Name" value={trip.driverName || "Not assigned"} />
          <InfoRow icon={Phone} label="Driver Phone" value={trip.driverPhone || "—"} />
          {(trip.vendorId || trip.vendorName || trip.vendorPhone) && (
            <>
              <InfoRow icon={User} label="Vendor Name" value={trip.vendorName || "—"} />
              <InfoRow icon={Phone} label="Vendor Phone" value={trip.vendorPhone || "—"} />
            </>
          )}
          <InfoRow
            icon={User}
            label="Vehicle Type"
            value={`${trip.vehicleType || "—"}${trip.vehicleLength ? ` · ${trip.vehicleLength}` : ""}`}
          />
          <div className="border-t border-gray-100 pt-3 mt-3 space-y-3">
            <InfoRow icon={User} label="Requested By" value={trip.requestedByName || "—"} />
            <InfoRow icon={User} label="Sales" value={trip.salesOwnerName || "—"} />
            <InfoRow icon={User} label="Ops Consigner" value={trip.opsOwnerName || "Pending"} />
            <InfoRow icon={User} label="Ops Vehicles" value={trip.opsVehiclesOwnerName || "—"} />
            <InfoRow icon={User} label="Accounts" value={trip.accountsOwnerName || "—"} />
          </div>
        </CardContent>
      </Card>

      {trip.internalNotes && (
        <Card className="sm:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-gray-500 uppercase tracking-wider">Internal Notes</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-gray-700">{trip.internalNotes}</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function InfoRow({ icon: Icon, label, value }: { icon: React.ComponentType<{ className?: string }>; label: string; value: string }) {
  return (
    <div className="flex items-start gap-2">
      <Icon className="h-3.5 w-3.5 text-gray-400 mt-0.5 shrink-0" />
      <div className="flex-1 min-w-0">
        <span className="text-xs text-gray-500">{label}</span>
        <p className="text-sm text-gray-900">{value}</p>
      </div>
    </div>
  );
}
