import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/empty-state";
import { formatDate } from "@/lib/formatters";
import type { TripLoadingProofItem } from "@/lib/api/trips";
import { FileText, Upload } from "lucide-react";

interface Props {
  proofs: TripLoadingProofItem[];
  isLoading: boolean;
  canUploadLoadingProof: boolean;
  canUploadPodProof: boolean;
  onUploadLoadingProof: () => void;
  onUploadPodProof: () => void;
}

export function DocsTab({
  proofs,
  isLoading,
  canUploadLoadingProof,
  canUploadPodProof,
  onUploadLoadingProof,
  onUploadPodProof,
}: Props) {
  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-4 text-sm text-gray-500">Loading proof documents...</CardContent>
      </Card>
    );
  }

  if (proofs.length === 0) {
    return (
      <EmptyState
        icon={FileText}
        title="No trip proof uploaded"
        description="Upload optional loading proof or POD for this trip."
        action={
          canUploadLoadingProof || canUploadPodProof ? (
            <div className="flex items-center gap-2">
              {canUploadLoadingProof && (
                <Button size="sm" className="h-8 gap-1 text-xs" onClick={onUploadLoadingProof}>
                  <Upload className="h-3.5 w-3.5" />
                  Upload Loading Proof
                </Button>
              )}
              {canUploadPodProof && (
                <Button size="sm" variant="outline" className="h-8 gap-1 text-xs" onClick={onUploadPodProof}>
                  <Upload className="h-3.5 w-3.5" />
                  Upload POD
                </Button>
              )}
            </div>
          ) : undefined
        }
      />
    );
  }

  return (
    <div className="space-y-2">
      {(canUploadLoadingProof || canUploadPodProof) && (
        <div className="flex justify-end">
          <div className="flex items-center gap-2">
            {canUploadLoadingProof && (
              <Button size="sm" className="h-8 gap-1 text-xs" onClick={onUploadLoadingProof}>
                <Upload className="h-3.5 w-3.5" />
                Upload Loading Proof
              </Button>
            )}
            {canUploadPodProof && (
              <Button size="sm" variant="outline" className="h-8 gap-1 text-xs" onClick={onUploadPodProof}>
                <Upload className="h-3.5 w-3.5" />
                Upload POD
              </Button>
            )}
          </div>
        </div>
      )}

      {proofs.map((proof) => (
        <Card key={proof.id}>
          <CardContent className="p-3">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-sm font-medium text-gray-900 truncate">{proof.fileName}</p>
                <p className="text-xs text-gray-500">
                  {proof.mimeType} • {Math.ceil(proof.fileSizeBytes / 1024)} KB
                </p>
              </div>
              <span className="rounded border border-gray-200 px-1.5 py-0.5 text-[10px] text-gray-600 uppercase">
                {proof.proofType}
              </span>
            </div>
            <div className="mt-2 text-[11px] text-gray-400">
              Uploaded by {proof.uploadedByName || "Unknown"} on {formatDate(proof.createdAt)}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
