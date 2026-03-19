"use client";

import { useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import {
  confirmVerificationUpload,
  prepareVerificationUpload,
} from "@/lib/api/verification";
import type { VerificationUploadSummary } from "@/lib/types";
import { prepareAndUploadSingleFile } from "@/lib/uploads/workflow";
import { Upload, CheckCircle, AlertCircle, Loader2, RefreshCw } from "lucide-react";

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB
const ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/webp", "application/pdf"];

interface DocumentUploadProps {
  label: string;
  docType: string;
  userId: string;
  required?: boolean;
  objectKey: string | null;
  uploadSummary?: VerificationUploadSummary | null;
  disabled?: boolean;
  onUploaded: (objectKey: string) => void;
}

function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function DocumentUpload({
  label,
  docType,
  userId,
  required,
  objectKey,
  uploadSummary,
  disabled,
  onUploaded,
}: DocumentUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [progress, setProgress] = useState(0);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);

  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      return prepareAndUploadSingleFile({
        file,
        prepare: async (payload) => {
          const result = await prepareVerificationUpload(userId, {
            docType,
            fileName: payload.fileName,
            mimeType: payload.mimeType,
          });
          return { uploadUrl: result.uploadUrl, objectKey: result.objectKey };
        },
        confirm: async (payload) => {
          await confirmVerificationUpload(userId, {
            docType,
            objectKey: payload.objectKey,
            fileName: payload.fileName,
            mimeType: payload.mimeType,
            fileSizeBytes: payload.fileSizeBytes,
          });
        },
        onProgress: (pct) => setProgress(pct),
      });
    },
    onSuccess: (result) => {
      onUploaded(result.objectKey);
      setProgress(100);
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

    if (!ACCEPTED_TYPES.includes(file.type)) {
      setLocalError("File must be JPG, PNG, WebP, or PDF");
      setSelectedFile(null);
      return;
    }
    if (file.size > MAX_FILE_SIZE) {
      setLocalError("File must be less than 10 MB");
      setSelectedFile(null);
      return;
    }

    setSelectedFile(file);
    uploadMutation.mutate(file);
  };

  const handleReplace = () => {
    if (disabled) return;
    setLocalError(null);
    setProgress(0);
    setSelectedFile(null);
    inputRef.current?.click();
  };

  const isUploading = uploadMutation.isPending;
  const isUploaded = !!objectKey;

  return (
    <div className="space-y-1.5">
      <label className="text-sm font-medium text-gray-700">
        {label}
        {required && <span className="text-red-500 ml-0.5">*</span>}
      </label>

      <input
        ref={inputRef}
        type="file"
        accept=".jpg,.jpeg,.png,.webp,.pdf"
        onChange={handleFileChange}
        className="hidden"
        disabled={isUploading || disabled}
      />

      {/* Uploaded state */}
      {isUploaded && !isUploading && (
        <div className="flex items-center gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2">
          <CheckCircle className="h-4 w-4 text-emerald-600 shrink-0" />
          <span className="text-sm text-emerald-700 truncate flex-1">
            {selectedFile?.name ?? "Document uploaded"}
            {!selectedFile && uploadSummary?.fileName ? ` (${uploadSummary.fileName})` : ""}
            {selectedFile ? ` (${formatFileSize(selectedFile.size)})` : ""}
          </span>
          {!disabled && (
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
          )}
        </div>
      )}

      {/* Uploading state */}
      {isUploading && (
        <div className="rounded-md border border-gray-200 bg-gray-50 px-3 py-2 space-y-1.5">
          <div className="flex items-center gap-2">
            <Loader2 className="h-4 w-4 text-gray-500 animate-spin shrink-0" />
            <span className="text-sm text-gray-600 truncate flex-1">
              {selectedFile?.name ?? "Uploading..."}{" "}
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

      {/* Empty state */}
      {!isUploaded && !isUploading && (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="flex w-full items-center gap-2 rounded-md border border-dashed border-gray-300 bg-gray-50/50 px-3 py-3 text-sm text-gray-500 transition-colors hover:border-gray-400 hover:bg-gray-50 hover:text-gray-600 disabled:pointer-events-none disabled:opacity-60"
          disabled={disabled}
        >
          <Upload className="h-4 w-4 shrink-0" />
          <span>Choose file &mdash; JPG, PNG, WebP, or PDF (max 10 MB)</span>
        </button>
      )}

      {/* Error state */}
      {localError && (
        <div className="flex items-center gap-1.5 text-xs text-red-600">
          <AlertCircle className="h-3 w-3 shrink-0" />
          {localError}
        </div>
      )}
    </div>
  );
}
