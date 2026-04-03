"use client";

import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { getPlatformSetting, updatePlatformSetting } from "@/lib/api/admin-settings";
import { queryKeys } from "@/lib/query/keys";
import { Save, Loader2, Smartphone, Truck } from "lucide-react";

interface AppVersionConfig {
  current_version: string;
  minimum_version: string;
  update_url_android: string;
  update_url_ios: string;
  update_message: string;
  force_update_message: string;
}

const DEFAULT_CONFIG: AppVersionConfig = {
  current_version: "1.0.0",
  minimum_version: "1.0.0",
  update_url_android: "",
  update_url_ios: "",
  update_message: "A new version is available with improvements and bug fixes.",
  force_update_message: "This update is required to continue using the app. Please update now.",
};

function AppVersionCard({ appKey, label, icon: Icon }: { appKey: string; label: string; icon: typeof Truck }) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<AppVersionConfig>(DEFAULT_CONFIG);
  const [success, setSuccess] = useState("");
  const [error, setError] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: queryKeys.platformSetting(appKey),
    queryFn: () => getPlatformSetting(appKey),
  });

  useEffect(() => {
    if (data?.value) {
      setForm({
        current_version: (data.value.current_version as string) ?? "1.0.0",
        minimum_version: (data.value.minimum_version as string) ?? "1.0.0",
        update_url_android: (data.value.update_url_android as string) ?? "",
        update_url_ios: (data.value.update_url_ios as string) ?? "",
        update_message: (data.value.update_message as string) ?? DEFAULT_CONFIG.update_message,
        force_update_message: (data.value.force_update_message as string) ?? DEFAULT_CONFIG.force_update_message,
      });
    }
  }, [data]);

  const saveMutation = useMutation({
    mutationFn: () => updatePlatformSetting(appKey, form as unknown as Record<string, unknown>),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["platform-settings"] });
      setSuccess("Saved. Changes take effect immediately for all app users.");
      setError("");
      setTimeout(() => setSuccess(""), 4000);
    },
    onError: (err) => {
      setError(err instanceof Error ? err.message : "Failed to save");
      setSuccess("");
    },
  });

  const versionRegex = /^\d+\.\d+\.\d+$/;
  const isValid = versionRegex.test(form.current_version) && versionRegex.test(form.minimum_version);

  if (isLoading) {
    return <Card><CardContent className="flex items-center justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-gray-400" /></CardContent></Card>;
  }

  return (
    <Card>
      <CardContent className="p-4 sm:p-6 space-y-4">
        <div className="flex items-center gap-2">
          <Icon className="h-4 w-4 text-gray-500" />
          <h3 className="text-sm font-semibold text-gray-900">{label}</h3>
        </div>

        {error && <div className="rounded-md bg-red-50 p-3"><p className="text-sm text-red-700">{error}</p></div>}
        {success && <div className="rounded-md bg-green-50 p-3"><p className="text-sm text-green-700">{success}</p></div>}

        {/* Version fields */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label className="text-sm font-medium">
              Current Version <Badge variant="outline" className="border-0 text-[9px] bg-blue-50 text-blue-700 ml-1">optional update</Badge>
            </Label>
            <Input className="h-9 text-sm font-mono" value={form.current_version} placeholder="1.2.0"
              onChange={(e) => setForm(p => ({ ...p, current_version: e.target.value }))} />
            <p className="text-[11px] text-gray-400">Users with older versions see "Update Available" (dismissible)</p>
          </div>
          <div className="space-y-1.5">
            <Label className="text-sm font-medium">
              Minimum Version <Badge variant="outline" className="border-0 text-[9px] bg-red-50 text-red-700 ml-1">forced update</Badge>
            </Label>
            <Input className="h-9 text-sm font-mono" value={form.minimum_version} placeholder="1.0.0"
              onChange={(e) => setForm(p => ({ ...p, minimum_version: e.target.value }))} />
            <p className="text-[11px] text-gray-400">Users below this MUST update. No dismiss button.</p>
          </div>
        </div>

        {/* Store URLs */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label className="text-sm font-medium">Play Store URL (Android)</Label>
            <Input className="h-9 text-sm" value={form.update_url_android} placeholder="https://play.google.com/store/..."
              onChange={(e) => setForm(p => ({ ...p, update_url_android: e.target.value }))} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-sm font-medium">App Store URL (iOS)</Label>
            <Input className="h-9 text-sm" value={form.update_url_ios} placeholder="https://apps.apple.com/..."
              onChange={(e) => setForm(p => ({ ...p, update_url_ios: e.target.value }))} />
          </div>
        </div>

        {/* Messages */}
        <div className="space-y-1.5">
          <Label className="text-sm font-medium">Optional Update Message</Label>
          <Textarea className="text-sm resize-none" rows={2} value={form.update_message}
            onChange={(e) => setForm(p => ({ ...p, update_message: e.target.value }))} maxLength={200} />
        </div>
        <div className="space-y-1.5">
          <Label className="text-sm font-medium">Forced Update Message</Label>
          <Textarea className="text-sm resize-none" rows={2} value={form.force_update_message}
            onChange={(e) => setForm(p => ({ ...p, force_update_message: e.target.value }))} maxLength={200} />
        </div>

        <div className="flex justify-end pt-2">
          <Button onClick={() => saveMutation.mutate()} disabled={!isValid || saveMutation.isPending} className="h-9 text-sm">
            {saveMutation.isPending ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Save className="h-4 w-4 mr-1.5" />}
            Save Changes
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export default function AppUpdatesPage() {
  return (
    <div className="px-4 pb-6 sm:px-6 space-y-4">
      <PageHeader title="App Update Control" description="Control app version requirements for Partner and Consigner apps" />

      <div className="rounded-md bg-amber-50 border border-amber-200 p-3">
        <p className="text-xs text-amber-800">
          <strong>How it works:</strong> Apps check version on launch. If installed version {"<"} minimum → forced update (no dismiss).
          If installed version {"<"} current but {">="} minimum → optional update (can dismiss).
          Changes take effect immediately.
        </p>
      </div>

      <div className="max-w-2xl space-y-4">
        <AppVersionCard appKey="app_version_partner" label="Partner App (Drivers)" icon={Truck} />
        <AppVersionCard appKey="app_version_consigner" label="Consigner App" icon={Smartphone} />
      </div>
    </div>
  );
}
