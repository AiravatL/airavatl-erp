"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import {
  confirmTripLoadingProofUpload,
  prepareTripLoadingProofUpload,
} from "@/lib/api/trips";
import { prepareAndUploadSingleFile } from "@/lib/uploads/workflow";
import { Loader2, Upload } from "lucide-react";

interface Props {
  tripId: string;
  onClose: () => void;
  onSuccess: () => void;
}

const MAX_FILE_SIZE = 15 * 1024 * 1024;

export function LoadingProofUploadDialog({ tripId, onClose, onSuccess }: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState<number>(0);

  const uploadMutation = useMutation({
    mutationFn: async () => {
      if (!file) {
        throw new Error("Select a file to upload");
      }

      await prepareAndUploadSingleFile({
        file,
        imagePreset: "proof_image",
        prepare: (payload) => prepareTripLoadingProofUpload(tripId, payload),
        confirm: (payload) => confirmTripLoadingProofUpload(tripId, payload),
        onProgress: setUploadProgress,
      });
    },
    onSuccess: () => {
      setUploadProgress(0);
      onSuccess();
    },
    onError: () => {
      setUploadProgress(0);
    },
  });

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

    setFile(nextFile);
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-base">Upload Loading Proof</DialogTitle>
        </DialogHeader>

        <div className="space-y-3 py-2">
          <div className="space-y-1">
            <Label className="text-xs text-gray-600">File (image/pdf)</Label>
            <Input
              type="file"
              accept=".jpg,.jpeg,.png,.webp,.pdf,image/*,application/pdf"
              onChange={(event) => handleFileChange(event.target.files?.[0] ?? null)}
              className="h-9 text-sm"
            />
            <p className="text-[11px] text-gray-500">Maximum file size: 15 MB</p>
          </div>

          {file && (
            <div className="rounded-md border border-gray-200 p-2">
              <p className="text-xs text-gray-700 truncate">{file.name}</p>
              <p className="text-[11px] text-gray-500">{Math.ceil(file.size / 1024)} KB</p>
            </div>
          )}

          {localError && <p className="text-sm text-red-600">{localError}</p>}
          {uploadMutation.isPending && (
            <div className="space-y-1">
              <Progress value={uploadProgress} />
              <p className="text-[11px] text-gray-500">Uploading {uploadProgress}%</p>
            </div>
          )}
          {uploadMutation.isError && (
            <p className="text-sm text-red-600">
              {uploadMutation.error instanceof Error
                ? uploadMutation.error.message
                : "Unable to upload loading proof"}
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" size="sm" className="h-8 text-xs" onClick={onClose}>
            Cancel
          </Button>
          <Button
            size="sm"
            className="h-8 text-xs"
            onClick={() => uploadMutation.mutate()}
            disabled={!file || uploadMutation.isPending}
          >
            {uploadMutation.isPending ? (
              <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
            ) : (
              <Upload className="mr-1 h-3.5 w-3.5" />
            )}
            Upload
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
