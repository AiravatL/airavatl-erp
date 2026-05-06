"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  getVerificationDetails,
  getTransporterFleet,
  getPartnerPayoutStatus,
  retryPayoutOnboarding,
  updatePayoutDetails,
  updatePartnerProfile,
  updateVehicleMasterType,
  type TransporterFleetVehicle,
  type TransporterFleetEmployeeDriver,
  type PartnerPayoutStatus,
} from "@/lib/api/verification";
import type { VerificationDetails } from "@/lib/types";
import { VehicleTypePicker } from "@/components/shared/vehicle-type-picker";
import { queryKeys } from "@/lib/query/keys";
import { formatDate } from "@/lib/formatters";
import { useAuth } from "@/lib/auth/auth-context";
import {
  ArrowLeft,
  Phone,
  MapPin,
  Calendar,
  CheckCircle,
  Clock,
  ExternalLink,
  Truck,
  Users,
  AlertTriangle,
  Wallet,
  RefreshCw,
  Loader2,
  Pencil,
} from "lucide-react";

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
  const queryClient = useQueryClient();
  const userId = params.userId as string;

  const detailQuery = useQuery({
    queryKey: queryKeys.verificationDetail(userId),
    queryFn: () => getVerificationDetails(userId),
    enabled: !!userId,
  });

  const detail = detailQuery.data;
  const isDriver = detail?.user.userType === "individual_driver";
  const isTransporter = detail?.user.userType === "transporter";

  const fleetQuery = useQuery({
    queryKey: queryKeys.transporterFleet(userId),
    queryFn: () => getTransporterFleet(userId),
    enabled: !!userId && isTransporter,
  });
  const isVerified = detail?.user.isVerified;
  const canViewVerification = user?.role === "super_admin" || user?.role === "admin";
  const canManagePayout =
    user?.role === "super_admin" ||
    user?.role === "admin" ||
    user?.role === "sales_vehicles";

  const canEditPayoutForReveal =
    user?.role === "super_admin" || user?.role === "admin";
  const payoutStatusQuery = useQuery({
    queryKey: [...queryKeys.partnerPayoutStatus(userId), { reveal: canEditPayoutForReveal }],
    queryFn: () => getPartnerPayoutStatus(userId, { reveal: canEditPayoutForReveal }),
    enabled: !!userId && isVerified === true && canManagePayout,
  });

  const retryPayoutMutation = useMutation({
    mutationFn: () => retryPayoutOnboarding(userId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.partnerPayoutStatus(userId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.pendingPayoutOnboarding });
      queryClient.invalidateQueries({ queryKey: queryKeys.operationsHealth });
    },
  });

  const canEditPayout = user?.role === "super_admin" || user?.role === "admin";
  const canEditProfile = user?.role === "super_admin" || user?.role === "admin";
  const [showEditPayout, setShowEditPayout] = useState(false);
  const [showEditProfile, setShowEditProfile] = useState(false);

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
        <Link href="/fleet" className="text-sm text-blue-600 hover:underline">
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
          href="/fleet"
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
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
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
        {canEditProfile && (
          <Button
            size="sm"
            variant="outline"
            className="h-8 text-xs shrink-0"
            onClick={() => setShowEditProfile(true)}
          >
            <Pencil className="h-3.5 w-3.5 mr-1" />
            Edit Info
          </Button>
        )}
      </div>

      {/* Edit user info dialog */}
      {canEditProfile && (
        <EditUserInfoDialog
          open={showEditProfile}
          onOpenChange={setShowEditProfile}
          userId={userId}
          initial={detail}
          onSaved={() => {
            queryClient.invalidateQueries({ queryKey: queryKeys.verificationDetail(userId) });
          }}
        />
      )}

      {/* Payout onboarding (verified partners only, role-gated) */}
      {isVerified && canManagePayout && (
        <PayoutOnboardingCard
          isLoading={payoutStatusQuery.isLoading}
          status={payoutStatusQuery.data}
          retryPending={retryPayoutMutation.isPending}
          retryError={
            retryPayoutMutation.error instanceof Error
              ? retryPayoutMutation.error.message
              : null
          }
          onRetry={() => retryPayoutMutation.mutate()}
          canEdit={canEditPayout}
          onEdit={() => setShowEditPayout(true)}
        />
      )}

      {/* Edit payout details dialog */}
      {isVerified && canEditPayout && (
        <EditPayoutDialog
          open={showEditPayout}
          onOpenChange={setShowEditPayout}
          userId={userId}
          initial={payoutStatusQuery.data}
          onSaved={() => {
            queryClient.invalidateQueries({ queryKey: queryKeys.partnerPayoutStatus(userId) });
            queryClient.invalidateQueries({ queryKey: queryKeys.pendingPayoutOnboarding });
          }}
        />
      )}

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
                  <DocRow label="Vehicle Type" value={vehicle?.vehicleTypeLabel} />
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

      {/* Transporter fleet: vehicles + employee drivers */}
      {isTransporter && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card>
            <CardContent className="p-4 space-y-3">
              <div className="flex items-center gap-2">
                <Truck className="h-4 w-4 text-gray-500" />
                <h2 className="text-sm font-semibold text-gray-900">Vehicles</h2>
                <Badge variant="outline" className="border-0 text-[10px] bg-gray-100 text-gray-600">
                  {fleetQuery.data?.vehicles.length ?? 0}
                </Badge>
              </div>
              {fleetQuery.isLoading ? (
                <p className="text-xs text-gray-500">Loading fleet…</p>
              ) : fleetQuery.data?.vehicles.length === 0 ? (
                <p className="text-xs text-gray-500">No vehicles added yet.</p>
              ) : (
                <ul className="space-y-2">
                  {(fleetQuery.data?.vehicles ?? []).map((v) => (
                    <VehicleRow key={v.id} vehicle={v} />
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4 space-y-3">
              <div className="flex items-center gap-2">
                <Users className="h-4 w-4 text-gray-500" />
                <h2 className="text-sm font-semibold text-gray-900">Employee Drivers</h2>
                <Badge variant="outline" className="border-0 text-[10px] bg-gray-100 text-gray-600">
                  {fleetQuery.data?.employee_drivers.length ?? 0}
                </Badge>
              </div>
              {fleetQuery.isLoading ? (
                <p className="text-xs text-gray-500">Loading drivers…</p>
              ) : fleetQuery.data?.employee_drivers.length === 0 ? (
                <p className="text-xs text-gray-500">No employee drivers added yet.</p>
              ) : (
                <ul className="space-y-2">
                  {(fleetQuery.data?.employee_drivers ?? []).map((d) => (
                    <EmployeeDriverRow key={d.id} driver={d} />
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

/* --------------------------------- Rows --------------------------------- */

function humanVehicleSpec(v: TransporterFleetVehicle): string {
  const parts: string[] = [];
  if (v.capacity_tons != null) {
    const n = Number(v.capacity_tons);
    const s = Number.isInteger(n) ? n.toString() : n.toFixed(2).replace(/\.?0+$/, "");
    parts.push(`${s} Ton`);
  }
  if (v.length_feet != null) {
    const n = Number(v.length_feet);
    parts.push(`${Number.isInteger(n) ? n : n.toFixed(1)} ft`);
  }
  if (v.wheel_count != null) parts.push(`${v.wheel_count} Wheel`);
  return parts.join(" ");
}

function VehicleRow({ vehicle }: { vehicle: TransporterFleetVehicle }) {
  const spec = humanVehicleSpec(vehicle);
  const bodyLabel =
    vehicle.body_type === "container"
      ? "Container"
      : vehicle.body_type === "open"
        ? "Open Truck"
        : null;
  return (
    <li>
      <Link
        href={`/fleet/vehicle/${vehicle.id}`}
        className="flex items-center gap-3 rounded-md border border-gray-200 p-2.5 hover:bg-gray-50"
      >
        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gray-100">
          <Truck className="h-4 w-4 text-gray-600" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-gray-900 truncate">
            {vehicle.registration_number}
          </p>
          <p className="text-[11px] text-gray-500 truncate">
            {[spec || null, bodyLabel].filter(Boolean).join(" · ") || "—"}
          </p>
        </div>
        {vehicle.is_verified ? (
          <Badge variant="outline" className="border-0 text-[10px] bg-emerald-50 text-emerald-700">
            <CheckCircle className="h-3 w-3 mr-1" />
            Verified
          </Badge>
        ) : (
          <Badge variant="outline" className="border-0 text-[10px] bg-amber-50 text-amber-700">
            <AlertTriangle className="h-3 w-3 mr-1" />
            Unverified
          </Badge>
        )}
      </Link>
    </li>
  );
}

function EmployeeDriverRow({ driver }: { driver: TransporterFleetEmployeeDriver }) {
  return (
    <li>
      <Link
        href={`/fleet/employee-driver/${driver.id}`}
        className="flex items-center gap-3 rounded-md border border-gray-200 p-2.5 hover:bg-gray-50"
      >
        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gray-100">
          <Users className="h-4 w-4 text-gray-600" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-gray-900 truncate">{driver.full_name}</p>
          <p className="text-[11px] text-gray-500 truncate">
            {[
              driver.phone ? formatPhone(driver.phone) : null,
              driver.license_number ? `DL ${driver.license_number}` : null,
            ]
              .filter(Boolean)
              .join(" · ") || driver.employment_status}
          </p>
        </div>
        {driver.is_documents_verified ? (
          <Badge variant="outline" className="border-0 text-[10px] bg-emerald-50 text-emerald-700">
            <CheckCircle className="h-3 w-3 mr-1" />
            Verified
          </Badge>
        ) : (
          <Badge variant="outline" className="border-0 text-[10px] bg-amber-50 text-amber-700">
            <AlertTriangle className="h-3 w-3 mr-1" />
            Unverified
          </Badge>
        )}
      </Link>
    </li>
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

function PayoutOnboardingCard({
  isLoading,
  status,
  retryPending,
  retryError,
  onRetry,
  canEdit,
  onEdit,
}: {
  isLoading: boolean;
  status: PartnerPayoutStatus | undefined;
  retryPending: boolean;
  retryError: string | null;
  onRetry: () => void;
  canEdit: boolean;
  onEdit: () => void;
}) {
  if (isLoading && !status) {
    return (
      <Card>
        <CardContent className="p-4">
          <p className="text-xs text-gray-500">Loading payout status…</p>
        </CardContent>
      </Card>
    );
  }
  if (!status) return null;

  const isActive = status.status === "active";
  const isMissing = status.status === "missing";
  const tone = isActive
    ? "border-emerald-200 bg-emerald-50/40"
    : "border-amber-300 bg-amber-50/60";
  const Icon = isActive ? CheckCircle : AlertTriangle;
  const iconTone = isActive ? "text-emerald-600" : "text-amber-600";

  return (
    <Card className={`border ${tone}`}>
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/80">
            <Wallet className="h-4 w-4 text-gray-700" />
          </div>
          <div className="flex-1 min-w-0 space-y-2">
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-semibold text-gray-900">Payout Onboarding</h2>
              <Badge variant="outline" className="border-0 text-[10px] bg-white text-gray-700">
                <Icon className={`h-3 w-3 mr-1 ${iconTone}`} />
                {isActive ? "Active" : isMissing ? "Missing" : "Pending RazorpayX"}
              </Badge>
            </div>
            {isActive ? (
              <p className="text-xs text-gray-600">
                RazorpayX fund account is linked. Driver can receive payouts.
              </p>
            ) : isMissing ? (
              <p className="text-xs text-gray-600">
                No payout settings on record. Re-run verification to add bank/UPI details.
              </p>
            ) : (
              <p className="text-xs text-gray-600">
                KYC is verified but RazorpayX onboarding hasn&apos;t completed. Click Retry to
                re-run onboarding using the bank/UPI details on file.
              </p>
            )}

            {!isMissing && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1.5 text-xs pt-1">
                {status.bankAccountHolderName && (
                  <div>
                    <span className="text-gray-500">Account holder: </span>
                    <span className="text-gray-900">{status.bankAccountHolderName}</span>
                  </div>
                )}
                {status.bankAccountNumberLast4 && (
                  <div>
                    <span className="text-gray-500">Account: </span>
                    <span className="text-gray-900">····{status.bankAccountNumberLast4}</span>
                  </div>
                )}
                {status.bankIfscCode && (
                  <div>
                    <span className="text-gray-500">IFSC: </span>
                    <span className="text-gray-900">{status.bankIfscCode}</span>
                  </div>
                )}
                {status.upiVpa && (
                  <div>
                    <span className="text-gray-500">UPI: </span>
                    <span className="text-gray-900">{status.upiVpa}</span>
                  </div>
                )}
                {status.razorpayxContactId && (
                  <div className="sm:col-span-2 text-[11px] text-gray-500">
                    RazorpayX contact: {status.razorpayxContactId}
                    {status.razorpayxFundAccountId
                      ? ` · fund account: ${status.razorpayxFundAccountId}`
                      : ""}
                  </div>
                )}
              </div>
            )}

            {retryError && (
              <p className="text-xs text-red-600 pt-1">{retryError}</p>
            )}
          </div>

          <div className="flex flex-col gap-2 shrink-0">
            {canEdit && (
              <Button
                size="sm"
                variant="outline"
                className="h-8 text-xs bg-white"
                onClick={onEdit}
              >
                <Pencil className="h-3.5 w-3.5 mr-1" />
                Edit
              </Button>
            )}
            {!isActive && !isMissing && (
              <Button
                size="sm"
                variant="outline"
                className="h-8 text-xs bg-white"
                onClick={onRetry}
                disabled={retryPending}
              >
                {retryPending ? (
                  <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                ) : (
                  <RefreshCw className="h-3.5 w-3.5 mr-1" />
                )}
                {retryPending ? "Retrying…" : "Retry Onboarding"}
              </Button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function EditPayoutDialog({
  open,
  onOpenChange,
  userId,
  initial,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId: string;
  initial: PartnerPayoutStatus | undefined;
  onSaved: () => void;
}) {
  const [method, setMethod] = useState<"bank_account" | "upi">(
    (initial?.payoutMethod as "bank_account" | "upi" | undefined) ?? "bank_account",
  );
  const [holder, setHolder] = useState(initial?.bankAccountHolderName ?? "");
  const [accountNumber, setAccountNumber] = useState(initial?.bankAccountNumber ?? "");
  const [ifsc, setIfsc] = useState(initial?.bankIfscCode ?? "");
  const [bankName, setBankName] = useState(initial?.bankName ?? "");
  const [upi, setUpi] = useState(initial?.upiVpa ?? "");

  // Re-prime the form whenever the dialog opens so it shows the latest on-file data
  useEffect(() => {
    if (open) {
      setMethod((initial?.payoutMethod as "bank_account" | "upi" | undefined) ?? "bank_account");
      setHolder(initial?.bankAccountHolderName ?? "");
      setAccountNumber(initial?.bankAccountNumber ?? "");
      setIfsc(initial?.bankIfscCode ?? "");
      setBankName(initial?.bankName ?? "");
      setUpi(initial?.upiVpa ?? "");
    }
  }, [open, initial]);

  const IFSC_RE = /^[A-Z]{4}0[A-Z0-9]{6}$/;
  const BANK_ACCT_RE = /^[0-9]{8,18}$/;
  const UPI_RE = /^[a-zA-Z0-9._-]+@[a-zA-Z][a-zA-Z0-9.-]+$/;

  const valid =
    method === "bank_account"
      ? holder.trim().length > 0 &&
        BANK_ACCT_RE.test(accountNumber.trim()) &&
        IFSC_RE.test(ifsc.trim().toUpperCase())
      : UPI_RE.test(upi.trim());

  const saveMutation = useMutation({
    mutationFn: () =>
      updatePayoutDetails(userId, {
        payoutMethod: method,
        bankAccountHolderName: method === "bank_account" ? holder.trim() : null,
        bankAccountNumber: method === "bank_account" ? accountNumber.trim() : null,
        bankIfscCode: method === "bank_account" ? ifsc.trim().toUpperCase() : null,
        bankName: method === "bank_account" ? bankName.trim() || null : null,
        upiVpa: method === "upi" ? upi.trim() : null,
      }),
    onSuccess: () => {
      onSaved();
      onOpenChange(false);
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit Payout Details</DialogTitle>
          <DialogDescription className="text-xs">
            Updating bank/UPI clears the existing RazorpayX link. After saving, click
            <span className="font-medium"> Retry Onboarding</span> to re-create the fund account.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2">
          <div className="space-y-1.5">
            <Label className="text-xs font-medium">Payout Method</Label>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant={method === "bank_account" ? "default" : "outline"}
                className="h-8 text-xs flex-1"
                onClick={() => setMethod("bank_account")}
              >
                Bank Account
              </Button>
              <Button
                size="sm"
                variant={method === "upi" ? "default" : "outline"}
                className="h-8 text-xs flex-1"
                onClick={() => setMethod("upi")}
              >
                UPI
              </Button>
            </div>
          </div>

          {method === "bank_account" ? (
            <>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">
                  Account Holder <span className="text-red-500">*</span>
                </Label>
                <Input
                  value={holder}
                  onChange={(e) => setHolder(e.target.value.slice(0, 100))}
                  className="h-9 text-sm"
                  maxLength={100}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">
                  Account Number <span className="text-red-500">*</span>
                </Label>
                <Input
                  value={accountNumber}
                  onChange={(e) => setAccountNumber(e.target.value.replace(/\D/g, "").slice(0, 18))}
                  className="h-9 text-sm"
                  inputMode="numeric"
                  placeholder="8-18 digits"
                  maxLength={18}
                />
                {accountNumber.length > 0 && !BANK_ACCT_RE.test(accountNumber) && (
                  <p className="text-[11px] text-red-500">Account number must be 8-18 digits</p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">
                  IFSC Code <span className="text-red-500">*</span>
                </Label>
                <Input
                  value={ifsc}
                  onChange={(e) => setIfsc(e.target.value.toUpperCase().slice(0, 11))}
                  className="h-9 text-sm"
                  placeholder="SBIN0001234"
                  maxLength={11}
                />
                {ifsc.length > 0 && !IFSC_RE.test(ifsc.toUpperCase()) && (
                  <p className="text-[11px] text-red-500">Invalid IFSC format</p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">Bank Name (optional)</Label>
                <Input
                  value={bankName}
                  onChange={(e) => setBankName(e.target.value.slice(0, 100))}
                  className="h-9 text-sm"
                  maxLength={100}
                />
              </div>
            </>
          ) : (
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">
                UPI VPA <span className="text-red-500">*</span>
              </Label>
              <Input
                value={upi}
                onChange={(e) => setUpi(e.target.value.slice(0, 100))}
                className="h-9 text-sm"
                placeholder="name@bank"
                maxLength={100}
              />
              {upi.length > 0 && !UPI_RE.test(upi.trim()) && (
                <p className="text-[11px] text-red-500">
                  Invalid UPI format (must be like name@bank)
                </p>
              )}
            </div>
          )}

          {saveMutation.isError && (
            <p className="text-xs text-red-600">
              {saveMutation.error instanceof Error ? saveMutation.error.message : "Failed to save"}
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            size="sm"
            disabled={!valid || saveMutation.isPending}
            onClick={() => saveMutation.mutate()}
          >
            {saveMutation.isPending && <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EditUserInfoDialog({
  open,
  onOpenChange,
  userId,
  initial,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId: string;
  initial: VerificationDetails | undefined;
  onSaved: () => void;
}) {
  const queryClient = useQueryClient();
  const initialName = initial?.user.fullName ?? "";
  const initialVehicleId = initial?.vehicle?.id ?? null;
  const initialMasterTypeId = initial?.vehicle?.vehicleMasterTypeId ?? null;
  const isIndividualDriver = initial?.user.userType === "individual_driver";

  const [fullName, setFullName] = useState(initialName);
  const [vehicleMasterTypeId, setVehicleMasterTypeId] = useState<string | null>(
    initialMasterTypeId,
  );
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setFullName(initialName);
      setVehicleMasterTypeId(initialMasterTypeId);
      setError(null);
    }
  }, [open, initialName, initialMasterTypeId]);

  const trimmedName = fullName.trim();
  const nameChanged = trimmedName !== initialName;
  const vehicleTypeChanged =
    isIndividualDriver &&
    !!initialVehicleId &&
    !!vehicleMasterTypeId &&
    vehicleMasterTypeId !== initialMasterTypeId;
  const dirty = nameChanged || vehicleTypeChanged;
  const valid = trimmedName.length > 0 && trimmedName.length <= 100;

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (nameChanged) {
        await updatePartnerProfile(userId, { fullName: trimmedName });
      }
      if (vehicleTypeChanged && initialVehicleId && vehicleMasterTypeId) {
        await updateVehicleMasterType(initialVehicleId, vehicleMasterTypeId);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.verificationDetail(userId) });
      onSaved();
      onOpenChange(false);
    },
    onError: (err) => {
      setError(err instanceof Error ? err.message : "Failed to save");
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Edit Partner Info</DialogTitle>
          <DialogDescription className="text-xs">
            Update name{isIndividualDriver && initialVehicleId ? " and vehicle type" : ""}.
            Phone is the auth identifier and cannot be changed here.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2">
          <div className="space-y-1.5">
            <Label className="text-xs font-medium">Phone (read-only)</Label>
            <Input
              value={initial?.user.phone ?? ""}
              disabled
              className="h-9 text-sm bg-gray-50"
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-medium">
              Full Name <span className="text-red-500">*</span>
            </Label>
            <Input
              value={fullName}
              onChange={(e) => setFullName(e.target.value.slice(0, 100))}
              className="h-9 text-sm"
              maxLength={100}
            />
          </div>

          {isIndividualDriver && initialVehicleId && (
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Vehicle Type</Label>
              <VehicleTypePicker
                value={vehicleMasterTypeId ?? ""}
                onChange={(v) => setVehicleMasterTypeId(v || null)}
              />
              <p className="text-[11px] text-gray-500">
                Reg: {initial?.vehicle?.registrationNumber ?? "—"}
              </p>
            </div>
          )}

          {(saveMutation.isError || error) && (
            <p className="text-xs text-red-600">
              {error ??
                (saveMutation.error instanceof Error
                  ? saveMutation.error.message
                  : "Failed to save")}
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            size="sm"
            disabled={!valid || !dirty || saveMutation.isPending}
            onClick={() => {
              setError(null);
              saveMutation.mutate();
            }}
          >
            {saveMutation.isPending && <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
