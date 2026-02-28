export type UploadImagePreset = "proof_image" | "qr_image" | "payment_image";

interface ImagePresetConfig {
  maxLongEdge: number;
  quality: number;
  outputType: "image/webp" | "image/jpeg";
  minSavingsBytes: number;
}

export interface OptimizedUploadFile {
  file: File;
  optimized: boolean;
  originalSizeBytes: number;
  outputSizeBytes: number;
}

const IMAGE_PRESETS: Record<UploadImagePreset, ImagePresetConfig> = {
  proof_image: {
    maxLongEdge: 1280,
    quality: 0.72,
    outputType: "image/webp",
    minSavingsBytes: 8 * 1024,
  },
  qr_image: {
    maxLongEdge: 1024,
    quality: 0.9,
    outputType: "image/webp",
    minSavingsBytes: 4 * 1024,
  },
  payment_image: {
    maxLongEdge: 1600,
    quality: 0.78,
    outputType: "image/webp",
    minSavingsBytes: 10 * 1024,
  },
};

function isImageFile(file: File): boolean {
  return file.type.startsWith("image/");
}

function extFromMime(mimeType: string): string {
  if (mimeType === "image/webp") return "webp";
  if (mimeType === "image/jpeg") return "jpg";
  return "bin";
}

function replaceFileExt(fileName: string, ext: string): string {
  const dot = fileName.lastIndexOf(".");
  if (dot <= 0) return `${fileName}.${ext}`;
  return `${fileName.slice(0, dot)}.${ext}`;
}

function fileToImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Unable to decode image for optimization"));
    };
    image.src = url;
  });
}

function canvasToBlob(
  canvas: HTMLCanvasElement,
  mimeType: string,
  quality: number,
): Promise<Blob | null> {
  return new Promise((resolve) => {
    canvas.toBlob(
      (blob) => resolve(blob),
      mimeType,
      quality,
    );
  });
}

export async function optimizeUploadFile(
  file: File,
  preset: UploadImagePreset,
): Promise<OptimizedUploadFile> {
  if (typeof window === "undefined" || !isImageFile(file)) {
    return {
      file,
      optimized: false,
      originalSizeBytes: file.size,
      outputSizeBytes: file.size,
    };
  }

  const config = IMAGE_PRESETS[preset];

  try {
    const image = await fileToImage(file);
    const width = image.naturalWidth || image.width;
    const height = image.naturalHeight || image.height;
    const longEdge = Math.max(width, height);
    const scale = longEdge > config.maxLongEdge ? config.maxLongEdge / longEdge : 1;
    const outWidth = Math.max(1, Math.round(width * scale));
    const outHeight = Math.max(1, Math.round(height * scale));

    const canvas = document.createElement("canvas");
    canvas.width = outWidth;
    canvas.height = outHeight;

    const ctx = canvas.getContext("2d");
    if (!ctx) {
      return {
        file,
        optimized: false,
        originalSizeBytes: file.size,
        outputSizeBytes: file.size,
      };
    }

    ctx.drawImage(image, 0, 0, outWidth, outHeight);
    const blob = await canvasToBlob(canvas, config.outputType, config.quality);
    if (!blob || blob.size <= 0) {
      return {
        file,
        optimized: false,
        originalSizeBytes: file.size,
        outputSizeBytes: file.size,
      };
    }

    const savings = file.size - blob.size;
    const resized = outWidth !== width || outHeight !== height;
    if (!resized && savings < config.minSavingsBytes) {
      return {
        file,
        optimized: false,
        originalSizeBytes: file.size,
        outputSizeBytes: file.size,
      };
    }

    const mimeType = blob.type || config.outputType;
    const ext = extFromMime(mimeType);
    const optimizedFile = new File(
      [blob],
      replaceFileExt(file.name, ext),
      { type: mimeType, lastModified: Date.now() },
    );

    return {
      file: optimizedFile,
      optimized: true,
      originalSizeBytes: file.size,
      outputSizeBytes: optimizedFile.size,
    };
  } catch {
    return {
      file,
      optimized: false,
      originalSizeBytes: file.size,
      outputSizeBytes: file.size,
    };
  }
}
