"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useDebouncedValue } from "@/lib/hooks/use-debounced-value";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { apiRequest } from "@/lib/api/http";
import { Search, Key, Loader2, CheckCircle, XCircle, Clock } from "lucide-react";

interface OtpEntry {
  phone: string;
  otp: string;
  created_at: string;
  sent_successfully: boolean;
  seconds_ago: number;
  full_name: string | null;
  user_type: string | null;
}

function formatPhone(phone: string) {
  const d = phone.replace(/^\+?91/, "");
  if (d.length === 10) return `+91 ${d.slice(0, 5)} ${d.slice(5)}`;
  return phone;
}

function formatTimeAgo(seconds: number) {
  if (seconds < 60) return `${seconds}s ago`;
  const mins = Math.floor(seconds / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  return `${hrs}h ${mins % 60}m ago`;
}

function prettify(s: string) {
  return s.split("_").map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join(" ");
}

export default function AdminOtpPage() {
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search, 300);

  const query = useQuery({
    queryKey: ["admin", "otp-lookup", debouncedSearch],
    queryFn: () => {
      const params = new URLSearchParams();
      if (debouncedSearch) params.set("search", debouncedSearch);
      return apiRequest<OtpEntry[]>(`/api/admin/otp-lookup?${params}`);
    },
    refetchInterval: 10_000,
    staleTime: 5_000,
  });

  const entries = query.data ?? [];

  return (
    <div className="space-y-4 p-4 sm:p-6">
      <PageHeader title="OTP Lookup" description="View latest OTP codes sent to users (admin only, last 24 hours)" />

      <div className="relative max-w-md">
        <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
        <Input
          placeholder="Search by phone number or name..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="h-9 pl-8 text-sm"
        />
      </div>

      {query.isLoading && (
        <Card><CardContent className="flex items-center gap-2 p-4 text-sm text-gray-500">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading...
        </CardContent></Card>
      )}

      {!query.isLoading && entries.length === 0 && (
        <Card><CardContent className="p-6 text-center text-sm text-gray-500">
          {debouncedSearch ? "No OTP records found for this search" : "No OTP records in the last 24 hours"}
        </CardContent></Card>
      )}

      {entries.length > 0 && (
        <div className="space-y-2">
          {entries.map((entry, i) => (
            <Card key={`${entry.phone}-${i}`}>
              <CardContent className="p-3 sm:p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-sm font-medium text-gray-900">{formatPhone(entry.phone)}</span>
                      {entry.full_name && (
                        <span className="text-xs text-gray-500">{entry.full_name}</span>
                      )}
                      {entry.user_type && (
                        <Badge variant="outline" className="border-0 text-[10px] bg-gray-100 text-gray-600">
                          {prettify(entry.user_type)}
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-2 text-xs text-gray-500">
                      <Clock className="h-3 w-3" />
                      <span>{formatTimeAgo(entry.seconds_ago)}</span>
                      <span>·</span>
                      {entry.sent_successfully ? (
                        <span className="flex items-center gap-1 text-emerald-600">
                          <CheckCircle className="h-3 w-3" /> Sent
                        </span>
                      ) : (
                        <span className="flex items-center gap-1 text-red-600">
                          <XCircle className="h-3 w-3" /> Failed
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="flex items-center gap-1.5 bg-gray-900 text-white px-3 py-1.5 rounded-md">
                      <Key className="h-3.5 w-3.5" />
                      <span className="text-lg font-mono font-bold tracking-widest">{entry.otp}</span>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <p className="text-[11px] text-gray-400 text-center">
        OTP records are automatically deleted after 24 hours. Showing latest OTP per phone number.
      </p>
    </div>
  );
}
