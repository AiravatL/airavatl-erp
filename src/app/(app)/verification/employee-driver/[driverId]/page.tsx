"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { DocumentUpload } from "@/app/(app)/verification/document-upload";
import {
  getEmployeeDriverVerification,
  updateEmployeeDriver,
  verifyEmployeeDriver,
  revokeEmployeeDriver,
} from "@/lib/api/verification";
import { queryKeys } from "@/lib/query/keys";
import { useAuth } from "@/lib/auth/auth-context";
import { formatDate } from "@/lib/formatters";
import {
  ArrowLeft,
  Users,
  CheckCircle,
  AlertTriangle,
  ExternalLink,
  Loader2,
} from "lucide-react";

const AADHAAR_RE = /^[0-9]{12}$/;

export default function EmployeeDriverVerificationPage() {
  const params = useParams();
  const router = useRouter();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const driverId = params.driverId as string;

  const [notes, setNotes] = useState("");
  const [licenseNumber, setLicenseNumber] = useState("");
  const [licenseExpiry, setLicenseExpiry] = useState("");
  const [aadharNumber, setAadharNumber] = useState("");
  const [dlPhotoKey, setDlPhotoKey] = useState<string | null>(null);
  const [aadhaarPhotoKey, setAadhaarPhotoKey] = useState<string | null>(null);
  const [employeeId, setEmployeeId] = useState("");

  const detailQuery = useQuery({
    queryKey: queryKeys.employeeDriverVerification(driverId),
    queryFn: () => getEmployeeDriverVerification(driverId),
    enabled: !!driverId,
  });

  const d = detailQuery.data;
  const currentDlPhotoKey =
    dlPhotoKey ?? d?.uploads?.dl?.objectKey ?? d?.licensePhotoUrl ?? null;
  const currentAadhaarPhotoKey =
    aadhaarPhotoKey ?? d?.uploads?.aadhaar?.objectKey ?? d?.aadharPhotoUrl ?? null;
  const canVerify =
    licenseNumber.trim().length > 0 &&
    AADHAAR_RE.test(aadharNumber.trim()) &&
    !!currentDlPhotoKey &&
    !!currentAadhaarPhotoKey;

  useEffect(() => {
    if (!d) return;
    setLicenseNumber(d.licenseNumber ?? "");
    setLicenseExpiry(d.licenseExpiryDate ?? "");
    setAadharNumber(d.aadharNumber ?? "");
    setEmployeeId(d.employeeId ?? "");
  }, [d?.id]);

  const verifyMutation = useMutation({
    mutationFn: async () => {
      // Persist typed form values first so the RPC sees them.
      // update_employee_driver_v1 uses COALESCE internally, so blank fields
      // don't clobber existing data.
      await updateEmployeeDriver(driverId, {
        licenseNumber: licenseNumber.trim() || undefined,
        licenseExpiryDate: licenseExpiry || undefined,
        aadharNumber: aadharNumber.trim() || undefined,
        employeeId: employeeId.trim() || undefined,
      });
      return verifyEmployeeDriver(driverId, {
        verificationNotes: notes.trim() || undefined,
      });
    },
    onSuccess: () => {
      setNotes("");
      queryClient.invalidateQueries({ queryKey: queryKeys.employeeDriverVerification(driverId) });
      queryClient.invalidateQueries({ queryKey: ["verification", "pending"] });
      if (d?.transporter?.userId) {
        queryClient.invalidateQueries({ queryKey: queryKeys.transporterFleet(d.transporter.userId) });
      }
      router.push("/verification");
    },
  });

  const revokeMutation = useMutation({
    mutationFn: () =>
      revokeEmployeeDriver(driverId, { reason: notes.trim() || "Revoked by admin" }),
    onSuccess: () => {
      setNotes("");
      queryClient.invalidateQueries({ queryKey: queryKeys.employeeDriverVerification(driverId) });
      if (d?.transporter?.userId) {
        queryClient.invalidateQueries({ queryKey: queryKeys.transporterFleet(d.transporter.userId) });
      }
    },
  });

  const canRevoke = (user?.role === "super_admin" || user?.role === "admin") && d?.isDocumentsVerified;

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
        <button onClick={() => router.back()} className="text-sm text-blue-600 hover:underline">
          Go back
        </button>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 space-y-4 max-w-3xl">
      <div className="flex items-center justify-between">
        <button
          onClick={() => router.back()}
          className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700"
        >
          <ArrowLeft className="h-4 w-4" />
          Back
        </button>
        <Link
          href={`/fleet/user/${d.transporter.userId}`}
          className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800"
        >
          View transporter <ExternalLink className="h-3 w-3" />
        </Link>
      </div>

      <div>
        <div className="flex items-center gap-2 mb-1">
          <Users className="h-5 w-5 text-gray-500" />
          <h1 className="text-xl font-semibold text-gray-900">{d.fullName}</h1>
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
          Employee of {d.transporter.organizationName ?? d.transporter.fullName}
          {d.phone ? ` · ${d.phone}` : ""}
        </p>
      </div>

      <Card>
        <CardContent className="p-4 space-y-4">
          <h2 className="text-sm font-semibold text-gray-900">Employment</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-sm">
            <Row label="Employment status" value={d.employmentStatus} />
            <Row
              label="Start date"
              value={d.employmentStartDate ? formatDate(d.employmentStartDate) : null}
            />
            <Row label="Trips completed" value={String(d.totalTripsCompleted)} />
            <Row
              label="Average rating"
              value={d.averageRating != null ? Number(d.averageRating).toFixed(1) : null}
            />
          </div>

          <h3 className="text-sm font-semibold text-gray-900 pt-2 border-t border-gray-100">
            Documents
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
            <div>
              <Label htmlFor="license-number" className="text-xs">Driving license number *</Label>
              <Input
                id="license-number"
                value={licenseNumber}
                onChange={(e) => setLicenseNumber(e.target.value)}
                placeholder="DL12 2024 XXXXXXX"
              />
            </div>
            <div>
              <Label htmlFor="license-expiry" className="text-xs">Driving license expiry</Label>
              <Input
                id="license-expiry"
                type="date"
                value={licenseExpiry ?? ""}
                onChange={(e) => setLicenseExpiry(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="aadhar" className="text-xs">Aadhaar number *</Label>
              <Input
                id="aadhar"
                value={aadharNumber}
                onChange={(e) => setAadharNumber(e.target.value.replace(/\D/g, ""))}
                maxLength={12}
                placeholder="12-digit Aadhaar"
              />
              {aadharNumber.length > 0 && !AADHAAR_RE.test(aadharNumber) && (
                <p className="mt-1 text-[11px] text-red-500">Aadhaar number must be 12 digits</p>
              )}
            </div>
            <div>
              <Label htmlFor="employee-id" className="text-xs">Employee ID</Label>
              <Input
                id="employee-id"
                value={employeeId}
                onChange={(e) => setEmployeeId(e.target.value)}
                placeholder="EMP-001"
              />
            </div>
          </div>

          <DocumentUpload
            label="Driving License Photo"
            docType="dl"
            userId={d.userId}
            required
            objectKey={currentDlPhotoKey}
            uploadSummary={d.uploads?.dl}
            disabled={d.isDocumentsVerified}
            onUploaded={setDlPhotoKey}
          />

          <DocumentUpload
            label="Aadhaar Photo"
            docType="aadhaar"
            userId={d.userId}
            required
            objectKey={currentAadhaarPhotoKey}
            uploadSummary={d.uploads?.aadhaar}
            disabled={d.isDocumentsVerified}
            onUploaded={setAadhaarPhotoKey}
          />

          {d.verificationNotes && (
            <>
              <h3 className="text-sm font-semibold text-gray-900 pt-2 border-t border-gray-100">
                Verification notes
              </h3>
              <p className="text-sm text-gray-600 whitespace-pre-wrap">{d.verificationNotes}</p>
            </>
          )}

          <div className="pt-2 border-t border-gray-100 space-y-2">
            <Label htmlFor="driver-notes" className="text-xs">
              {d.isDocumentsVerified ? "Revocation reason" : "Verification notes"} (optional)
            </Label>
            <Textarea
              id="driver-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={
                d.isDocumentsVerified
                  ? "Reason for revoking verification…"
                  : "Any notes about this driver…"
              }
              rows={3}
              disabled={verifyMutation.isPending || revokeMutation.isPending}
            />
            <div className="flex gap-2">
              {!d.isDocumentsVerified && (
                <Button
                  onClick={() => verifyMutation.mutate()}
                  disabled={verifyMutation.isPending || !canVerify}
                  className="bg-emerald-600 hover:bg-emerald-700"
                >
                  {verifyMutation.isPending && <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />}
                  {verifyMutation.isPending ? "Verifying…" : "Mark as Verified"}
                </Button>
              )}
              {canRevoke && (
                <Button
                  variant="outline"
                  onClick={() => revokeMutation.mutate()}
                  disabled={revokeMutation.isPending}
                  className="text-red-600 border-red-200 hover:bg-red-50"
                >
                  {revokeMutation.isPending ? "Revoking…" : "Revoke Verification"}
                </Button>
              )}
            </div>
            {(verifyMutation.isError || revokeMutation.isError) && (
              <p className="text-xs text-red-600">
                {(verifyMutation.error as Error)?.message ??
                  (revokeMutation.error as Error)?.message}
              </p>
            )}
            {!canVerify && !d.isDocumentsVerified && (
              <p className="text-[11px] text-amber-600">
                Driving license, Aadhaar number, and both document uploads are required before verifying.
              </p>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div>
      <p className="text-xs text-gray-500">{label}</p>
      <p className="text-sm text-gray-900">{value || "—"}</p>
    </div>
  );
}
