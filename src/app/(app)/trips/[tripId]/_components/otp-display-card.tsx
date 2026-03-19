"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { AppTripStatus } from "@/lib/types";
import { KeyRound, CheckCircle2 } from "lucide-react";

interface OtpDisplayCardProps {
  status: AppTripStatus;
  pickupOtp: string | null;
  isOps: boolean;
  pickupCompletedAt: string | null;
}

const SHOW_OTP_STATUSES = new Set<AppTripStatus>([
  "waiting_driver_acceptance",
  "driver_assigned",
  "en_route_to_pickup",
  "at_pickup",
]);

export function OtpDisplayCard({
  status,
  pickupOtp,
  isOps,
  pickupCompletedAt,
}: OtpDisplayCardProps) {
  const isAtPickup = status === "at_pickup";
  const isVerified = status === "loading" || !!pickupCompletedAt;

  if (isVerified) {
    return (
      <Card className="border-green-200 bg-green-50">
        <CardContent className="p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-green-100">
              <CheckCircle2 className="h-5 w-5 text-green-600" />
            </div>
            <div>
              <p className="text-sm font-semibold text-green-800">
                Pickup Verified
              </p>
              <p className="text-xs text-green-600">
                OTP confirmed — driver is loading cargo
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!SHOW_OTP_STATUSES.has(status)) return null;

  return (
    <Card
      className={
        isAtPickup
          ? "border-green-300 bg-green-50"
          : "border-gray-200 bg-white"
      }
    >
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div
              className={`flex h-10 w-10 items-center justify-center rounded-full ${
                isAtPickup ? "bg-green-100" : "bg-gray-100"
              }`}
            >
              <KeyRound
                className={`h-5 w-5 ${isAtPickup ? "text-green-600" : "text-gray-500"}`}
              />
            </div>
            <div>
              <p className="text-sm font-semibold text-gray-900">Pickup OTP</p>
              <p
                className={`text-xs ${isAtPickup ? "text-green-600" : "text-gray-500"}`}
              >
                {isAtPickup
                  ? "Share with driver now"
                  : "Share when driver arrives"}
              </p>
            </div>
          </div>

          {isOps ? (
            <Badge
              variant="outline"
              className={`text-xs ${
                isAtPickup
                  ? "border-green-300 bg-green-100 text-green-700"
                  : "border-gray-200 bg-gray-100 text-gray-600"
              }`}
            >
              {isAtPickup ? "Driver waiting" : "Assigned"}
            </Badge>
          ) : pickupOtp ? (
            <Badge
              variant="outline"
              className={`font-mono text-lg font-bold tracking-widest ${
                isAtPickup
                  ? "border-green-300 bg-green-600 text-white"
                  : "border-gray-200 bg-gray-100 text-gray-800"
              }`}
            >
              {pickupOtp}
            </Badge>
          ) : null}
        </div>

        {isAtPickup && (
          <div className="mt-3 rounded-md bg-green-100 px-3 py-2">
            <p className="text-xs font-medium text-green-800">
              Driver is waiting for OTP verification
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
