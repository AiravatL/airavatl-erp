"use client";

import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  previewBroadcast,
  sendBroadcast,
  type BroadcastAudience,
} from "@/lib/api/admin-broadcast";
import { Bell, Loader2, Send, Users, AlertTriangle } from "lucide-react";

const TITLE_MAX = 65;
const MESSAGE_MAX = 240;

const AUDIENCES: { value: BroadcastAudience; label: string; hint: string }[] = [
  { value: "consigners", label: "Consigners", hint: "People who ship" },
  { value: "partners", label: "Partners", hint: "Drivers & transporters" },
  { value: "all", label: "Everyone", hint: "Both apps" },
];

export function BroadcastComposer() {
  const [audience, setAudience] = useState<BroadcastAudience>("consigners");
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [testPhone, setTestPhone] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState("");

  const { data: preview, isLoading: previewLoading } = useQuery({
    queryKey: ["admin", "broadcast", "preview", audience],
    queryFn: () => previewBroadcast(audience),
    staleTime: 60_000,
  });

  const canSend = title.trim().length > 0 && message.trim().length > 0;

  const sendMutation = useMutation({
    mutationFn: (opts: { isTest: boolean }) =>
      sendBroadcast({
        audience,
        title: title.trim(),
        message: message.trim(),
        testPhone: opts.isTest ? testPhone.trim() : null,
      }),
    onSuccess: (data) => {
      setError("");
      setConfirming(false);
      setResult(
        data.isTest
          ? `Test sent to ${testPhone}. Check the handset.`
          : `Queued for ${data.queued} ${data.queued === 1 ? "person" : "people"}. ` +
            `Delivery takes about ${data.estimatedMinutes} minute${data.estimatedMinutes === 1 ? "" : "s"}.`,
      );
      if (!data.isTest) {
        setTitle("");
        setMessage("");
      }
    },
    onError: (err: Error) => {
      setConfirming(false);
      setResult("");
      setError(err.message);
    },
  });

  return (
    <Card>
      <CardContent className="space-y-5 p-4 sm:p-6">
        {/* Audience */}
        <div className="space-y-2">
          <Label className="text-sm font-medium">Send to</Label>
          <div className="grid grid-cols-3 gap-2">
            {AUDIENCES.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => {
                  setAudience(option.value);
                  setConfirming(false);
                }}
                className={
                  "rounded-lg border p-3 text-left transition-colors " +
                  (audience === option.value
                    ? "border-gray-900 bg-gray-50"
                    : "border-gray-200 hover:bg-gray-50")
                }
              >
                <p className="text-sm font-semibold text-gray-900">{option.label}</p>
                <p className="text-[11px] text-gray-500">{option.hint}</p>
              </button>
            ))}
          </div>

          {/* Reach is the number that matters, and it is always lower than the
              headcount — a signed-up user with no push token cannot be told
              anything. Showing both stops "31" reading as "all consigners". */}
          <div className="flex items-center gap-2 rounded-md bg-gray-50 px-3 py-2 text-xs text-gray-600">
            <Users className="h-3.5 w-3.5" />
            {previewLoading || !preview ? (
              <span>Checking reach…</span>
            ) : (
              <span>
                Reaches <strong className="text-gray-900">{preview.reachable}</strong> of{" "}
                {preview.total}
                {preview.noToken > 0 && (
                  <> · {preview.noToken} have no notifications enabled</>
                )}
              </span>
            )}
          </div>
        </div>

        {/* Copy */}
        <div className="space-y-1.5">
          <div className="flex items-baseline justify-between">
            <Label htmlFor="title" className="text-sm font-medium">
              Title
            </Label>
            <span className="text-[11px] text-gray-400">
              {title.length}/{TITLE_MAX}
            </span>
          </div>
          <Input
            id="title"
            value={title}
            onChange={(e) => setTitle(e.target.value.slice(0, TITLE_MAX))}
            maxLength={TITLE_MAX}
            placeholder="Trucks are waiting 🚚"
            className="h-9 text-sm"
          />
        </div>

        <div className="space-y-1.5">
          <div className="flex items-baseline justify-between">
            <Label htmlFor="message" className="text-sm font-medium">
              Message
            </Label>
            <span className="text-[11px] text-gray-400">
              {message.length}/{MESSAGE_MAX}
            </span>
          </div>
          <textarea
            id="message"
            value={message}
            onChange={(e) => setMessage(e.target.value.slice(0, MESSAGE_MAX))}
            maxLength={MESSAGE_MAX}
            rows={3}
            placeholder="Post your load before 6 PM and get bids the same evening."
            className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm outline-none focus:border-gray-400"
          />
        </div>

        <NotificationPreview title={title} message={message} />

        {/* Test send — check the copy on a real handset before it is
            unrecallable. */}
        <div className="space-y-1.5 rounded-lg border border-gray-200 bg-gray-50/60 p-3">
          <Label htmlFor="testPhone" className="text-xs font-medium text-gray-700">
            Send a test first
          </Label>
          <div className="flex gap-2">
            <Input
              id="testPhone"
              value={testPhone}
              onChange={(e) => setTestPhone(e.target.value.replace(/\D/g, "").slice(0, 12))}
              placeholder="9876543210"
              className="h-9 flex-1 text-sm"
              inputMode="numeric"
            />
            <Button
              variant="outline"
              className="h-9 text-sm"
              disabled={!canSend || testPhone.trim().length < 10 || sendMutation.isPending}
              onClick={() => sendMutation.mutate({ isTest: true })}
            >
              {sendMutation.isPending && sendMutation.variables?.isTest ? (
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
              ) : (
                <Bell className="mr-1.5 h-4 w-4" />
              )}
              Test
            </Button>
          </div>
          <p className="text-[11px] text-gray-500">
            Any app user&apos;s number. Ignores the audience above.
          </p>
        </div>

        {error && (
          <div className="rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</div>
        )}
        {result && (
          <div className="rounded-md bg-emerald-50 p-3 text-sm text-emerald-800">{result}</div>
        )}

        {/* Two-step send. There is no recall once these are in the outbox. */}
        {confirming ? (
          <div className="space-y-3 rounded-lg border border-amber-200 bg-amber-50 p-3">
            <div className="flex gap-2">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
              <p className="text-sm text-amber-900">
                This sends to <strong>{preview?.reachable ?? 0}</strong>{" "}
                {audience === "all" ? "app users" : audience}. It cannot be undone or
                recalled.
              </p>
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                className="h-9 flex-1 text-sm"
                onClick={() => setConfirming(false)}
                disabled={sendMutation.isPending}
              >
                Back
              </Button>
              <Button
                className="h-9 flex-1 bg-gray-900 text-sm hover:bg-gray-800"
                onClick={() => sendMutation.mutate({ isTest: false })}
                disabled={sendMutation.isPending}
              >
                {sendMutation.isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
                Yes, send now
              </Button>
            </div>
          </div>
        ) : (
          <Button
            className="h-10 w-full bg-gray-900 text-sm hover:bg-gray-800"
            disabled={!canSend || !preview?.reachable}
            onClick={() => {
              setError("");
              setResult("");
              setConfirming(true);
            }}
          >
            <Send className="mr-1.5 h-4 w-4" />
            Send to {preview?.reachable ?? 0}{" "}
            {preview?.reachable === 1 ? "person" : "people"}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

/** Approximate handset rendering, so copy is judged at the size users see it. */
function NotificationPreview({ title, message }: { title: string; message: string }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-sm font-medium">Preview</Label>
      <div className="rounded-xl bg-gray-100 p-3">
        <div className="rounded-lg bg-white p-3 shadow-sm">
          <div className="flex items-center gap-2">
            <div className="flex h-5 w-5 items-center justify-center rounded bg-gray-900">
              <Bell className="h-3 w-3 text-white" />
            </div>
            <span className="text-[11px] font-medium text-gray-500">AiravatL · now</span>
          </div>
          <p className="mt-1.5 line-clamp-1 text-sm font-semibold text-gray-900">
            {title || "Title goes here"}
          </p>
          <p className="line-clamp-2 text-xs text-gray-600">
            {message || "Message goes here"}
          </p>
        </div>
      </div>
    </div>
  );
}
