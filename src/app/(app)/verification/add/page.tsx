"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createPartner } from "@/lib/api/verification";
import { ArrowLeft, Loader2, UserPlus } from "lucide-react";
import Link from "next/link";

type PartnerRole = "individual_driver" | "transporter";

const PHONE_REGEX = /^[0-9]{10}$/;

export default function AddPartnerPage() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [form, setForm] = useState({
    fullName: "",
    phone: "",
    role: "individual_driver" as PartnerRole,
    organizationName: "",
  });

  const isValid =
    form.fullName.trim().length > 0 &&
    PHONE_REGEX.test(form.phone) &&
    (form.role !== "transporter" || form.organizationName.trim().length > 0);

  const createMutation = useMutation({
    mutationFn: () =>
      createPartner({
        fullName: form.fullName.trim(),
        phone: form.phone,
        role: form.role,
        organizationName: form.role === "transporter" ? form.organizationName.trim() : undefined,
      }),
    onSuccess: (data) => {
      router.push(`/verification/${data.userId}`);
    },
    onError: (err) => {
      setError(err instanceof Error ? err.message : "Failed to create partner");
    },
  });

  const handleSubmit = () => {
    if (!isValid) return;
    setError("");
    createMutation.mutate();
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-sm">
        <Link href="/verification" className="flex items-center gap-1 text-gray-500 hover:text-gray-700">
          <ArrowLeft className="h-4 w-4" />
          Back to Pending
        </Link>
      </div>

      <PageHeader
        title="Add New Partner"
        description="Create a partner account and proceed to verification."
      />

      <Card className="max-w-lg">
        <CardContent className="p-4 sm:p-6">
          <div className="space-y-5">
            {error && (
              <div className="rounded-md bg-red-50 p-3">
                <p className="text-sm text-red-700">{error}</p>
              </div>
            )}

            {/* Full Name */}
            <div className="space-y-1.5">
              <Label htmlFor="fullName" className="text-sm font-medium">
                Full Name <span className="text-red-500">*</span>
              </Label>
              <Input
                id="fullName"
                placeholder="e.g. Rajesh Kumar"
                value={form.fullName}
                onChange={(e) => setForm((p) => ({ ...p, fullName: e.target.value.slice(0, 100) }))}
                className="h-9 text-sm"
                maxLength={100}
              />
            </div>

            {/* Phone */}
            <div className="space-y-1.5">
              <Label htmlFor="phone" className="text-sm font-medium">
                Phone Number <span className="text-red-500">*</span>
              </Label>
              <div className="flex gap-2">
                <div className="flex h-9 items-center rounded-md border border-gray-200 bg-gray-50 px-3 text-sm text-gray-500">
                  +91
                </div>
                <Input
                  id="phone"
                  type="tel"
                  inputMode="numeric"
                  placeholder="9876543210"
                  value={form.phone}
                  onChange={(e) => {
                    const digits = e.target.value.replace(/\D/g, "").slice(0, 10);
                    setForm((p) => ({ ...p, phone: digits }));
                  }}
                  className="h-9 text-sm flex-1"
                  maxLength={10}
                />
              </div>
              <p className="text-[11px] text-gray-500">10-digit mobile number</p>
            </div>

            {/* Role */}
            <div className="space-y-1.5">
              <Label className="text-sm font-medium">
                Role <span className="text-red-500">*</span>
              </Label>
              <div className="space-y-2">
                <label className="flex items-start gap-3 rounded-md border border-gray-200 p-3 cursor-pointer hover:bg-gray-50 transition-colors has-[:checked]:border-gray-900 has-[:checked]:bg-gray-50">
                  <input
                    type="radio"
                    name="role"
                    value="individual_driver"
                    checked={form.role === "individual_driver"}
                    onChange={() => setForm((p) => ({ ...p, role: "individual_driver" }))}
                    className="mt-0.5"
                  />
                  <div>
                    <p className="text-sm font-medium text-gray-900">Individual Driver</p>
                    <p className="text-xs text-gray-500">Independent driver with own vehicle</p>
                  </div>
                </label>
                <label className="flex items-start gap-3 rounded-md border border-gray-200 p-3 cursor-pointer hover:bg-gray-50 transition-colors has-[:checked]:border-gray-900 has-[:checked]:bg-gray-50">
                  <input
                    type="radio"
                    name="role"
                    value="transporter"
                    checked={form.role === "transporter"}
                    onChange={() => setForm((p) => ({ ...p, role: "transporter" }))}
                    className="mt-0.5"
                  />
                  <div>
                    <p className="text-sm font-medium text-gray-900">Transporter</p>
                    <p className="text-xs text-gray-500">Transport company with multiple vehicles</p>
                  </div>
                </label>
              </div>
            </div>

            {/* Organization Name (transporter only) */}
            {form.role === "transporter" && (
              <div className="space-y-1.5">
                <Label htmlFor="orgName" className="text-sm font-medium">
                  Organization Name <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="orgName"
                  placeholder="e.g. Rajesh Transport Co."
                  value={form.organizationName}
                  onChange={(e) => setForm((p) => ({ ...p, organizationName: e.target.value.slice(0, 150) }))}
                  className="h-9 text-sm"
                  maxLength={150}
                />
              </div>
            )}

            {/* Actions */}
            <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 pt-2">
              <Button
                variant="outline"
                onClick={() => router.push("/verification")}
                className="h-9 text-sm"
                disabled={createMutation.isPending}
              >
                Cancel
              </Button>
              <Button
                onClick={handleSubmit}
                disabled={!isValid || createMutation.isPending}
                className="h-9 text-sm"
              >
                {createMutation.isPending ? (
                  <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                ) : (
                  <UserPlus className="h-4 w-4 mr-1.5" />
                )}
                Create &amp; Verify
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
