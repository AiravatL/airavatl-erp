"use client";

import { Card, CardContent } from "@/components/ui/card";
import { SignedImagePreview } from "@/components/shared/signed-image-preview";
import type { TripLoadingProofItem } from "@/lib/api/trips";
import { FileCheck, Loader2 } from "lucide-react";

interface ProofViewCardProps {
  title: string;
  proofs: TripLoadingProofItem[];
  isLoading: boolean;
}

export function ProofViewCard({ title, proofs, isLoading }: ProofViewCardProps) {
  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center gap-2 p-4 text-sm text-gray-500">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading proofs...
        </CardContent>
      </Card>
    );
  }

  if (proofs.length === 0) return null;

  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center gap-2 mb-3">
          <FileCheck className="h-4 w-4 text-gray-500" />
          <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
        </div>
        <div className="space-y-1">
          {proofs.map((proof) => (
            <SignedImagePreview
              key={proof.id}
              objectKey={proof.objectKey}
              label={proof.fileName || `${title} file`}
            />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
