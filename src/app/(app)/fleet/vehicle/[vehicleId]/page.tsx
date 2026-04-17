"use client";

import { useParams } from "next/navigation";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { getVehicleVerification } from "@/lib/api/verification";
import { queryKeys } from "@/lib/query/keys";
import { useAuth } from "@/lib/auth/auth-context";
import { formatDate } from "@/lib/formatters";
import {
  ArrowLeft,
  Truck,
  CheckCircle,
  AlertTriangle,
  ExternalLink,
  FileText,
} from "lucide-react";

function formatPhone(phone: string | null | undefined) {
  if (!phone) return "—";
  const digits = phone.replace(/^91/, "");
  if (digits.length === 10) return `+91 ${digits.slice(0, 5)} ${digits.slice(5)}`;
  return phone;
}

export default function VehicleDetailPage() {
  const params = useParams();
  const { user } = useAuth();
  const vehicleId = params.vehicleId as string;

  const detailQuery = useQuery({
    queryKey: queryKeys.vehicleVerification(vehicleId),
    queryFn: () => getVehicleVerification(vehicleId),
    enabled: !!vehicleId,
  });

  const v = detailQuery.data;
  const canViewVerification = user?.role === "super_admin" || user?.role === "admin";

  if (detailQuery.isLoading) {
    return (
      <div className="p-4 sm:p-6">
        <p className="text-sm text-gray-500">Loading vehicle…</p>
      </div>
    );
  }

  if (detailQuery.isError || !v) {
    return (
      <div className="p-4 sm:p-6 space-y-2">
        <p className="text-sm text-gray-500">Vehicle not found.</p>
        <Link href="/fleet" className="text-sm text-blue-600 hover:underline">
          Back to Fleet
        </Link>
      </div>
    );
  }

  const ownerUserId = v.owner?.user_id ?? null;
  const ownerName = v.owner?.organization_name ?? v.owner?.full_name ?? null;
  const bodyLabel =
    v.body_type === "container"
      ? "Container"
      : v.body_type === "open"
        ? "Open Truck"
        : null;
  const specBits = [
    v.vehicle_type_label,
    v.length_feet ? `${v.length_feet} ft` : null,
    v.capacity_tons ? `${Number(v.capacity_tons).toFixed(1)}T` : null,
    v.wheel_count ? `${v.wheel_count} wheels` : null,
    bodyLabel,
  ].filter(Boolean);

  return (
    <div className="p-4 sm:p-6 space-y-4 max-w-3xl">
      {/* Back nav + verification link */}
      <div className="flex items-center justify-between">
        {ownerUserId ? (
          <Link
            href={`/fleet/user/${ownerUserId}`}
            className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to {ownerName ?? "owner"}
          </Link>
        ) : (
          <Link
            href="/fleet"
            className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Fleet
          </Link>
        )}
        {canViewVerification && (
          <Link
            href={`/verification/vehicle/${vehicleId}`}
            className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800"
          >
            {v.is_verified ? "View in Verification" : "Go to Verification"}
            <ExternalLink className="h-3 w-3" />
          </Link>
        )}
      </div>

      {/* Header */}
      <div>
        <div className="flex flex-wrap items-center gap-2 mb-1">
          <Truck className="h-5 w-5 text-gray-500" />
          <h1 className="text-xl font-semibold text-gray-900">{v.registration_number}</h1>
          {v.is_verified ? (
            <Badge variant="outline" className="border-0 text-xs bg-emerald-50 text-emerald-700">
              <CheckCircle className="h-3 w-3 mr-1" />
              Verified
            </Badge>
          ) : (
            <Badge variant="outline" className="border-0 text-xs bg-amber-50 text-amber-700">
              <AlertTriangle className="h-3 w-3 mr-1" />
              Unverified
            </Badge>
          )}
        </div>
        <p className="text-sm text-gray-500">
          {specBits.length > 0 ? specBits.join(" · ") : "Vehicle"}
          {ownerName ? (
            <>
              {" · "}
              {ownerUserId ? (
                <Link
                  href={`/fleet/user/${ownerUserId}`}
                  className="text-blue-600 hover:underline"
                >
                  {ownerName}
                </Link>
              ) : (
                ownerName
              )}
            </>
          ) : null}
        </p>
      </div>

      {/* Specs */}
      <Card>
        <CardContent className="p-4 space-y-4">
          <h2 className="text-sm font-semibold text-gray-900">Specifications</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3 text-sm">
            <InfoRow label="Registration" value={v.registration_number} />
            <InfoRow label="Type" value={v.vehicle_type_label ?? "—"} />
            <InfoRow label="Body" value={bodyLabel ?? "—"} />
            <InfoRow
              label="Length"
              value={v.length_feet ? `${v.length_feet} ft` : "—"}
            />
            <InfoRow
              label="Capacity"
              value={v.capacity_tons ? `${Number(v.capacity_tons).toFixed(1)} tonnes` : "—"}
            />
            <InfoRow label="Wheels" value={v.wheel_count ? String(v.wheel_count) : "—"} />
            <InfoRow label="Status" value={v.status ?? "—"} />
            <InfoRow
              label="Verified at"
              value={v.is_verified && v.verified_at ? formatDate(v.verified_at) : "—"}
            />
          </div>
        </CardContent>
      </Card>

      {/* Owner */}
      {v.owner ? (
        <Card>
          <CardContent className="p-4 space-y-4">
            <h2 className="text-sm font-semibold text-gray-900">Owner</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3 text-sm">
              <InfoRow
                label="Owner type"
                value={
                  v.owner_type === "transporter"
                    ? "Transporter"
                    : v.owner_type === "individual_driver"
                      ? "Individual Driver"
                      : "—"
                }
              />
              <InfoRow label="Organisation" value={v.owner.organization_name ?? "—"} />
              <InfoRow label="Contact" value={v.owner.full_name ?? "—"} />
              <InfoRow label="Phone" value={formatPhone(v.owner.phone)} />
            </div>
          </CardContent>
        </Card>
      ) : null}

      {/* Documents */}
      <Card>
        <CardContent className="p-4 space-y-4">
          <h2 className="text-sm font-semibold text-gray-900">Documents</h2>
          <DocumentLink label="Registration Certificate" objectKey={v.registration_certificate_url} />
          {v.verification_notes ? (
            <div className="pt-3 border-t border-gray-100">
              <p className="text-xs font-medium text-gray-500 mb-1">Verification notes</p>
              <p className="text-sm text-gray-700 whitespace-pre-wrap">{v.verification_notes}</p>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}

function InfoRow({
  label,
  value,
}: {
  label: string;
  value: string | null | undefined;
}) {
  return (
    <div>
      <p className="text-xs text-gray-500">{label}</p>
      <p className="text-sm text-gray-900">{value || "—"}</p>
    </div>
  );
}

function DocumentLink({
  label,
  objectKey,
}: {
  label: string;
  objectKey: string | null | undefined;
}) {
  if (!objectKey) {
    return (
      <div className="rounded border border-dashed border-gray-200 p-3 text-gray-400 text-xs">
        <FileText className="inline h-3.5 w-3.5 mr-1" />
        {label}: not uploaded
      </div>
    );
  }
  return (
    <div className="rounded border border-gray-200 p-3 text-xs">
      <p className="font-medium text-gray-500 flex items-center gap-1">
        <FileText className="h-3.5 w-3.5" />
        {label}
      </p>
      <p className="text-gray-500 break-all mt-0.5">{objectKey}</p>
    </div>
  );
}
