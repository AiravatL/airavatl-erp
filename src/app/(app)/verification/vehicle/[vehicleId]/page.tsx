"use client";

import { useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  getVehicleVerification,
  verifyVehicle,
  revokeVehicle,
  prepareVehicleRcUpload,
  confirmVehicleRcUpload,
} from "@/lib/api/verification";
import { prepareAndUploadSingleFile } from "@/lib/uploads/workflow";
import { queryKeys } from "@/lib/query/keys";
import { useAuth } from "@/lib/auth/auth-context";
import { formatDate } from "@/lib/formatters";
import {
  ArrowLeft,
  Truck,
  CheckCircle,
  AlertTriangle,
  AlertCircle,
  ExternalLink,
  Upload,
  Loader2,
  RefreshCw,
  FileText,
} from "lucide-react";

export default function VehicleVerificationPage() {
  const params = useParams();
  const router = useRouter();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const vehicleId = params.vehicleId as string;
  const [notes, setNotes] = useState("");

  const detailQuery = useQuery({
    queryKey: queryKeys.vehicleVerification(vehicleId),
    queryFn: () => getVehicleVerification(vehicleId),
    enabled: !!vehicleId,
  });

  const verifyMutation = useMutation({
    mutationFn: () => verifyVehicle(vehicleId, { verificationNotes: notes.trim() || undefined }),
    onSuccess: () => {
      setNotes("");
      queryClient.invalidateQueries({ queryKey: queryKeys.vehicleVerification(vehicleId) });
      if (v?.owner?.user_id) {
        queryClient.invalidateQueries({ queryKey: queryKeys.transporterFleet(v.owner.user_id) });
      }
    },
  });

  const revokeMutation = useMutation({
    mutationFn: () => revokeVehicle(vehicleId, { reason: notes.trim() || "Revoked by admin" }),
    onSuccess: () => {
      setNotes("");
      queryClient.invalidateQueries({ queryKey: queryKeys.vehicleVerification(vehicleId) });
      if (v?.owner?.user_id) {
        queryClient.invalidateQueries({ queryKey: queryKeys.transporterFleet(v.owner.user_id) });
      }
    },
  });

  const v = detailQuery.data;
  const canRevoke = (user?.role === "super_admin" || user?.role === "admin") && v?.is_verified;

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
        <button onClick={() => router.back()} className="text-sm text-blue-600 hover:underline">
          Go back
        </button>
      </div>
    );
  }

  const spec = [
    v.capacity_tons != null ? `${v.capacity_tons} Ton` : null,
    v.length_feet != null ? `${v.length_feet} ft` : null,
    v.wheel_count != null ? `${v.wheel_count} Wheel` : null,
  ]
    .filter(Boolean)
    .join(" ");

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
        {v.owner?.user_id && (
          <Link
            href={`/vendors/user/${v.owner.user_id}`}
            className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800"
          >
            View owner <ExternalLink className="h-3 w-3" />
          </Link>
        )}
      </div>

      <div>
        <div className="flex items-center gap-2 mb-1">
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
          {[spec || null, v.body_type === "container" ? "Container" : v.body_type === "open" ? "Open Truck" : null]
            .filter(Boolean)
            .join(" · ") || "—"}
        </p>
      </div>

      <Card>
        <CardContent className="p-4 space-y-4">
          <h2 className="text-sm font-semibold text-gray-900">Vehicle details</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-sm">
            <Row label="Registration" value={v.registration_number} />
            <Row label="Master type" value={v.vehicle_type_label} />
            <Row label="Body type" value={v.body_type === "container" ? "Container" : "Open Truck"} />
            <Row label="Capacity" value={v.capacity_tons != null ? `${v.capacity_tons} Ton` : null} />
            <Row label="Length" value={v.length_feet != null ? `${v.length_feet} ft` : null} />
            <Row label="Wheels" value={v.wheel_count != null ? `${v.wheel_count}` : null} />
            <Row label="Status" value={v.status} />
            <Row label="Verified at" value={v.verified_at ? formatDate(v.verified_at) : null} />
          </div>

          {v.owner && (
            <>
              <h3 className="text-sm font-semibold text-gray-900 pt-2 border-t border-gray-100">Owner</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-sm">
                <Row label="Name" value={v.owner.full_name} />
                <Row label="Phone" value={v.owner.phone} />
                {v.owner.organization_name && (
                  <Row label="Organization" value={v.owner.organization_name} />
                )}
                <Row label="Role" value={v.owner_type === "transporter" ? "Transporter" : "Individual Driver"} />
              </div>
            </>
          )}

          {/* Registration Certificate upload */}
          <div className="pt-2 border-t border-gray-100 space-y-2">
            <h3 className="text-sm font-semibold text-gray-900">Registration Certificate (RC)</h3>
            <VehicleRcUpload
              vehicleId={v.id}
              currentObjectKey={v.registration_certificate_url}
              onUploaded={() => {
                queryClient.invalidateQueries({
                  queryKey: queryKeys.vehicleVerification(vehicleId),
                });
              }}
            />
          </div>

          {v.verification_notes && (
            <>
              <h3 className="text-sm font-semibold text-gray-900 pt-2 border-t border-gray-100">
                Verification notes
              </h3>
              <p className="text-sm text-gray-600 whitespace-pre-wrap">{v.verification_notes}</p>
            </>
          )}

          <div className="pt-2 border-t border-gray-100 space-y-2">
            <Label htmlFor="vehicle-notes" className="text-xs">
              {v.is_verified ? "Revocation reason" : "Verification notes"} (optional)
            </Label>
            <Textarea
              id="vehicle-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={v.is_verified ? "Reason for revoking verification…" : "Any notes about this vehicle…"}
              rows={3}
              disabled={verifyMutation.isPending || revokeMutation.isPending}
            />
            <div className="flex gap-2">
              {!v.is_verified && (
                <Button
                  onClick={() => verifyMutation.mutate()}
                  disabled={verifyMutation.isPending || !v.registration_certificate_url}
                  className="bg-emerald-600 hover:bg-emerald-700"
                  title={!v.registration_certificate_url ? "Upload the RC before verifying" : undefined}
                >
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
                {(verifyMutation.error as Error)?.message ?? (revokeMutation.error as Error)?.message}
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

/* -------------------------------------------------------------------------- */
/*  Vehicle RC upload (vehicle-id keyed, not user-id keyed)                   */
/* -------------------------------------------------------------------------- */

const RC_MAX_SIZE = 10 * 1024 * 1024; // 10 MB
const RC_ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/webp", "application/pdf"];

function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function VehicleRcUpload({
  vehicleId,
  currentObjectKey,
  onUploaded,
}: {
  vehicleId: string;
  currentObjectKey: string | null;
  onUploaded: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [progress, setProgress] = useState(0);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);

  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      return prepareAndUploadSingleFile({
        file,
        prepare: async (payload) => {
          const result = await prepareVehicleRcUpload(vehicleId, {
            fileName: payload.fileName,
            mimeType: payload.mimeType,
          });
          return { uploadUrl: result.uploadUrl, objectKey: result.objectKey };
        },
        confirm: async (payload) => {
          await confirmVehicleRcUpload(vehicleId, {
            objectKey: payload.objectKey,
            fileName: payload.fileName,
            mimeType: payload.mimeType,
            fileSizeBytes: payload.fileSizeBytes,
          });
        },
        onProgress: (pct) => setProgress(pct),
      });
    },
    onSuccess: () => {
      setProgress(100);
      onUploaded();
    },
    onError: (err) => {
      setLocalError(err instanceof Error ? err.message : "Upload failed. Please try again.");
    },
  });

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setLocalError(null);
    setProgress(0);
    const file = e.target.files?.[0];
    if (!file) return;
    if (!RC_ACCEPTED_TYPES.includes(file.type)) {
      setLocalError("File must be JPG, PNG, WebP, or PDF");
      setSelectedFile(null);
      return;
    }
    if (file.size > RC_MAX_SIZE) {
      setLocalError("File must be less than 10 MB");
      setSelectedFile(null);
      return;
    }
    setSelectedFile(file);
    uploadMutation.mutate(file);
  };

  const handleReplace = () => {
    setLocalError(null);
    setProgress(0);
    setSelectedFile(null);
    inputRef.current?.click();
  };

  const isUploading = uploadMutation.isPending;
  const isUploaded = !!currentObjectKey;

  return (
    <div className="space-y-1.5">
      <input
        ref={inputRef}
        type="file"
        accept=".jpg,.jpeg,.png,.webp,.pdf"
        onChange={handleFileChange}
        className="hidden"
        disabled={isUploading}
      />

      {isUploaded && !isUploading && (
        <div className="flex items-center gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2">
          <FileText className="h-4 w-4 text-emerald-600 shrink-0" />
          <span className="text-sm text-emerald-700 truncate flex-1">
            {selectedFile?.name ?? "RC uploaded"}
            {selectedFile ? ` (${formatFileSize(selectedFile.size)})` : ""}
          </span>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs text-emerald-700 hover:text-emerald-800"
            onClick={handleReplace}
          >
            <RefreshCw className="h-3 w-3 mr-1" />
            Replace
          </Button>
        </div>
      )}

      {isUploading && (
        <div className="rounded-md border border-gray-200 bg-gray-50 px-3 py-2 space-y-1.5">
          <div className="flex items-center gap-2">
            <Loader2 className="h-4 w-4 text-gray-500 animate-spin shrink-0" />
            <span className="text-sm text-gray-600 truncate flex-1">
              {selectedFile?.name ?? "Uploading…"}{" "}
              {selectedFile ? `(${formatFileSize(selectedFile.size)})` : ""}
            </span>
            <span className="text-xs text-gray-500 tabular-nums">{Math.round(progress)}%</span>
          </div>
          <div className="h-1.5 w-full rounded-full bg-gray-200 overflow-hidden">
            <div
              className="h-full rounded-full bg-gray-600 transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      )}

      {!isUploaded && !isUploading && (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="flex w-full items-center gap-2 rounded-md border border-dashed border-gray-300 bg-gray-50/50 px-3 py-3 text-sm text-gray-500 transition-colors hover:border-gray-400 hover:bg-gray-50 hover:text-gray-600"
        >
          <Upload className="h-4 w-4 shrink-0" />
          <span>Upload Registration Certificate — JPG, PNG, WebP, or PDF (max 10 MB)</span>
        </button>
      )}

      {localError && (
        <div className="flex items-center gap-1.5 text-xs text-red-600">
          <AlertCircle className="h-3 w-3 shrink-0" />
          {localError}
        </div>
      )}
    </div>
  );
}
