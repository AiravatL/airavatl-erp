"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Eye, EyeOff, Save } from "lucide-react";
import type { Role } from "@/lib/types";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { NumericInput } from "@/components/ui/numeric-input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const FULL_NAME_MAX_LENGTH = 100;
const EMAIL_MAX_LENGTH = 254;
const PASSWORD_MIN_LENGTH = 8;
const PASSWORD_MAX_LENGTH = 72;
const NOTES_MAX_LENGTH = 500;
// E.164 caps a phone number at 15 digits. The field holds digits only now, so
// there is no separator or leading "+" to leave room for.
const WHATSAPP_MAX_DIGITS = 15;

export interface UserUpsertFormValues {
  fullName: string;
  email: string;
  role: Role;
  password: string;
  active: boolean;
  /**
   * Optional, and blank is a real answer: it means this user gets no WhatsApp
   * notifications. Stored normalised (country code, digits only) — the server
   * accepts whatever shape it is typed in.
   */
  whatsappNumber: string;
}

/**
 * Mirrors erp.normalize_whatsapp_number_v1 so the form can flag an obviously
 * wrong number before a round-trip. The server still validates — this is a
 * convenience, not the boundary.
 */
function looksLikeWhatsappNumber(value: string): boolean {
  const digits = value.replace(/[^0-9]/g, "");
  if (digits.length === 0) return false;
  if (/^[6-9][0-9]{9}$/.test(digits)) return true;
  if (/^0[6-9][0-9]{9}$/.test(digits)) return true;
  return /^[1-9][0-9]{10,14}$/.test(digits);
}

interface UserUpsertFormProps {
  mode: "create" | "edit";
  title: string;
  description: string;
  roleOptions: Array<{ value: Role; label: string }>;
  initialValues: UserUpsertFormValues;
  onSubmit: (values: UserUpsertFormValues) => Promise<string>;
  backHref?: string;
}

export function UserUpsertForm({
  mode,
  title,
  description,
  roleOptions,
  initialValues,
  onSubmit,
  backHref = "/admin/users",
}: UserUpsertFormProps) {
  const router = useRouter();
  const [form, setForm] = useState<UserUpsertFormValues>(initialValues);
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    setForm(initialValues);
  }, [initialValues]);

  // Blank is fine; only a non-empty value that cannot be a number blocks submit.
  const whatsappInvalid =
    form.whatsappNumber.trim().length > 0 && !looksLikeWhatsappNumber(form.whatsappNumber);

  const canSubmit = useMemo(() => {
    const hasBaseFields =
      form.fullName.trim().length > 1 &&
      form.fullName.trim().length <= FULL_NAME_MAX_LENGTH &&
      form.email.trim().length > 3 &&
      form.email.trim().length <= EMAIL_MAX_LENGTH &&
      !(
        form.whatsappNumber.trim().length > 0 &&
        !looksLikeWhatsappNumber(form.whatsappNumber)
      );
    if (mode === "create") {
      return hasBaseFields && form.password.length >= PASSWORD_MIN_LENGTH && form.password.length <= PASSWORD_MAX_LENGTH;
    }
    if (form.password.trim().length > 0) {
      return hasBaseFields && form.password.length >= PASSWORD_MIN_LENGTH && form.password.length <= PASSWORD_MAX_LENGTH;
    }
    return hasBaseFields;
  }, [form, mode]);

  function updateField<K extends keyof UserUpsertFormValues>(
    key: K,
    value: UserUpsertFormValues[K],
  ) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!canSubmit || submitting) return;

    setSubmitting(true);
    setError(null);
    setSuccess(null);

    try {
      const successMessage = await onSubmit(form);
      setSuccess(successMessage);
      setTimeout(() => {
        router.push(backHref);
      }, 700);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Unable to submit user form");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="p-4 sm:p-6 space-y-4">
      <PageHeader title={title} description={description}>
        <Button
          variant="outline"
          size="sm"
          className="h-8 text-xs gap-1.5"
          onClick={() => router.push(backHref)}
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back
        </Button>
      </PageHeader>

      <Card className="max-w-2xl">
        <CardContent className="p-4 sm:p-6">
          <form className="space-y-4" onSubmit={handleSubmit}>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="full_name" className="text-sm font-medium">
                  Full Name <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="full_name"
                  value={form.fullName}
                  onChange={(event) => updateField("fullName", event.target.value)}
                  placeholder="e.g. Priya Sharma"
                  className="h-9 text-sm"
                  maxLength={FULL_NAME_MAX_LENGTH}
                  required
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="email" className="text-sm font-medium">
                  Email <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="email"
                  type="email"
                  value={form.email}
                  onChange={(event) => updateField("email", event.target.value)}
                  placeholder="name@airavatl.com"
                  className={`h-9 text-sm ${
                    mode === "edit" ? "bg-gray-50 text-gray-600" : ""
                  }`}
                  required
                  autoCapitalize="none"
                  spellCheck={false}
                  autoComplete="email"
                  maxLength={EMAIL_MAX_LENGTH}
                  // readOnly rather than disabled: the address is the sign-in
                  // identity and cannot change here (the API always saves the
                  // stored one), but ops still need to select and copy it.
                  readOnly={mode === "edit"}
                />
                {mode === "edit" && (
                  <p className="text-xs text-gray-500">
                    Sign-in address — cannot be changed after the user is created.
                  </p>
                )}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="role" className="text-sm font-medium">
                  Role <span className="text-red-500">*</span>
                </Label>
                <Select value={form.role} onValueChange={(value) => updateField("role", value as Role)}>
                  <SelectTrigger id="role" className="h-9 w-full text-sm">
                    <SelectValue placeholder="Select role" />
                  </SelectTrigger>
                  <SelectContent>
                    {roleOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="whatsapp_number" className="text-sm font-medium">
                  WhatsApp Number{" "}
                  <span className="font-normal text-gray-400">(optional)</span>
                </Label>
                <NumericInput
                  id="whatsapp_number"
                  value={form.whatsappNumber}
                  onValueChange={(digits) => updateField("whatsappNumber", digits)}
                  placeholder="e.g. 9876543210"
                  className="h-9 text-sm"
                  maxDigits={WHATSAPP_MAX_DIGITS}
                  // "tel", not "off": Chrome ignores "off" on a form that holds
                  // a password, and would drop the saved username — an email —
                  // into whichever fillable field it found first, which was
                  // this one. A specific token gives it the right answer.
                  autoComplete="tel"
                  aria-invalid={whatsappInvalid}
                />
                {whatsappInvalid ? (
                  <p className="text-xs text-red-600">
                    Enter a 10-digit mobile number, or include the country code.
                  </p>
                ) : (
                  <p className="text-xs text-gray-500">
                    Used for WhatsApp notifications. Leave blank to send none.
                    Indian numbers get +91 added automatically.
                  </p>
                )}
              </div>

              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="password" className="text-sm font-medium">
                  {mode === "create" ? (
                    <>
                      Temporary Password <span className="text-red-500">*</span>
                    </>
                  ) : (
                    "New Password (optional)"
                  )}
                </Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    value={form.password}
                    onChange={(event) => updateField("password", event.target.value)}
                    placeholder={mode === "create" ? "Minimum 8 characters" : "Leave blank to keep existing password"}
                    className="h-9 text-sm pr-9"
                    minLength={PASSWORD_MIN_LENGTH}
                    maxLength={PASSWORD_MAX_LENGTH}
                    required={mode === "create"}
                    // Marks this as a set-a-password form, not a sign-in one, so
                    // the browser stops hunting for a username field to fill and
                    // never offers the admin's own saved credentials here.
                    autoComplete="new-password"
                  />
                  <button
                    type="button"
                    aria-label={showPassword ? "Hide password" : "Show password"}
                    onClick={() => setShowPassword((prev) => !prev)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  >
                    {showPassword ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </button>
                </div>
                {mode === "edit" && (
                  <p className="text-xs text-gray-500">
                    Existing password cannot be viewed. Enter a new one only if you want to reset it.
                  </p>
                )}
              </div>

              {mode === "create" && (
                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor="notes" className="text-sm font-medium">
                    Onboarding Notes (optional)
                  </Label>
                  <Textarea
                    id="notes"
                    value={notes}
                    onChange={(event) => setNotes(event.target.value)}
                    placeholder="Optional internal note for onboarding handoff"
                    rows={3}
                    maxLength={NOTES_MAX_LENGTH}
                    className="text-sm resize-none"
                  />
                  <p className="text-[11px] text-gray-500 text-right">
                    {notes.length}/{NOTES_MAX_LENGTH}
                  </p>
                </div>
              )}
            </div>

            <div className="flex items-center justify-between rounded-md border border-gray-200 p-3">
              <div>
                <p className="text-sm font-medium text-gray-900">User Status</p>
                <p className="text-xs text-gray-500">
                  Inactive users cannot sign in until reactivated.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-500">{form.active ? "Active" : "Inactive"}</span>
                <Switch checked={form.active} onCheckedChange={(checked) => updateField("active", checked)} />
              </div>
            </div>

            {error && (
              <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-md">{error}</p>
            )}
            {success && (
              <p className="text-sm text-emerald-700 bg-emerald-50 px-3 py-2 rounded-md">{success}</p>
            )}

            <div className="flex justify-end">
              <Button type="submit" className="h-9 text-sm gap-1.5" disabled={!canSubmit || submitting}>
                <Save className="h-4 w-4" />
                {submitting
                  ? mode === "create"
                    ? "Creating..."
                    : "Saving..."
                  : mode === "create"
                    ? "Create User"
                    : "Save Changes"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
