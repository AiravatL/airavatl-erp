import { optimizeUploadFile, type UploadImagePreset } from "@/lib/uploads/optimize";
import { uploadFileToPresignedUrl } from "@/lib/uploads/transfer";

interface PreparedUploadPayload {
  uploadUrl: string;
  objectKey: string;
}

interface UploadFileInfo {
  fileName: string;
  mimeType: string;
  fileSizeBytes: number;
}

type PreparePayload = UploadFileInfo;
interface ConfirmPayload extends UploadFileInfo {
  objectKey: string;
}

interface PrepareAndUploadSingleFileParams {
  file: File;
  imagePreset?: UploadImagePreset;
  prepare: (payload: PreparePayload) => Promise<PreparedUploadPayload>;
  confirm?: (payload: ConfirmPayload) => Promise<unknown>;
  onProgress?: (progressPercent: number) => void;
}

export interface UploadedFileResult {
  objectKey: string;
  fileName: string;
  mimeType: string;
  fileSizeBytes: number;
  optimized: boolean;
  originalSizeBytes: number;
}

export async function prepareAndUploadSingleFile(
  params: PrepareAndUploadSingleFileParams,
): Promise<UploadedFileResult> {
  params.onProgress?.(0);

  const optimized = params.imagePreset
    ? await optimizeUploadFile(params.file, params.imagePreset)
    : {
        file: params.file,
        optimized: false,
        originalSizeBytes: params.file.size,
        outputSizeBytes: params.file.size,
      };

  const mimeType = optimized.file.type || "application/octet-stream";
  const prepared = await params.prepare({
    fileName: optimized.file.name,
    mimeType,
    fileSizeBytes: optimized.file.size,
  });

  await uploadFileToPresignedUrl(
    prepared.uploadUrl,
    optimized.file,
    mimeType,
    { onProgress: params.onProgress },
  );

  if (params.confirm) {
    await params.confirm({
      objectKey: prepared.objectKey,
      fileName: optimized.file.name,
      mimeType,
      fileSizeBytes: optimized.file.size,
    });
  }

  return {
    objectKey: prepared.objectKey,
    fileName: optimized.file.name,
    mimeType,
    fileSizeBytes: optimized.file.size,
    optimized: optimized.optimized,
    originalSizeBytes: optimized.originalSizeBytes,
  };
}
