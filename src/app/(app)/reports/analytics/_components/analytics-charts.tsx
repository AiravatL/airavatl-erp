"use client";

import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, XAxis, YAxis } from "recharts";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { AnalyticsData } from "@/lib/api/analytics";

const PIE_COLORS = [
  "#3b82f6",
  "#10b981",
  "#f59e0b",
  "#ef4444",
  "#8b5cf6",
  "#06b6d4",
  "#ec4899",
  "#14b8a6",
];

const auctionsTrendConfig = {
  total: { label: "Total", color: "#3b82f6" },
  converted: { label: "Converted", color: "#10b981" },
  cancelled: { label: "Cancelled", color: "#ef4444" },
} satisfies ChartConfig;

const tripsTrendConfig = {
  total: { label: "Total", color: "#6366f1" },
  completed: { label: "Completed", color: "#10b981" },
  cancelled: { label: "Cancelled", color: "#ef4444" },
} satisfies ChartConfig;

const pieConfig = { value: { label: "Count" } } satisfies ChartConfig;

function prettify(s: string) {
  return s
    .split("_")
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join(" ");
}

interface Props {
  data: AnalyticsData;
}

export default function AnalyticsCharts({ data }: Props) {
  const auctionPie = (data.auction_status_breakdown ?? []).map((r, i) => ({
    label: prettify(r.status),
    value: Number(r.value),
    fill: PIE_COLORS[i % PIE_COLORS.length],
  }));

  const tripPie = (data.trip_status_breakdown ?? []).map((r, i) => ({
    label: prettify(r.status),
    value: Number(r.value),
    fill: PIE_COLORS[i % PIE_COLORS.length],
  }));

  return (
    <>
      {/* Trend charts */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Auctions — Daily Trend</CardTitle>
            <CardDescription className="text-xs">
              Total, converted to trip, cancelled
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ChartContainer config={auctionsTrendConfig} className="h-[240px]">
              <BarChart data={data.daily_auctions} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
                <CartesianGrid vertical={false} strokeDasharray="3 3" />
                <XAxis dataKey="date" tickLine={false} axisLine={false} fontSize={10} />
                <YAxis tickLine={false} axisLine={false} fontSize={11} />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Bar dataKey="total" fill="var(--color-total)" radius={[4, 4, 0, 0]} />
                <Bar dataKey="converted" fill="var(--color-converted)" radius={[4, 4, 0, 0]} />
                <Bar dataKey="cancelled" fill="var(--color-cancelled)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ChartContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Trips — Daily Trend</CardTitle>
            <CardDescription className="text-xs">Total, completed, cancelled</CardDescription>
          </CardHeader>
          <CardContent>
            <ChartContainer config={tripsTrendConfig} className="h-[240px]">
              <BarChart data={data.daily_trips} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
                <CartesianGrid vertical={false} strokeDasharray="3 3" />
                <XAxis dataKey="date" tickLine={false} axisLine={false} fontSize={10} />
                <YAxis tickLine={false} axisLine={false} fontSize={11} />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Bar dataKey="total" fill="var(--color-total)" radius={[4, 4, 0, 0]} />
                <Bar dataKey="completed" fill="var(--color-completed)" radius={[4, 4, 0, 0]} />
                <Bar dataKey="cancelled" fill="var(--color-cancelled)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ChartContainer>
          </CardContent>
        </Card>
      </div>

      {/* Status pies */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Auctions by Status</CardTitle>
            <CardDescription className="text-xs">Distribution over the period</CardDescription>
          </CardHeader>
          <CardContent>
            <ChartContainer config={pieConfig} className="h-[220px]">
              <PieChart>
                <ChartTooltip content={<ChartTooltipContent />} />
                <Pie
                  data={auctionPie}
                  dataKey="value"
                  nameKey="label"
                  innerRadius={48}
                  outerRadius={76}
                  paddingAngle={2}
                >
                  {auctionPie.map((entry, i) => (
                    <Cell key={`a-${i}`} fill={entry.fill} />
                  ))}
                </Pie>
              </PieChart>
            </ChartContainer>
            <PieLegend items={auctionPie} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Trips by Status</CardTitle>
            <CardDescription className="text-xs">Distribution over the period</CardDescription>
          </CardHeader>
          <CardContent>
            <ChartContainer config={pieConfig} className="h-[220px]">
              <PieChart>
                <ChartTooltip content={<ChartTooltipContent />} />
                <Pie
                  data={tripPie}
                  dataKey="value"
                  nameKey="label"
                  innerRadius={48}
                  outerRadius={76}
                  paddingAngle={2}
                >
                  {tripPie.map((entry, i) => (
                    <Cell key={`t-${i}`} fill={entry.fill} />
                  ))}
                </Pie>
              </PieChart>
            </ChartContainer>
            <PieLegend items={tripPie} />
          </CardContent>
        </Card>
      </div>
    </>
  );
}

function PieLegend({ items }: { items: { label: string; value: number; fill: string }[] }) {
  if (!items.length) {
    return <p className="mt-2 text-xs text-gray-400">No data</p>;
  }
  return (
    <div className="mt-2 space-y-1 text-xs text-gray-600">
      {items.map((item) => (
        <div key={item.label} className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: item.fill }} />
            {item.label}
          </div>
          <span className="font-medium text-gray-800">{item.value.toLocaleString("en-IN")}</span>
        </div>
      ))}
    </div>
  );
}
