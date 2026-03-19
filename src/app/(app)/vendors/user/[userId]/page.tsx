"use client";

import { useParams } from "next/navigation";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { getVerificationDetails } from "@/lib/api/verification";
import { queryKeys } from "@/lib/query/keys";
import { formatDate } from "@/lib/formatters";
import { useAuth } from "@/lib/auth/auth-context";
import { ArrowLeft, Phone, MapPin, Calendar, CheckCircle, Clock, ExternalLink } from "lucide-react";

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

export default function PartnerDetailPage() {
  const params = useParams();
  const { user } = useAuth();
  const userId = params.userId as string;

  const detailQuery = useQuery({
    queryKey: queryKeys.verificationDetail(userId),
    queryFn: () => getVerificationDetails(userId),
    enabled: !!userId,
  });

  const detail = detailQuery.data;
  const isDriver = detail?.user.userType === "individual_driver";
  const isTransporter = detail?.user.userType === "transporter";
  const isVerified = detail?.user.isVerified;
  const canViewVerification = user?.role === "super_admin" || user?.role === "admin";

  if (detailQuery.isLoading) {
    return (
      <div className="p-4 sm:p-6">
        <p className="text-sm text-gray-500">Loading partner details...</p>
      </div>
    );
  }

  if (detailQuery.isError || !detail) {
    return (
      <div className="p-4 sm:p-6 space-y-2">
        <p className="text-sm text-gray-500">Partner not found.</p>
        <Link href="/vendors" className="text-sm text-blue-600 hover:underline">
          Back to Fleet
        </Link>
      </div>
    );
  }

  const driverDocs = detail.driver;
  const transporterDocs = detail.transporter;
  const vehicle = detail.vehicle;

  return (
    <div className="p-4 sm:p-6 space-y-4">
      {/* Back nav */}
      <div className="flex items-center justify-between">
        <Link
          href="/vendors"
          className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Fleet
        </Link>
        {canViewVerification && (
          <Link
            href={`/verification/${userId}`}
            className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800"
          >
            View in Verification <ExternalLink className="h-3 w-3" />
          </Link>
        )}
      </div>

      {/* Header */}
      <div>
        <div className="flex items-center gap-2 mb-1">
          <h1 className="text-xl font-semibold text-gray-900">{detail.user.fullName}</h1>
          <Badge variant="outline" className={`border-0 text-xs ${TYPE_BADGE[detail.user.userType] ?? ""}`}>
            {TYPE_LABEL[detail.user.userType] ?? detail.user.userType}
          </Badge>
          {isVerified && (
            <Badge variant="outline" className="border-0 text-xs bg-emerald-50 text-emerald-700">
              <CheckCircle className="h-3 w-3 mr-1" />
              Verified
            </Badge>
          )}
        </div>
      </div>

      {/* Two-column layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Left: Partner Info */}
        <Card className="lg:col-span-1">
          <CardContent className="p-4 space-y-3">
            <h2 className="text-sm font-semibold text-gray-900">Partner Info</h2>
            <div className="space-y-2.5 text-sm">
              <div className="flex items-center gap-2 text-gray-600">
                <Phone className="h-3.5 w-3.5 text-gray-400" />
                {formatPhone(detail.user.phone)}
              </div>
              {(detail.user.city || detail.user.state) && (
                <div className="flex items-center gap-2 text-gray-600">
                  <MapPin className="h-3.5 w-3.5 text-gray-400" />
                  {[detail.user.city, detail.user.state].filter(Boolean).join(", ")}
                </div>
              )}
              <div className="flex items-center gap-2 text-gray-600">
                <Calendar className="h-3.5 w-3.5 text-gray-400" />
                Signed up {formatDate(detail.user.createdAt)}
              </div>
              {isTransporter && transporterDocs?.organizationName && (
                <div className="pt-2 border-t border-gray-100">
                  <p className="text-xs text-gray-500">Organization</p>
                  <p className="text-sm font-medium">{transporterDocs.organizationName}</p>
                </div>
              )}
            </div>
            <div className="pt-2 border-t border-gray-100">
              <p className="text-xs text-gray-500">Status</p>
              {isVerified ? (
                <div className="flex items-center gap-1.5 mt-1">
                  <CheckCircle className="h-3.5 w-3.5 text-emerald-600" />
                  <span className="text-sm text-emerald-700">Verified</span>
                </div>
              ) : (
                <div className="flex items-center gap-1.5 mt-1">
                  <Clock className="h-3.5 w-3.5 text-amber-500" />
                  <span className="text-sm text-amber-700">Pending Verification</span>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Right: Documents (read-only) */}
        <Card className="lg:col-span-2">
          <CardContent className="p-4 sm:p-6 space-y-6">
            <h2 className="text-sm font-semibold text-gray-900">Documents &amp; Details</h2>

            {/* Driver sections */}
            {isDriver && (
              <>
                {/* Vehicle */}
                <DocSection title="Vehicle (RC)">
                  <DocRow label="Registration Number" value={vehicle?.registrationNumber} />
                  <DocRow label="Vehicle Type" value={vehicle?.vehicleType} />
                </DocSection>

                {/* Driving License */}
                <DocSection title="Driving License">
                  <DocRow label="DL Number" value={driverDocs?.licenseNumber} />
                  <DocRow label="DL Expiry" value={driverDocs?.licenseExpiryDate ? formatDate(driverDocs.licenseExpiryDate) : null} />
                </DocSection>

                {/* Aadhaar */}
                <DocSection title="Aadhaar">
                  <DocRow label="Aadhaar Number" value={driverDocs?.aadharNumber ? maskAadhaar(driverDocs.aadharNumber) : null} />
                </DocSection>

                {/* Bank Details */}
                <DocSection title="Bank Details">
                  <DocRow label="Account Holder" value={driverDocs?.bankAccountHolderName} />
                  <DocRow label="Account Number" value={driverDocs?.bankAccountNumber ? maskAccount(driverDocs.bankAccountNumber) : null} />
                  <DocRow label="IFSC Code" value={driverDocs?.bankIfscCode} />
                  <DocRow label="UPI ID" value={driverDocs?.upiId} />
                </DocSection>
              </>
            )}

            {/* Transporter sections */}
            {isTransporter && (
              <>
                {/* Transport License */}
                <DocSection title="Transport License">
                  <DocRow label="License Number" value={transporterDocs?.transportLicenseNumber} />
                  <DocRow label="License Expiry" value={transporterDocs?.transportLicenseExpiry ? formatDate(transporterDocs.transportLicenseExpiry) : null} />
                </DocSection>

                {/* Aadhaar */}
                <DocSection title="Aadhaar">
                  <DocRow label="Aadhaar Number" value={transporterDocs?.aadharNumber ? maskAadhaar(transporterDocs.aadharNumber) : null} />
                </DocSection>

                {/* Bank Details */}
                <DocSection title="Bank Details">
                  <DocRow label="Account Holder" value={transporterDocs?.bankAccountHolderName} />
                  <DocRow label="Account Number" value={transporterDocs?.bankAccountNumber ? maskAccount(transporterDocs.bankAccountNumber) : null} />
                  <DocRow label="IFSC Code" value={transporterDocs?.bankIfscCode} />
                  <DocRow label="UPI ID" value={transporterDocs?.upiId} />
                </DocSection>

                {/* GST / PAN */}
                <DocSection title="Business Documents">
                  <DocRow label="GST Number" value={transporterDocs?.gstNumber} />
                  <DocRow label="PAN Number" value={transporterDocs?.panNumber} />
                </DocSection>
              </>
            )}

            {/* Verification notes */}
            {(driverDocs?.verificationNotes || transporterDocs?.verificationNotes) && (
              <DocSection title="Verification Notes">
                <p className="text-sm text-gray-600">
                  {driverDocs?.verificationNotes ?? transporterDocs?.verificationNotes}
                </p>
              </DocSection>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function DocSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <div>
        <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
        <div className="border-b border-gray-200 mt-1" />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2">
        {children}
      </div>
    </section>
  );
}

function DocRow({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div>
      <p className="text-xs text-gray-500">{label}</p>
      <p className="text-sm text-gray-900">{value || "—"}</p>
    </div>
  );
}

function maskAadhaar(num: string) {
  if (num.length === 12) return `XXXX XXXX ${num.slice(8)}`;
  return num;
}

function maskAccount(num: string) {
  if (num.length > 4) return `${"X".repeat(num.length - 4)}${num.slice(-4)}`;
  return num;
}
