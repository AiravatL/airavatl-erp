"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
  submitVerification,
  revokeVerification,
  getTransporterFleet,
  type TransporterFleetVehicle,
  type TransporterFleetEmployeeDriver,
} from "@/lib/api/verification";
import { VehicleTypePicker } from "@/components/shared/vehicle-type-picker";
import { queryKeys } from "@/lib/query/keys";
import { formatDate } from "@/lib/formatters";
import { useAuth } from "@/lib/auth/auth-context";
import { DocumentUpload } from "@/app/(app)/verification/document-upload";
import {
  ArrowLeft, Phone, MapPin, Calendar, ShieldCheck, ShieldOff,
  Loader2, AlertTriangle, CheckCircle, Truck, Users,
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

// Validation helpers
const AADHAAR_RE = /^[0-9]{12}$/;
const BANK_ACCT_RE = /^[0-9]{8,18}$/;
const IFSC_RE = /^[A-Z]{4}0[A-Z0-9]{6}$/;

export default function VerificationDetailPage() {
  const params = useParams();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const userId = params.userId as string;

  // Form state — Driver
  const [regNumber, setRegNumber] = useState<string>();
  const [vehicleMasterTypeId, setVehicleMasterTypeId] = useState<string>();
  const [rcPhotoKey, setRcPhotoKey] = useState<string | null>();
  const [dlNumber, setDlNumber] = useState<string>();
  const [dlExpiry, setDlExpiry] = useState<string>();
  const [dlPhotoKey, setDlPhotoKey] = useState<string | null>();

  // Form state — Transporter
  const [transportLicenseNo, setTransportLicenseNo] = useState<string>();
  const [transportLicenseExp, setTransportLicenseExp] = useState<string>();
  const [transportLicensePhotoKey, setTransportLicensePhotoKey] = useState<string | null>();

  // Form state — Common
  const [aadhaarNumber, setAadhaarNumber] = useState<string>();
  const [aadhaarPhotoKey, setAadhaarPhotoKey] = useState<string | null>();
  const [bankHolder, setBankHolder] = useState<string>();
  const [bankAccount, setBankAccount] = useState<string>();
  const [bankIfsc, setBankIfsc] = useState<string>();
  const [upiId, setUpiId] = useState<string>();
  const [gstNumber, setGstNumber] = useState<string>();
  const [panNumber, setPanNumber] = useState<string>();
  const [notes, setNotes] = useState<string>();

  // Revoke dialog
  const [showRevoke, setShowRevoke] = useState(false);
  const [revokeReason, setRevokeReason] = useState("");

  const detailQuery = useQuery({
    queryKey: queryKeys.verificationDetail(userId),
    queryFn: () => getVerificationDetails(userId),
    enabled: !!userId,
  });

  const isTransporterQuery = detailQuery.data?.user.userType === "transporter";

  const fleetQuery = useQuery({
    queryKey: queryKeys.transporterFleet(userId),
    queryFn: () => getTransporterFleet(userId),
    enabled: !!userId && isTransporterQuery,
  });

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: queryKeys.verificationDetail(userId) });
    queryClient.invalidateQueries({ queryKey: queryKeys.transporterFleet(userId) });
    queryClient.invalidateQueries({ queryKey: ["verification", "pending"] });
  };

  const submitMutation = useMutation({
    mutationFn: () => {
      const detail = detailQuery.data;
      if (!detail) throw new Error("Partner details not loaded");

      if (detail.user.userType === "individual_driver") {
        return submitVerification(userId, {
          licenseNumber: currentDlNumber.trim(),
          licenseExpiryDate: currentDlExpiry || undefined,
          dlPhotoKey: currentDlPhotoKey ?? undefined,
          aadharNumber: currentAadhaarNumber.trim(),
          aadharPhotoKey: currentAadhaarPhotoKey ?? undefined,
          registrationNumber: currentRegNumber.trim(),
          vehicleMasterTypeId: currentVehicleMasterTypeId,
          rcPhotoKey: currentRcPhotoKey ?? undefined,
          bankAccountNumber: currentBankAccount.trim(),
          bankIfscCode: currentBankIfsc.trim().toUpperCase(),
          bankAccountHolderName: currentBankHolder.trim(),
          upiId: currentUpiId.trim() || undefined,
          notes: currentNotes.trim() || undefined,
        });
      }

      return submitVerification(userId, {
        transportLicenseNumber: currentTransportLicenseNo.trim(),
        transportLicenseExpiry: currentTransportLicenseExp || undefined,
        licensePhotoKey: currentTransportLicensePhotoKey ?? undefined,
        aadharNumber: currentAadhaarNumber.trim(),
        aadharPhotoKey: currentAadhaarPhotoKey ?? undefined,
        bankAccountNumber: currentBankAccount.trim(),
        bankIfscCode: currentBankIfsc.trim().toUpperCase(),
        bankAccountHolderName: currentBankHolder.trim(),
        upiId: currentUpiId.trim() || undefined,
        gstNumber: currentGstNumber.trim() || undefined,
        panNumber: currentPanNumber.trim().toUpperCase() || undefined,
        notes: currentNotes.trim() || undefined,
      });
    },
    onSuccess: () => {
      invalidateAll();
      router.push("/verification");
    },
  });

  const revokeMutation = useMutation({
    mutationFn: () => revokeVerification(userId, { reason: revokeReason.trim() }),
    onSuccess: () => {
      setShowRevoke(false);
      setRevokeReason("");
      invalidateAll();
    },
  });

  const detail = detailQuery.data;
  const isDriver = detail?.user.userType === "individual_driver";
  const isTransporter = detail?.user.userType === "transporter";
  const isVerified = detail?.user.isVerified;
  const canRevoke = (user?.role === "super_admin" || user?.role === "admin") && isVerified;
  const currentRegNumber = regNumber ?? detail?.vehicle?.registrationNumber ?? "";
  const currentVehicleMasterTypeId =
    vehicleMasterTypeId ?? detail?.vehicle?.vehicleMasterTypeId ?? "";
  const currentRcPhotoKey =
    rcPhotoKey ?? detail?.uploads.rc?.objectKey ?? detail?.vehicle?.registrationCertificateUrl ?? null;
  const currentDlNumber = dlNumber ?? detail?.driver?.licenseNumber ?? "";
  const currentDlExpiry = dlExpiry ?? detail?.driver?.licenseExpiryDate ?? "";
  const currentDlPhotoKey =
    dlPhotoKey ?? detail?.uploads.dl?.objectKey ?? detail?.driver?.licensePhotoUrl ?? null;
  const currentTransportLicenseNo =
    transportLicenseNo ?? detail?.transporter?.transportLicenseNumber ?? "";
  const currentTransportLicenseExp =
    transportLicenseExp ?? detail?.transporter?.transportLicenseExpiry ?? "";
  const currentTransportLicensePhotoKey =
    transportLicensePhotoKey ??
    detail?.uploads.transport_license?.objectKey ??
    detail?.transporter?.licensePhotoUrl ??
    null;
  const currentAadhaarNumber =
    aadhaarNumber ?? detail?.driver?.aadharNumber ?? detail?.transporter?.aadharNumber ?? "";
  const currentAadhaarPhotoKey =
    aadhaarPhotoKey ??
    detail?.uploads.aadhaar?.objectKey ??
    detail?.driver?.aadharPhotoUrl ??
    detail?.transporter?.aadharPhotoUrl ??
    null;
  const currentBankHolder =
    bankHolder ?? detail?.driver?.bankAccountHolderName ?? detail?.transporter?.bankAccountHolderName ?? "";
  const currentBankAccount =
    bankAccount ?? detail?.driver?.bankAccountNumber ?? detail?.transporter?.bankAccountNumber ?? "";
  const currentBankIfsc =
    bankIfsc ?? detail?.driver?.bankIfscCode ?? detail?.transporter?.bankIfscCode ?? "";
  const currentUpiId = upiId ?? detail?.driver?.upiId ?? detail?.transporter?.upiId ?? "";
  const currentGstNumber = gstNumber ?? detail?.transporter?.gstNumber ?? "";
  const currentPanNumber = panNumber ?? detail?.transporter?.panNumber ?? "";
  const currentNotes = notes ?? detail?.driver?.verificationNotes ?? detail?.transporter?.verificationNotes ?? "";

  // Validation
  const driverValid = isDriver && (
    currentRegNumber.trim().length > 0 &&
    currentVehicleType.length > 0 &&
    !!currentRcPhotoKey &&
    currentDlNumber.trim().length > 0 &&
    !!currentDlPhotoKey &&
    AADHAAR_RE.test(currentAadhaarNumber.trim()) &&
    !!currentAadhaarPhotoKey &&
    currentBankHolder.trim().length > 0 &&
    BANK_ACCT_RE.test(currentBankAccount.trim()) &&
    IFSC_RE.test(currentBankIfsc.trim().toUpperCase())
  );

  const transporterValid = isTransporter && (
    currentTransportLicenseNo.trim().length > 0 &&
    !!currentTransportLicensePhotoKey &&
    AADHAAR_RE.test(currentAadhaarNumber.trim()) &&
    !!currentAadhaarPhotoKey &&
    currentBankHolder.trim().length > 0 &&
    BANK_ACCT_RE.test(currentBankAccount.trim()) &&
    IFSC_RE.test(currentBankIfsc.trim().toUpperCase())
  );

  const canSubmit = !isVerified && (driverValid || transporterValid);

  if (detailQuery.isLoading) {
    return (
      <div className="p-4 sm:p-6">
        <p className="text-sm text-gray-500">Loading partner details...</p>
      </div>
    );
  }

  if (detailQuery.isError || !detail) {
    return (
      <div className="p-4 sm:p-6">
        <p className="text-sm text-gray-500">Partner not found.</p>
        <Link href="/verification" className="text-sm text-blue-600 hover:underline">
          Back to pending
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Back nav */}
      <div className="flex items-center justify-between">
        <Link
          href="/verification"
          className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Pending
        </Link>
        {canRevoke && (
          <Button
            size="sm"
            variant="outline"
            className="h-8 text-xs border-red-200 text-red-700 hover:bg-red-50"
            onClick={() => setShowRevoke(true)}
          >
            <ShieldOff className="h-3.5 w-3.5 mr-1" />
            Revoke Verification
          </Button>
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
        <p className="text-sm text-gray-500">
          {formatPhone(detail.user.phone)} &middot; Signed up {formatDate(detail.user.createdAt)}
        </p>
      </div>

      {/* Error */}
      {submitMutation.isError && (
        <div className="rounded-md bg-red-50 p-3">
          <p className="text-sm text-red-700">
            {submitMutation.error instanceof Error ? submitMutation.error.message : "Verification failed"}
          </p>
        </div>
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
              {detail.user.city && (
                <div className="flex items-center gap-2 text-gray-600">
                  <MapPin className="h-3.5 w-3.5 text-gray-400" />
                  {detail.user.city}
                </div>
              )}
              {detail.user.state && (
                <div className="flex items-center gap-2 text-gray-600">
                  <MapPin className="h-3.5 w-3.5 text-gray-400" />
                  {detail.user.state}
                </div>
              )}
              <div className="flex items-center gap-2 text-gray-600">
                <Calendar className="h-3.5 w-3.5 text-gray-400" />
                Signed up {formatDate(detail.user.createdAt)}
              </div>
              {isTransporter && detail.transporter?.organizationName && (
                <div className="pt-2 border-t border-gray-100">
                  <p className="text-xs text-gray-500">Organization</p>
                  <p className="text-sm font-medium">{detail.transporter.organizationName}</p>
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

        {/* Right: Verification Form */}
        <Card className="lg:col-span-2">
          <CardContent className="p-4 sm:p-6 space-y-8">
            <h2 className="text-sm font-semibold text-gray-900">Verification Documents &amp; Details</h2>

            {/* DRIVER SECTIONS */}
            {isDriver && (
              <>
                {/* Section A: Vehicle (RC) */}
                <section className="space-y-4">
                  <div>
                    <h3 className="text-sm font-semibold text-gray-900">Vehicle (RC)</h3>
                    <div className="border-b border-gray-200 mt-1" />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <Label className="text-sm font-medium">
                        Registration Number <span className="text-red-500">*</span>
                      </Label>
                      <Input
                        placeholder="e.g. MH02AB1234"
                        value={currentRegNumber}
                        onChange={(e) => setRegNumber(e.target.value.toUpperCase().slice(0, 15))}
                        className="h-9 text-sm"
                        maxLength={15}
                        disabled={!!isVerified}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-sm font-medium">
                        Vehicle Type <span className="text-red-500">*</span>
                      </Label>
                      <VehicleTypePicker
                        value={currentVehicleMasterTypeId}
                        onChange={setVehicleMasterTypeId}
                        disabled={!!isVerified}
                      />
                    </div>
                  </div>
                  <DocumentUpload
                    label="RC Photo"
                    docType="rc"
                    userId={userId}
                    required
                    objectKey={currentRcPhotoKey}
                    uploadSummary={detail.uploads.rc}
                    disabled={!!isVerified}
                    onUploaded={setRcPhotoKey}
                  />
                </section>

                {/* Section B: Driving License */}
                <section className="space-y-4">
                  <div>
                    <h3 className="text-sm font-semibold text-gray-900">Driving License</h3>
                    <div className="border-b border-gray-200 mt-1" />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <Label className="text-sm font-medium">
                        DL Number <span className="text-red-500">*</span>
                      </Label>
                      <Input
                        placeholder="e.g. DL-1234567890"
                        value={currentDlNumber}
                        onChange={(e) => setDlNumber(e.target.value.slice(0, 20))}
                        className="h-9 text-sm"
                        maxLength={20}
                        disabled={!!isVerified}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-sm font-medium">DL Expiry Date</Label>
                      <Input
                        type="date"
                        value={currentDlExpiry}
                        onChange={(e) => setDlExpiry(e.target.value)}
                        className="h-9 text-sm"
                        disabled={!!isVerified}
                      />
                    </div>
                  </div>
                  <DocumentUpload
                    label="DL Photo"
                    docType="dl"
                    userId={userId}
                    required
                    objectKey={currentDlPhotoKey}
                    uploadSummary={detail.uploads.dl}
                    disabled={!!isVerified}
                    onUploaded={setDlPhotoKey}
                  />
                </section>
              </>
            )}

            {/* TRANSPORTER SECTIONS */}
            {isTransporter && (
              <section className="space-y-4">
                <div>
                  <h3 className="text-sm font-semibold text-gray-900">Transport License</h3>
                  <div className="border-b border-gray-200 mt-1" />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label className="text-sm font-medium">
                      License Number <span className="text-red-500">*</span>
                    </Label>
                    <Input
                      placeholder="e.g. TL-1234567890"
                      value={currentTransportLicenseNo}
                      onChange={(e) => setTransportLicenseNo(e.target.value.slice(0, 20))}
                      className="h-9 text-sm"
                      maxLength={20}
                      disabled={!!isVerified}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-sm font-medium">License Expiry</Label>
                    <Input
                      type="date"
                      value={currentTransportLicenseExp}
                      onChange={(e) => setTransportLicenseExp(e.target.value)}
                      className="h-9 text-sm"
                      disabled={!!isVerified}
                    />
                  </div>
                </div>
                <DocumentUpload
                  label="Transport License Photo"
                  docType="transport_license"
                  userId={userId}
                  required
                  objectKey={currentTransportLicensePhotoKey}
                  uploadSummary={detail.uploads.transport_license}
                  disabled={!!isVerified}
                  onUploaded={setTransportLicensePhotoKey}
                />
              </section>
            )}

            {/* COMMON: Aadhaar */}
            <section className="space-y-4">
              <div>
                <h3 className="text-sm font-semibold text-gray-900">
                  {isTransporter ? "Owner's Aadhaar" : "Aadhaar"}
                </h3>
                <div className="border-b border-gray-200 mt-1" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm font-medium">
                  Aadhaar Number <span className="text-red-500">*</span>
                </Label>
                <Input
                  placeholder="123456789012"
                  value={currentAadhaarNumber}
                  onChange={(e) => setAadhaarNumber(e.target.value.replace(/\D/g, "").slice(0, 12))}
                  className="h-9 text-sm max-w-xs"
                  inputMode="numeric"
                  maxLength={12}
                  disabled={!!isVerified}
                />
                {currentAadhaarNumber.length > 0 && !AADHAAR_RE.test(currentAadhaarNumber) && (
                  <p className="text-[11px] text-red-500">Aadhaar number must be 12 digits</p>
                )}
              </div>
              <DocumentUpload
                label="Aadhaar Photo"
                docType="aadhaar"
                userId={userId}
                required
                objectKey={currentAadhaarPhotoKey}
                uploadSummary={detail.uploads.aadhaar}
                disabled={!!isVerified}
                onUploaded={setAadhaarPhotoKey}
              />
            </section>

            {/* COMMON: Bank Details */}
            <section className="space-y-4">
              <div>
                <h3 className="text-sm font-semibold text-gray-900">Bank Details</h3>
                <div className="border-b border-gray-200 mt-1" />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-sm font-medium">
                    Account Holder Name <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    placeholder="Rajesh Kumar"
                    value={currentBankHolder}
                    onChange={(e) => setBankHolder(e.target.value.slice(0, 100))}
                    className="h-9 text-sm"
                    maxLength={100}
                    disabled={!!isVerified}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-sm font-medium">
                    Account Number <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    placeholder="12345678901234"
                    value={currentBankAccount}
                    onChange={(e) => setBankAccount(e.target.value.replace(/\D/g, "").slice(0, 18))}
                    className="h-9 text-sm"
                    inputMode="numeric"
                    maxLength={18}
                    disabled={!!isVerified}
                  />
                  {currentBankAccount.length > 0 && !BANK_ACCT_RE.test(currentBankAccount) && (
                    <p className="text-[11px] text-red-500">Account number must be 8-18 digits</p>
                  )}
                </div>
                <div className="space-y-1.5">
                  <Label className="text-sm font-medium">
                    IFSC Code <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    placeholder="SBIN0001234"
                    value={currentBankIfsc}
                    onChange={(e) => setBankIfsc(e.target.value.toUpperCase().slice(0, 11))}
                    className="h-9 text-sm"
                    maxLength={11}
                    disabled={!!isVerified}
                  />
                  {currentBankIfsc.length > 0 && !IFSC_RE.test(currentBankIfsc.toUpperCase()) && (
                    <p className="text-[11px] text-red-500">Invalid IFSC code format</p>
                  )}
                </div>
              </div>
            </section>

            {/* Optional fields */}
            <section className="space-y-4">
              <div>
                <h3 className="text-sm font-semibold text-gray-900">Optional</h3>
                <div className="border-b border-gray-200 mt-1" />
              </div>
              <div className={`grid grid-cols-1 ${isTransporter ? "sm:grid-cols-3" : ""} gap-4`}>
                <div className="space-y-1.5">
                  <Label className="text-sm font-medium">UPI ID</Label>
                  <Input
                    placeholder="name@upi"
                    value={currentUpiId}
                    onChange={(e) => setUpiId(e.target.value.slice(0, 50))}
                    className="h-9 text-sm"
                    maxLength={50}
                    disabled={!!isVerified}
                  />
                </div>
                {isTransporter && (
                  <>
                    <div className="space-y-1.5">
                      <Label className="text-sm font-medium">GST Number</Label>
                      <Input
                        placeholder="22AAAAA0000A1Z5"
                        value={currentGstNumber}
                        onChange={(e) => setGstNumber(e.target.value.toUpperCase().slice(0, 15))}
                        className="h-9 text-sm"
                        maxLength={15}
                        disabled={!!isVerified}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-sm font-medium">PAN Number</Label>
                      <Input
                        placeholder="AAAAA0000A"
                        value={currentPanNumber}
                        onChange={(e) => setPanNumber(e.target.value.toUpperCase().slice(0, 10))}
                        className="h-9 text-sm"
                        maxLength={10}
                        disabled={!!isVerified}
                      />
                    </div>
                  </>
                )}
              </div>
            </section>

            {/* Notes */}
            <section className="space-y-4">
              <div>
                <h3 className="text-sm font-semibold text-gray-900">Notes</h3>
                <div className="border-b border-gray-200 mt-1" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm font-medium">Verification Notes</Label>
                <Textarea
                  placeholder="Any notes about this verification..."
                  value={currentNotes}
                  onChange={(e) => setNotes(e.target.value.slice(0, 500))}
                  rows={3}
                  className="text-sm resize-none"
                  maxLength={500}
                  disabled={!!isVerified}
                />
                <p className="text-[11px] text-gray-500 text-right">{currentNotes.length}/500</p>
              </div>
            </section>

            {/* Submit */}
            {!isVerified && (
              <div className="pt-2">
                <Button
                  onClick={() => submitMutation.mutate()}
                  disabled={!canSubmit || submitMutation.isPending}
                  className="h-10 text-sm"
                >
                  {submitMutation.isPending ? (
                    <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                  ) : (
                    <ShieldCheck className="h-4 w-4 mr-1.5" />
                  )}
                  {submitMutation.isPending ? "Verifying..." : "Verify Partner"}
                </Button>
              </div>
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
              ) : fleetQuery.isError ? (
                <p className="text-xs text-red-600">
                  {fleetQuery.error instanceof Error ? fleetQuery.error.message : "Failed to load fleet"}
                </p>
              ) : fleetQuery.data?.vehicles.length === 0 ? (
                <p className="text-xs text-gray-500">No vehicles added yet.</p>
              ) : (
                <ul className="space-y-2">
                  {(fleetQuery.data?.vehicles ?? []).map((v) => (
                    <FleetVehicleRow key={v.id} vehicle={v} />
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
              ) : fleetQuery.isError ? (
                <p className="text-xs text-red-600">
                  {fleetQuery.error instanceof Error ? fleetQuery.error.message : "Failed to load drivers"}
                </p>
              ) : fleetQuery.data?.employee_drivers.length === 0 ? (
                <p className="text-xs text-gray-500">No employee drivers added yet.</p>
              ) : (
                <ul className="space-y-2">
                  {(fleetQuery.data?.employee_drivers ?? []).map((d) => (
                    <FleetEmployeeDriverRow key={d.id} driver={d} />
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Revoke Dialog */}
      <Dialog open={showRevoke} onOpenChange={(open) => { if (!open) { setShowRevoke(false); setRevokeReason(""); } }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Revoke Verification</DialogTitle>
            <DialogDescription className="flex items-start gap-2 pt-2">
              <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
              <span>This will mark the partner as unverified. They will no longer be eligible for trips.</span>
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5 py-2">
            <Label className="text-sm font-medium">
              Reason <span className="text-red-500">*</span>
            </Label>
            <Textarea
              placeholder="Reason for revoking verification..."
              value={revokeReason}
              onChange={(e) => setRevokeReason(e.target.value.slice(0, 500))}
              rows={3}
              className="text-sm resize-none"
              maxLength={500}
            />
          </div>
          {revokeMutation.isError && (
            <p className="text-sm text-red-600">
              {revokeMutation.error instanceof Error ? revokeMutation.error.message : "Failed to revoke"}
            </p>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              size="sm"
              onClick={() => { setShowRevoke(false); setRevokeReason(""); }}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              className="bg-red-600 hover:bg-red-700 text-white"
              onClick={() => revokeMutation.mutate()}
              disabled={!revokeReason.trim() || revokeMutation.isPending}
            >
              {revokeMutation.isPending && <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />}
              Revoke
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// Small clock icon used in partner info sidebar
function Clock({ className }: { className?: string }) {
  return (
    <svg className={className} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  );
}

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

function FleetVehicleRow({ vehicle }: { vehicle: TransporterFleetVehicle }) {
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
        href={`/verification/vehicle/${vehicle.id}`}
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

function FleetEmployeeDriverRow({ driver }: { driver: TransporterFleetEmployeeDriver }) {
  const phoneLabel = driver.phone ? formatPhone(driver.phone) : null;
  return (
    <li>
      <Link
        href={`/verification/employee-driver/${driver.id}`}
        className="flex items-center gap-3 rounded-md border border-gray-200 p-2.5 hover:bg-gray-50"
      >
        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gray-100">
          <Users className="h-4 w-4 text-gray-600" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-gray-900 truncate">{driver.full_name}</p>
          <p className="text-[11px] text-gray-500 truncate">
            {[phoneLabel, driver.license_number ? `DL ${driver.license_number}` : null]
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
