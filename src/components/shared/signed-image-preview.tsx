"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { getPaymentObjectViewUrl } from "@/lib/api/payments";
import { apiRequest } from "@/lib/api/http";
import { Eye, Loader2 } from "lucide-react";

function objectKeyExtension(objectKey: string): string {
  const clean = objectKey.split("?")[0] ?? objectKey;
  const ext = clean.split(".").pop() ?? "";
  return ext.toLowerCase();
}

function isPdfObjectKey(objectKey: string): boolean {
  return objectKeyExtension(objectKey) === "pdf";
}

async function getTripProofViewUrl(objectKey: string): Promise<{ viewUrl: string; expiresIn: number | null }> {
  return apiRequest<{ viewUrl: string; expiresIn: number | null }>("/api/trips/proof-view-url", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ objectKey }),
  });
}

export function SignedImagePreview({
  objectKey,
  label,
  source = "payment",
}: {
  objectKey: string;
  label: string;
  /** "payment" uses the payment-specific endpoint, "trip" uses the general trip proof endpoint */
  source?: "payment" | "trip";
}) {
  const [show, setShow] = useState(false);

  const fetchFn = source === "trip" ? getTripProofViewUrl : getPaymentObjectViewUrl;

  const previewQuery = useQuery({
    queryKey: ["object-view", source, objectKey],
    queryFn: () => fetchFn(objectKey),
    enabled: show,
    staleTime: 4 * 60_000,
    gcTime: 15 * 60_000,
  });
  const isPdf = isPdfObjectKey(objectKey);

  return (
    <>
      <Button
        size="sm"
        variant="outline"
        className="h-7 px-2 text-[11px] shrink-0"
        onClick={() => setShow(true)}
        disabled={previewQuery.isLoading}
      >
        {previewQuery.isLoading ? (
          <Loader2 className="h-3 w-3 animate-spin" />
        ) : (
          <Eye className="h-3 w-3" />
        )}
        <span className="ml-1">View</span>
      </Button>

      <Dialog open={show} onOpenChange={setShow}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="text-base">{label}</DialogTitle>
          </DialogHeader>

          {previewQuery.isLoading && (
            <div className="flex h-56 items-center justify-center text-sm text-gray-500">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Loading preview...
            </div>
          )}

          {previewQuery.isError && (
            <p className="text-sm text-red-600">
              {previewQuery.error instanceof Error
                ? previewQuery.error.message
                : "Unable to load preview"}
            </p>
          )}

          {previewQuery.data?.viewUrl && !isPdf && (
            <div className="max-h-[70vh] overflow-auto rounded-md border border-gray-200 bg-gray-50 p-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={previewQuery.data.viewUrl}
                alt={label}
                className="mx-auto h-auto max-h-[64vh] w-auto rounded"
              />
            </div>
          )}

          {previewQuery.data?.viewUrl && isPdf && (
            <div className="space-y-2">
              <div className="h-[68vh] overflow-hidden rounded-md border border-gray-200 bg-gray-50">
                <iframe
                  src={previewQuery.data.viewUrl}
                  title={label}
                  className="h-full w-full"
                />
              </div>
              <div className="flex justify-end">
                <Button
                  asChild
                  size="sm"
                  variant="outline"
                  className="h-8 text-xs"
                >
                  <a
                    href={previewQuery.data.viewUrl}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Open in new tab
                  </a>
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
