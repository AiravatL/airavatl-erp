"use client";

import { useParams } from "next/navigation";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { getEmployeeDriverVerification } from "@/lib/api/verification";
import { queryKeys } from "@/lib/query/keys";
import { useAuth } from "@/lib/auth/auth-context";
import { formatDate } from "@/lib/formatters";
import {
  ArrowLeft,
  Phone,
  Users,
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

export default function EmployeeDriverDetailPage() {
  const params = useParams();
  const { user } = useAuth();
  const driverId = params.driverId as string;

  const detailQuery = useQuery({
    queryKey: queryKeys.employeeDriverVerification(driverId),
    queryFn: () => getEmployeeDriverVerification(driverId),
    enabled: !!driverId,
  });

  const d = detailQuery.data;
  const canViewVerification = user?.role === "super_admin" || user?.role === "admin";

  if (detailQuery.isLoading) {
    return (
      <div className="p-4 sm:p-6">
        <p className="text-sm text-gray-500">Loading driver…</p>
      </div>
    );
  }

  if (detailQuery.isError || !d) {
    return (
      <div className="p-4 sm:p-6 space-y-2">
        <p className="text-sm text-gray-500">Driver not found.</p>
        <Link href="/fleet" className="text-sm text-blue-600 hover:underline">
          Back to Fleet
        </Link>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 space-y-4 max-w-3xl">
      {/* Back nav + verification link */}
      <div className="flex items-center justify-between">
        <Link
          href={`/fleet/user/${d.transporter.userId}`}
          className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to {d.transporter.organizationName ?? d.transporter.fullName}
        </Link>
        {canViewVerification && (
          <Link
            href={`/verification/employee-driver/${driverId}`}
            className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800"
          >
            {d.isDocumentsVerified ? "View in Verification" : "Go to Verification"}
            <ExternalLink className="h-3 w-3" />
          </Link>
        )}
      </div>

      {/* Header */}
      <div>
        <div className="flex flex-wrap items-center gap-2 mb-1">
          <Users className="h-5 w-5 text-gray-500" />
          <h1 className="text-xl font-semibold text-gray-900">{d.fullName}</h1>
          <Badge variant="outline" className="border-0 text-xs bg-violet-50 text-violet-700">
            Employee Driver
          </Badge>
          {d.isDocumentsVerified ? (
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
          Employee of{" "}
          <Link
            href={`/fleet/user/${d.transporter.userId}`}
            className="text-blue-600 hover:underline"
          >
            {d.transporter.organizationName ?? d.transporter.fullName}
          </Link>
        </p>
      </div>

      {/* Contact + Employment */}
      <Card>
        <CardContent className="p-4 space-y-4">
          <h2 className="text-sm font-semibold text-gray-900">Driver Info</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3 text-sm">
            <InfoRow
              icon={<Phone className="h-3.5 w-3.5 text-gray-400" />}
              label="Phone"
              value={formatPhone(d.phone)}
            />
            <InfoRow label="Employee ID" value={d.employeeId ?? "—"} />
            <InfoRow label="Employment status" value={d.employmentStatus ?? "—"} />
            <InfoRow
              label="Start date"
              value={d.employmentStartDate ? formatDate(d.employmentStartDate) : "—"}
            />
            <InfoRow label="Trips completed" value={String(d.totalTripsCompleted)} />
            <InfoRow
              label="Average rating"
              value={d.averageRating != null ? Number(d.averageRating).toFixed(1) : "—"}
            />
            <InfoRow
              label="Emergency contact"
              value={d.emergencyContactName ?? "—"}
            />
            <InfoRow
              label="Emergency phone"
              value={d.emergencyContactPhone ? formatPhone(d.emergencyContactPhone) : "—"}
            />
          </div>
        </CardContent>
      </Card>

      {/* Documents */}
      <Card>
        <CardContent className="p-4 space-y-4">
          <h2 className="text-sm font-semibold text-gray-900">Documents</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3 text-sm">
            <InfoRow
              icon={<FileText className="h-3.5 w-3.5 text-gray-400" />}
              label="Driving licence"
              value={d.licenseNumber ?? "—"}
            />
            <InfoRow
              label="Licence expiry"
              value={d.licenseExpiryDate ? formatDate(d.licenseExpiryDate) : "—"}
            />
            <InfoRow label="Aadhaar" value={maskAadhaar(d.aadharNumber)} />
            <InfoRow
              label="Verified at"
              value={d.verifiedAt ? formatDate(d.verifiedAt) : "—"}
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            <DocumentLink label="Driving Licence photo" objectKey={d.uploads?.dl?.objectKey ?? d.licensePhotoUrl} />
            <DocumentLink label="Aadhaar photo" objectKey={d.uploads?.aadhaar?.objectKey ?? d.aadharPhotoUrl} />
          </div>
          {d.verificationNotes ? (
            <div className="pt-3 border-t border-gray-100">
              <p className="text-xs font-medium text-gray-500 mb-1">Verification notes</p>
              <p className="text-sm text-gray-700 whitespace-pre-wrap">{d.verificationNotes}</p>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}

function InfoRow({
  icon,
  label,
  value,
}: {
  icon?: React.ReactNode;
  label: string;
  value: string | null | undefined;
}) {
  return (
    <div>
      <p className="text-xs text-gray-500 flex items-center gap-1">
        {icon}
        {label}
      </p>
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
      <div className="rounded border border-dashed border-gray-200 p-3 text-gray-400">
        {label}: not uploaded
      </div>
    );
  }
  return (
    <div className="rounded border border-gray-200 p-3">
      <p className="text-xs font-medium text-gray-500">{label}</p>
      <p className="text-[11px] text-gray-500 break-all mt-0.5">{objectKey}</p>
    </div>
  );
}

function maskAadhaar(value: string | null | undefined) {
  if (!value) return "—";
  const digits = value.replace(/\D/g, "");
  if (digits.length !== 12) return value;
  return `XXXX XXXX ${digits.slice(8)}`;
}
