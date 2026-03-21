"use client";

import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  getPlatformSetting,
  updatePlatformSetting,
  getPlatformFees,
  updatePlatformFees,
  type PlatformFees,
} from "@/lib/api/admin-settings";
import { queryKeys } from "@/lib/query/keys";
import { Save, Loader2, Percent } from "lucide-react";

export default function AdminSettingsPage() {
  return (
    <div className="px-4 pb-6 sm:px-6">
      <PageHeader
        title="Platform Settings"
        description="Configure platform-wide settings"
      />

      <div className="mt-4 max-w-2xl space-y-6">
        <CompanyIdentityCard />
        <PlatformFeesCard />
      </div>
    </div>
  );
}

// ─── Company Identity ────────────────────────────────────────────────

function CompanyIdentityCard() {
  const queryClient = useQueryClient();
  const [consignerName, setConsignerName] = useState("");
  const [phone, setPhone] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: queryKeys.platformSetting("company_identity"),
    queryFn: () => getPlatformSetting("company_identity"),
  });

  useEffect(() => {
    if (data?.value) {
      setConsignerName((data.value.name as string) ?? (data.value.consigner_name as string) ?? "Airavat Logistics");
      const raw = (data.value.phone as string) ?? "";
      setPhone(raw.replace(/^91/, ""));
    }
  }, [data]);

  const digits = phone.replace(/\D/g, "");
  const isValid =
    consignerName.trim().length >= 2 &&
    (digits.length === 0 || (digits.length === 10 && /^[6-9]/.test(digits)));

  const updateMutation = useMutation({
    mutationFn: () =>
      updatePlatformSetting("company_identity", {
        name: consignerName.trim(),
        phone: digits.length === 10 ? "91" + digits : "",
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["platform-settings"] });
      setSuccess("Settings saved successfully");
      setError("");
      setTimeout(() => setSuccess(""), 3000);
    },
    onError: (err) => {
      setError(err instanceof Error ? err.message : "Failed to save settings");
      setSuccess("");
    },
  });

  const handleSave = () => {
    if (!isValid) return;
    setError("");
    setSuccess("");
    updateMutation.mutate();
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="p-4 sm:p-6">
        <div className="space-y-5">
          <div>
            <h3 className="text-sm font-semibold text-gray-900 mb-1">
              Airavatl Company Identity
            </h3>
            <p className="text-xs text-gray-500">
              This is the company name and phone number shown to drivers in the partner app when
              they see ERP-created delivery request auctions.
            </p>
          </div>

          {error && (
            <div className="rounded-md bg-red-50 p-3">
              <p className="text-sm text-red-700">{error}</p>
            </div>
          )}

          {success && (
            <div className="rounded-md bg-green-50 p-3">
              <p className="text-sm text-green-700">{success}</p>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="consignerName" className="text-sm font-medium">
                Company Name <span className="text-red-500">*</span>
              </Label>
              <Input
                id="consignerName"
                placeholder="e.g. Airavatl"
                value={consignerName}
                onChange={(e) => setConsignerName(e.target.value.slice(0, 100))}
                className="h-9 text-sm"
                maxLength={100}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="phone" className="text-sm font-medium">
                Phone Number <span className="text-gray-400 text-xs font-normal">(optional)</span>
              </Label>
              <div className="flex items-center gap-1.5">
                <span className="text-sm text-gray-500 shrink-0">+91</span>
                <Input
                  id="phone"
                  placeholder="9876543210"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value.replace(/\D/g, "").slice(0, 10))}
                  className="h-9 text-sm"
                  inputMode="tel"
                  maxLength={10}
                />
              </div>
              <p className="text-[11px] text-gray-400">
                10-digit mobile number (without country code)
              </p>
            </div>
          </div>

          <div className="flex justify-end pt-2">
            <Button
              onClick={handleSave}
              disabled={!isValid || updateMutation.isPending}
              className="h-9 text-sm"
            >
              {updateMutation.isPending ? (
                <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
              ) : (
                <Save className="h-4 w-4 mr-1.5" />
              )}
              Save Changes
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Platform Fees ───────────────────────────────────────────────────

const FEE_FIELDS = [
  {
    key: "commission_percentage",
    label: "App Commission/Expected Commission",
    description: "Suggested markup on driver bid. Used to calculate the expected trip amount shown to operations",
    suffix: "%",
  },
  {
    key: "minimum_commission_percentage",
    label: "Minimum Commission",
    description: "Lowest allowed markup on driver bid. Operations must enter a trip amount at least this % above the bid",
    suffix: "%",
  },
  {
    key: "gst_percentage",
    label: "GST on Commission",
    description: "GST percentage applied on the platform commission amount",
    suffix: "%",
  },
  {
    key: "advance_percentage",
    label: "Driver Advance",
    description: "Default advance payment percentage the driver receives after loading",
    suffix: "%",
  },
] as const;

function PlatformFeesCard() {
  const queryClient = useQueryClient();
  const [values, setValues] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: queryKeys.platformFees,
    queryFn: getPlatformFees,
  });

  useEffect(() => {
    if (data) {
      const initial: Record<string, string> = {};
      for (const field of FEE_FIELDS) {
        initial[field.key] = String(data[field.key]?.value ?? "");
      }
      setValues(initial);
    }
  }, [data]);

  const hasChanges = data
    ? FEE_FIELDS.some(
        (f) => values[f.key] !== String(data[f.key]?.value ?? ""),
      )
    : false;

  const isValid = FEE_FIELDS.every((f) => {
    const v = Number(values[f.key]);
    if (!Number.isFinite(v) || v < 0) return false;
    const bounds = data?.[f.key];
    if (bounds && (v < bounds.min || v > bounds.max)) return false;
    return true;
  });

  const updateMutation = useMutation({
    mutationFn: () => {
      const settings = FEE_FIELDS.map((f) => ({
        key: f.key,
        value: Number(values[f.key]),
      }));
      return updatePlatformFees(settings);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.platformFees });
      setSuccess("Platform fees updated successfully");
      setError("");
      setTimeout(() => setSuccess(""), 3000);
    },
    onError: (err) => {
      setError(err instanceof Error ? err.message : "Failed to update platform fees");
      setSuccess("");
    },
  });

  const handleSave = () => {
    if (!isValid || !hasChanges) return;
    setError("");
    setSuccess("");
    updateMutation.mutate();
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="p-4 sm:p-6">
        <div className="space-y-5">
          <div className="flex items-center gap-2">
            <Percent className="h-4 w-4 text-gray-500" />
            <div>
              <h3 className="text-sm font-semibold text-gray-900">
                Platform Fees & Advance
              </h3>
              <p className="text-xs text-gray-500">
                Commission, GST, and driver advance percentages used by both the app and ERP.
              </p>
            </div>
          </div>

          {error && (
            <div className="rounded-md bg-red-50 p-3">
              <p className="text-sm text-red-700">{error}</p>
            </div>
          )}

          {success && (
            <div className="rounded-md bg-green-50 p-3">
              <p className="text-sm text-green-700">{success}</p>
            </div>
          )}

          <div className="space-y-4">
            {FEE_FIELDS.map((field) => {
              const bounds = data?.[field.key];
              const currentValue = values[field.key] ?? "";
              const numValue = Number(currentValue);
              const outOfRange =
                currentValue !== "" &&
                bounds &&
                Number.isFinite(numValue) &&
                (numValue < bounds.min || numValue > bounds.max);

              return (
                <div key={field.key} className="space-y-1.5">
                  <Label htmlFor={field.key} className="text-sm font-medium">
                    {field.label}
                  </Label>
                  <div className="flex items-center gap-2">
                    <Input
                      id={field.key}
                      type="number"
                      inputMode="decimal"
                      step="0.1"
                      min={bounds?.min ?? 0}
                      max={bounds?.max ?? 100}
                      value={currentValue}
                      onChange={(e) =>
                        setValues((prev) => ({
                          ...prev,
                          [field.key]: e.target.value,
                        }))
                      }
                      className="h-9 text-sm w-32"
                    />
                    <span className="text-sm text-gray-500">{field.suffix}</span>
                  </div>
                  <p className="text-[11px] text-gray-400">
                    {field.description}
                    {bounds
                      ? ` (${bounds.min}–${bounds.max}%)`
                      : ""}
                  </p>
                  {outOfRange && (
                    <p className="text-[11px] text-red-500">
                      Must be between {bounds!.min} and {bounds!.max}
                    </p>
                  )}
                </div>
              );
            })}
          </div>

          <div className="flex justify-end pt-2">
            <Button
              onClick={handleSave}
              disabled={!isValid || !hasChanges || updateMutation.isPending}
              className="h-9 text-sm"
            >
              {updateMutation.isPending ? (
                <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
              ) : (
                <Save className="h-4 w-4 mr-1.5" />
              )}
              Save Changes
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
