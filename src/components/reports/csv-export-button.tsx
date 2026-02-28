"use client";

import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";

export interface CsvColumn<T> {
  key: string;
  header: string;
  value: (row: T) => string | number | null | undefined;
}

function toCsvValue(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "";
  const text = String(value);
  if (text.includes(",") || text.includes("\n") || text.includes('"')) {
    return `"${text.replaceAll('"', '""')}"`;
  }
  return text;
}

function buildCsv<T>(rows: T[], columns: CsvColumn<T>[]) {
  const headerLine = columns.map((column) => toCsvValue(column.header)).join(",");
  const bodyLines = rows.map((row) => columns.map((column) => toCsvValue(column.value(row))).join(","));
  return [headerLine, ...bodyLines].join("\n");
}

interface CsvExportButtonProps<T> {
  fileName: string;
  rows: T[];
  columns: CsvColumn<T>[];
  disabled?: boolean;
}

export function CsvExportButton<T>({ fileName, rows, columns, disabled }: CsvExportButtonProps<T>) {
  function handleDownload() {
    if (!rows.length) return;
    const csv = buildCsv(rows, columns);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = fileName;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  return (
    <Button variant="outline" size="sm" className="h-8 text-xs" disabled={disabled || !rows.length} onClick={handleDownload}>
      <Download className="mr-1 h-3.5 w-3.5" />
      Export CSV
    </Button>
  );
}
