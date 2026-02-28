"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { useAuth } from "@/lib/auth/auth-context";
import { Loader2, Eye, EyeOff } from "lucide-react";

const EMAIL_MAX_LENGTH = 254;
const PASSWORD_MIN_LENGTH = 8;
const PASSWORD_MAX_LENGTH = 72;
const LOGIN_FAILURE_COUNT_KEY = "airavat_login_failure_count";
const LOGIN_COOLDOWN_UNTIL_KEY = "airavat_login_cooldown_until_ms";
const COOLDOWN_SEQUENCE_SECONDS = [0, 2, 4, 8, 16, 30];
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function getCooldownSeconds(failureCount: number): number {
  const safeIndex = Math.max(0, Math.min(failureCount, COOLDOWN_SEQUENCE_SECONDS.length - 1));
  return COOLDOWN_SEQUENCE_SECONDS[safeIndex] ?? 0;
}

export default function LoginPage() {
  const router = useRouter();
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [cooldownUntilMs, setCooldownUntilMs] = useState(0);
  const [nowMs, setNowMs] = useState(() => Date.now());

  const cooldownRemainingSeconds = useMemo(
    () => Math.max(0, Math.ceil((cooldownUntilMs - nowMs) / 1000)),
    [cooldownUntilMs, nowMs],
  );
  const cooldownActive = cooldownRemainingSeconds > 0;

  useEffect(() => {
    if (typeof window === "undefined") return;
    const storedCooldown = Number(window.sessionStorage.getItem(LOGIN_COOLDOWN_UNTIL_KEY) ?? "0");
    if (Number.isFinite(storedCooldown) && storedCooldown > Date.now()) {
      setCooldownUntilMs(storedCooldown);
      setNowMs(Date.now());
    }
  }, []);

  useEffect(() => {
    if (!cooldownActive) return;
    const timer = window.setInterval(() => {
      setNowMs(Date.now());
    }, 1000);
    return () => {
      window.clearInterval(timer);
    };
  }, [cooldownActive]);

  function clearFailureState() {
    if (typeof window === "undefined") return;
    window.sessionStorage.removeItem(LOGIN_FAILURE_COUNT_KEY);
    window.sessionStorage.removeItem(LOGIN_COOLDOWN_UNTIL_KEY);
    setCooldownUntilMs(0);
    setNowMs(Date.now());
  }

  function registerFailedAttempt() {
    if (typeof window === "undefined") return;

    const previous = Number(window.sessionStorage.getItem(LOGIN_FAILURE_COUNT_KEY) ?? "0");
    const nextCount = Number.isFinite(previous) ? previous + 1 : 1;
    const cooldownSeconds = getCooldownSeconds(nextCount);
    const nextCooldownUntil = Date.now() + cooldownSeconds * 1000;

    window.sessionStorage.setItem(LOGIN_FAILURE_COUNT_KEY, String(nextCount));
    window.sessionStorage.setItem(LOGIN_COOLDOWN_UNTIL_KEY, String(nextCooldownUntil));
    setCooldownUntilMs(nextCooldownUntil);
    setNowMs(Date.now());
  }

  function validateLoginInput(normalizedEmail: string, rawPassword: string): string | null {
    if (!normalizedEmail || !rawPassword) {
      return "Email and password are required.";
    }
    if (normalizedEmail.length > EMAIL_MAX_LENGTH) {
      return `Email must be at most ${EMAIL_MAX_LENGTH} characters.`;
    }
    if (!EMAIL_REGEX.test(normalizedEmail)) {
      return "Enter a valid email address.";
    }
    if (rawPassword.length < PASSWORD_MIN_LENGTH) {
      return `Password must be at least ${PASSWORD_MIN_LENGTH} characters.`;
    }
    if (rawPassword.length > PASSWORD_MAX_LENGTH) {
      return `Password must be at most ${PASSWORD_MAX_LENGTH} characters.`;
    }
    return null;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading || cooldownActive) return;

    const normalizedEmail = email.trim().toLowerCase();
    const validationError = validateLoginInput(normalizedEmail, password);
    if (validationError) {
      setError(validationError);
      return;
    }

    setError(null);
    setLoading(true);

    try {
      const result = await login(normalizedEmail, password);

      if (!result.ok) {
        registerFailedAttempt();
        setError("Invalid email or password.");
        return;
      }

      clearFailureState();
      router.push("/dashboard");
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4 py-8">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center pb-3">
          <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-lg bg-gray-900 text-white font-bold text-lg mb-2">
            A
          </div>
          <h1 className="text-lg font-semibold text-gray-900">AiravatL ERP</h1>
          <p className="text-sm text-gray-500">Sign in to your account</p>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="email" className="text-xs text-gray-600">
                Email
              </Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@airavatl.com"
                className="h-9 text-sm"
                required
                autoComplete="email"
                autoCapitalize="none"
                spellCheck={false}
                maxLength={EMAIL_MAX_LENGTH}
                autoFocus
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password" className="text-xs text-gray-600">
                Password
              </Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your password"
                  className="h-9 text-sm pr-9"
                  required
                  minLength={PASSWORD_MIN_LENGTH}
                  maxLength={PASSWORD_MAX_LENGTH}
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  tabIndex={-1}
                >
                  {showPassword ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              </div>
            </div>

            {error && (
              <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-md">
                {error}
              </p>
            )}
            {cooldownActive && (
              <p className="text-xs text-amber-700 bg-amber-50 px-3 py-2 rounded-md">
                Too many failed attempts. Please wait {cooldownRemainingSeconds}s before retrying.
              </p>
            )}

            <Button
              type="submit"
              className="w-full h-9 text-sm"
              disabled={loading || cooldownActive}
            >
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Signing in...
                </>
              ) : cooldownActive ? (
                `Retry in ${cooldownRemainingSeconds}s`
              ) : (
                "Sign in"
              )}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
