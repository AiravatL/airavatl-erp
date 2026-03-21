"use client";

import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { prepareAndUploadSingleFile } from "@/lib/uploads/workflow";
import { queryKeys } from "@/lib/query/keys";
import type { ReceivableCollectionProofSummary } from "@/lib/api/receivables";
import { CheckCircle, Loader2, RefreshCw, Upload } from "lucide-react";

const MAX_FILE_SIZE = 15 * 1024 * 1024;
const ALLOWED_MIME_TYPES = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "application/pdf",
]);
const ALLOWED_EXTENSIONS = new Set(["jpg", "jpeg", "png", "webp", "pdf"]);

interface Props {
  queryKey: readonly unknown[];
  uploadLabel?: string;
  uploadQueryFn: () => Promise<ReceivableCollectionProofSummary>;
  prepareUpload: (input: {
    fileName: string;
    mimeType: string;
    fileSizeBytes: number;
  }) => Promise<{ uploadUrl: string; objectKey: string; expiresIn: number | null }>;
  confirmUpload: (input: {
    objectKey: string;
    fileName: string;
    mimeType: string;
    fileSizeBytes: number;
  }) => Promise<{ objectKey: string; uploadedAt: string | null; status: string | null }>;
  onSummaryChange?: (summary: ReceivableCollectionProofSummary | undefined) => void;
}

export function CollectionProofUpload({
  queryKey,
  uploadLabel = "Payment proof",
  uploadQueryFn,
  prepareUpload,
  confirmUpload,
  onSummaryChange,
}: Props) {
  const queryClient = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const uploadedThisSessionRef = useRef(false);

  const proofQuery = useQuery({
    queryKey,
    queryFn: uploadQueryFn,
    staleTime: 0,
    gcTime: 0,
  });

  const uploadMutation = useMutation({
    mutationFn: async (nextFile: File) => {
      const uploaded = await prepareAndUploadSingleFile({
        file: nextFile,
        imagePreset: "payment_image",
        prepare: prepareUpload,
        confirm: confirmUpload,
        onProgress: setUploadProgress,
      });
      return uploaded;
    },
    onSuccess: (result) => {
      setUploadProgress(0);
      setLocalError(null);
      uploadedThisSessionRef.current = true;
      queryClient.setQueryData(queryKey, {
        status: "uploaded",
        objectKey: result.objectKey,
        fileName: result.fileName,
        mimeType: result.mimeType,
        fileSizeBytes: result.fileSizeBytes,
        uploadedAt: new Date().toISOString(),
        attachedAt: null,
        source: "draft",
      } satisfies ReceivableCollectionProofSummary);
    },
    onError: (error) => {
      setUploadProgress(0);
      setLocalError(error instanceof Error ? error.message : "Unable to upload payment proof");
    },
  });

  const uploadSummary = proofQuery.data;
  const isUploading = uploadMutation.isPending;
  const hasUploadedProof =
    uploadedThisSessionRef.current &&
    !!uploadSummary?.objectKey &&
    (uploadSummary.status === "uploaded" || uploadSummary.status === "attached");

  useEffect(() => {
    // Only propagate proof to parent if uploaded in this session (not stale drafts)
    if (uploadedThisSessionRef.current) {
      onSummaryChange?.(uploadSummary);
    } else {
      onSummaryChange?.(undefined);
    }
  }, [onSummaryChange, uploadSummary]);

  function handleFileChange(nextFile: File | null) {
    setLocalError(null);

    if (!nextFile) {
      setFile(null);
      return;
    }

    if (nextFile.size <= 0 || nextFile.size > MAX_FILE_SIZE) {
      setLocalError("File size must be between 1 byte and 15 MB");
      setFile(null);
      return;
    }

    const mimeType = nextFile.type.toLowerCase();
    const fileExt = nextFile.name.split(".").pop()?.toLowerCase() ?? "";
    if (!ALLOWED_MIME_TYPES.has(mimeType) || !ALLOWED_EXTENSIONS.has(fileExt)) {
      setLocalError("Payment proof must be JPG, PNG, WEBP, or PDF");
      setFile(null);
      return;
    }

    setFile(nextFile);
    uploadMutation.mutate(nextFile);
  }

  function handleReplace() {
    if (isUploading) return;
    setLocalError(null);
    setUploadProgress(0);
    setFile(null);
    inputRef.current?.click();
  }

  return (
    <div className="space-y-2">
      <div className="space-y-1">
        <label className="text-xs text-gray-600">{uploadLabel} *</label>
        <Input
          ref={inputRef}
          type="file"
          accept=".jpg,.jpeg,.png,.webp,.pdf,image/*,application/pdf"
          onChange={(event) => handleFileChange(event.target.files?.[0] ?? null)}
          className="h-9 text-sm"
          disabled={isUploading}
        />
        <p className="text-[11px] text-gray-500">Required. JPG, PNG, WEBP, or PDF up to 15 MB.</p>
      </div>

      {hasUploadedProof && !isUploading && (
        <div className="flex items-center gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2">
          <CheckCircle className="h-4 w-4 shrink-0 text-emerald-600" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-medium text-emerald-800">
              {file?.name ?? uploadSummary?.fileName ?? "Payment proof uploaded"}
            </p>
            <p className="text-[11px] text-emerald-700">
              {uploadSummary?.fileSizeBytes
                ? `${Math.ceil(uploadSummary.fileSizeBytes / 1024)} KB`
                : file
                  ? `${Math.ceil(file.size / 1024)} KB`
                  : "Ready to record"}
            </p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs text-emerald-700 hover:text-emerald-800"
            onClick={handleReplace}
          >
            <RefreshCw className="mr-1 h-3 w-3" />
            Replace
          </Button>
        </div>
      )}

      {isUploading && (
        <div className="space-y-1">
          <Progress value={uploadProgress} />
          <p className="text-[11px] text-gray-500">Uploading {uploadProgress}%</p>
        </div>
      )}

      {proofQuery.isLoading && !proofQuery.data && (
        <div className="flex items-center gap-2 text-xs text-gray-500">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Checking existing uploaded proof...
        </div>
      )}

      {proofQuery.isError && (
        <p className="text-sm text-red-600">
          {proofQuery.error instanceof Error ? proofQuery.error.message : "Unable to load payment proof state"}
        </p>
      )}

      {localError && <p className="text-sm text-red-600">{localError}</p>}
    </div>
  );
}

export function hasReceivableCollectionProof(
  summary: ReceivableCollectionProofSummary | undefined,
) {
  return !!summary?.objectKey && (summary.status === "uploaded" || summary.status === "attached");
}
