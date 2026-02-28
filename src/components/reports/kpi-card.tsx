import { Card, CardContent } from "@/components/ui/card";

export function KpiCard({
  label,
  value,
  helper,
}: {
  label: string;
  value: string;
  helper?: string;
}) {
  return (
    <Card>
      <CardContent className="p-3">
        <p className="text-xs text-gray-500">{label}</p>
        <p className="text-xl font-semibold text-gray-900">{value}</p>
        {helper ? <p className="mt-0.5 text-[11px] text-gray-500">{helper}</p> : null}
      </CardContent>
    </Card>
  );
}
