"use client";

/**
 * Side-by-side document viewer for the verification screen.
 *
 * Ops read a number off a document and type it into the form. A modal made that
 * a loop — open, memorise, close, type, reopen to check the next digit. This
 * puts the document in the left column's empty space instead, sticky, so the
 * document and the field it feeds are on screen together.
 *
 * DocumentUpload falls back to the modal preview when no provider is mounted,
 * so the other verification screens keep working unchanged.
 */

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { apiRequest } from "@/lib/api/http";
import { FileText, Loader2, X, ExternalLink } from "lucide-react";

export interface PreviewDoc {
  objectKey: string;
  label: string;
  mimeType: string | null;
}

interface DocumentPreviewValue {
  active: PreviewDoc | null;
  open: (doc: PreviewDoc) => void;
  close: () => void;
  /** False when no provider is mounted — callers fall back to the modal. */
  available: boolean;
}

const DocumentPreviewContext = createContext<DocumentPreviewValue>({
  active: null,
  open: () => {},
  close: () => {},
  available: false,
});

export function DocumentPreviewProvider({ children }: { children: ReactNode }) {
  const [active, setActive] = useState<PreviewDoc | null>(null);

  const value = useMemo<DocumentPreviewValue>(
    () => ({
      active,
      open: (doc) => setActive(doc),
      close: () => setActive(null),
      available: true,
    }),
    [active],
  );

  return (
    <DocumentPreviewContext.Provider value={value}>
      {children}
    </DocumentPreviewContext.Provider>
  );
}

export function useDocumentPreview() {
  return useContext(DocumentPreviewContext);
}

function objectKeyExtension(objectKey: string): string {
  const clean = objectKey.split("?")[0] ?? objectKey;
  const lastSegment = clean.split("/").pop() ?? "";
  if (!lastSegment.includes(".")) return "";
  return (lastSegment.split(".").pop() ?? "").toLowerCase();
}

// The verification slot key ends in `/active` with no extension, so the mimeType
// recorded at upload is the only reliable signal. Without it a PDF would render
// in an <img> and show as broken.
function isPdf(objectKey: string, mimeType?: string | null): boolean {
  if (mimeType && mimeType.toLowerCase() === "application/pdf") return true;
  return objectKeyExtension(objectKey) === "pdf";
}

async function getVerificationViewUrl(objectKey: string) {
  return apiRequest<{ viewUrl: string; expiresIn: number | null }>(
    "/api/verification/object-view-url",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ objectKey }),
    },
  );
}

export function DocumentPreviewPanel() {
  const { active, close } = useDocumentPreview();

  const previewQuery = useQuery({
    queryKey: ["object-view", "verification", active?.objectKey],
    queryFn: () => getVerificationViewUrl(active!.objectKey),
    enabled: !!active?.objectKey,
    staleTime: 4 * 60_000,
    gcTime: 15 * 60_000,
  });

  if (!active) {
    return (
      <div className="hidden lg:flex lg:sticky lg:top-4 flex-col items-center justify-center rounded-lg border border-dashed border-gray-200 bg-gray-50/60 px-4 py-10 text-center">
        <FileText className="h-6 w-6 text-gray-300" />
        <p className="mt-2 text-xs text-gray-400">
          Click <span className="font-medium text-gray-500">View</span> on a
          document to show it here while you type.
        </p>
      </div>
    );
  }

  const pdf = isPdf(active.objectKey, active.mimeType);

  return (
    <div className="lg:sticky lg:top-4 rounded-lg border border-gray-200 bg-white shadow-sm overflow-hidden">
      <div className="flex items-center gap-2 border-b border-gray-100 px-3 py-2">
        <span className="flex-1 truncate text-xs font-semibold text-gray-800">
          {active.label}
        </span>
        {previewQuery.data?.viewUrl && (
          <a
            href={previewQuery.data.viewUrl}
            target="_blank"
            rel="noreferrer"
            className="text-gray-400 hover:text-gray-600"
            title="Open full size in a new tab"
          >
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
        )}
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-6 w-6 p-0 text-gray-400 hover:text-gray-600"
          onClick={close}
          title="Close preview"
        >
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>

      {previewQuery.isLoading && (
        <div className="flex h-64 items-center justify-center text-xs text-gray-500">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          Loading…
        </div>
      )}

      {previewQuery.isError && (
        <p className="px-3 py-6 text-xs text-red-600">
          {previewQuery.error instanceof Error
            ? previewQuery.error.message
            : "Unable to load preview"}
        </p>
      )}

      {previewQuery.data?.viewUrl && !pdf && (
        // Scrollable + zoomable rather than fit-to-box: a licence number is
        // often the smallest text on the card.
        <div className="max-h-[70vh] overflow-auto bg-gray-50">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={previewQuery.data.viewUrl}
            alt={active.label}
            className="w-full h-auto"
          />
        </div>
      )}

      {previewQuery.data?.viewUrl && pdf && (
        <iframe
          src={previewQuery.data.viewUrl}
          title={active.label}
          className="h-[70vh] w-full bg-gray-50"
        />
      )}
    </div>
  );
}
