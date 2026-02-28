interface UploadToPresignedUrlOptions {
  timeoutMs?: number;
  maxAttempts?: number;
  onProgress?: (progressPercent: number) => void;
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function backoffDelayMs(attempt: number): number {
  const base = attempt <= 1 ? 500 : 1500;
  const jitter = Math.floor(Math.random() * 250);
  return base + jitter;
}

function putOnce(params: {
  uploadUrl: string;
  file: Blob;
  mimeType: string;
  timeoutMs: number;
  onProgress?: (progressPercent: number) => void;
}): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", params.uploadUrl);
    xhr.timeout = params.timeoutMs;
    xhr.setRequestHeader("Content-Type", params.mimeType);

    xhr.upload.onprogress = (event) => {
      if (!event.lengthComputable) return;
      const progress = Math.min(100, Math.max(0, Math.round((event.loaded / event.total) * 100)));
      params.onProgress?.(progress);
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        params.onProgress?.(100);
        resolve();
        return;
      }
      reject(new Error(`Upload failed (status ${xhr.status})`));
    };

    xhr.onerror = () => reject(new Error("Upload failed due to network error"));
    xhr.onabort = () => reject(new Error("Upload aborted"));
    xhr.ontimeout = () => reject(new Error("Upload timed out"));

    xhr.send(params.file);
  });
}

export async function uploadFileToPresignedUrl(
  uploadUrl: string,
  file: Blob,
  mimeType: string,
  options: UploadToPresignedUrlOptions = {},
): Promise<void> {
  const timeoutMs = options.timeoutMs ?? 60_000;
  const maxAttempts = Math.max(1, options.maxAttempts ?? 3);

  let lastError: Error | null = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      await putOnce({
        uploadUrl,
        file,
        mimeType,
        timeoutMs,
        onProgress: options.onProgress,
      });
      return;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error("Upload failed");
      if (attempt < maxAttempts) {
        await wait(backoffDelayMs(attempt));
      }
    }
  }

  throw lastError ?? new Error("Upload failed");
}
