"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { Download, Share, X } from "lucide-react";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const DISMISS_KEY = "erp-install-dismissed";

const subscribe = () => () => {};
/** false during SSR / first paint, true once on the client — no hydration mismatch. */
function useIsClient() {
  return useSyncExternalStore(subscribe, () => true, () => false);
}

function isStandalone() {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (window.navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

function isIos() {
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

function storedDismissed() {
  try {
    return localStorage.getItem(DISMISS_KEY) === "1";
  } catch {
    return false;
  }
}

/**
 * Mobile-only top banner prompting the user to install the ERP to their home
 * screen, so they don't have to open the browser each time. Uses the native
 * `beforeinstallprompt` flow on Android/Chrome and shows Share-sheet
 * instructions on iOS. Dismissal is remembered in localStorage.
 */
export function InstallPrompt() {
  const isClient = useIsClient();
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    const onBeforeInstall = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      setDismissed(true);
      try {
        localStorage.setItem(DISMISS_KEY, "1");
      } catch {
        /* ignore */
      }
    };
    window.addEventListener("beforeinstallprompt", onBeforeInstall);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstall);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  if (!isClient || dismissed || isStandalone() || storedDismissed()) return null;

  const ios = isIos();
  // Android/desktop: only surface once the browser says it's installable.
  if (!ios && !deferred) return null;

  const dismiss = () => {
    setDismissed(true);
    try {
      localStorage.setItem(DISMISS_KEY, "1");
    } catch {
      /* ignore */
    }
  };

  const install = async () => {
    if (!deferred) return;
    await deferred.prompt();
    await deferred.userChoice;
    setDeferred(null);
    dismiss();
  };

  return (
    <div className="flex items-center gap-3 border-b border-violet-200 bg-violet-50 px-3 py-2 md:hidden">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-violet-600 text-white">
        <Download className="h-4 w-4" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-semibold text-violet-900">Install AiravatL ERP</p>
        {ios ? (
          <p className="flex items-center gap-1 truncate text-[11px] text-violet-700">
            Tap <Share className="inline h-3 w-3" /> then “Add to Home Screen”
          </p>
        ) : (
          <p className="truncate text-[11px] text-violet-700">
            Add to your home screen for one-tap access
          </p>
        )}
      </div>
      {!ios && (
        <button
          onClick={install}
          className="shrink-0 rounded-md bg-violet-600 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-violet-700"
        >
          Install
        </button>
      )}
      <button
        onClick={dismiss}
        aria-label="Dismiss install prompt"
        className="shrink-0 rounded-md p-1 text-violet-500 hover:bg-violet-100 hover:text-violet-800"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
