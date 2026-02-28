"use client";

import * as React from "react";
import * as RechartsPrimitive from "recharts";
import { cn } from "@/lib/utils";

export type ChartConfig = Record<
  string,
  {
    label?: string;
    color?: string;
  }
>;

const ChartContext = React.createContext<{ config: ChartConfig } | null>(null);

function useChart() {
  const context = React.useContext(ChartContext);
  if (!context) {
    throw new Error("useChart must be used within a <ChartContainer />");
  }
  return context;
}

export const ChartContainer = React.forwardRef<
  HTMLDivElement,
  React.ComponentProps<"div"> & {
    config: ChartConfig;
    children: React.ComponentProps<typeof RechartsPrimitive.ResponsiveContainer>["children"];
  }
>(({ id, className, children, config, ...props }, ref) => {
  const chartId = React.useId();
  const resolvedId = id ?? `chart-${chartId.replace(/:/g, "")}`;

  const cssVars = React.useMemo(() => {
    const variables: Record<string, string> = {};
    for (const [key, entry] of Object.entries(config)) {
      if (entry.color) {
        variables[`--color-${key}`] = entry.color;
      }
    }
    return variables as React.CSSProperties;
  }, [config]);

  return (
    <ChartContext.Provider value={{ config }}>
      <div ref={ref} data-chart={resolvedId} className={cn("h-[280px] w-full", className)} style={cssVars} {...props}>
        <RechartsPrimitive.ResponsiveContainer>{children}</RechartsPrimitive.ResponsiveContainer>
      </div>
    </ChartContext.Provider>
  );
});
ChartContainer.displayName = "ChartContainer";

export const ChartTooltip = RechartsPrimitive.Tooltip;

interface TooltipPayloadItem {
  value?: string | number;
  name?: string;
  dataKey?: string;
  color?: string;
  payload?: Record<string, unknown>;
}

interface ChartTooltipContentProps extends React.HTMLAttributes<HTMLDivElement> {
  active?: boolean;
  payload?: TooltipPayloadItem[];
  label?: string | number;
  hideLabel?: boolean;
  formatter?: (value: string | number, name: string, item: TooltipPayloadItem) => React.ReactNode;
}

export function ChartTooltipContent({
  active,
  payload,
  label,
  hideLabel,
  className,
  formatter,
}: ChartTooltipContentProps) {
  const { config } = useChart();

  if (!active || !payload?.length) return null;

  return (
    <div className={cn("rounded-lg border border-gray-200 bg-white p-2 text-xs shadow-sm", className)}>
      {!hideLabel ? <p className="mb-1 font-medium text-gray-800">{label}</p> : null}
      <div className="space-y-1">
        {payload.map((item) => {
          const key = String(item.dataKey ?? item.name ?? "value");
          const configEntry = config[key];
          const displayName = configEntry?.label ?? item.name ?? key;
          const displayColor = configEntry?.color ?? item.color ?? "#111827";
          const value = item.value ?? "";

          return (
            <div key={key} className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-1.5 text-gray-600">
                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: displayColor }} />
                {displayName}
              </div>
              <span className="font-medium text-gray-900">
                {formatter ? formatter(value, String(displayName), item) : String(value)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export const ChartLegend = RechartsPrimitive.Legend;

export function ChartLegendContent({ payload }: { payload?: Array<{ value?: string; color?: string; dataKey?: string }> }) {
  const { config } = useChart();

  if (!payload?.length) return null;

  return (
    <div className="flex flex-wrap items-center gap-3 text-xs text-gray-600">
      {payload.map((item) => {
        const key = String(item.dataKey ?? item.value ?? "");
        const configEntry = config[key];
        return (
          <div key={key} className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: configEntry?.color ?? item.color ?? "#111827" }} />
            {configEntry?.label ?? item.value ?? key}
          </div>
        );
      })}
    </div>
  );
}
