"use client";

import { cn } from "@/lib/utils";
import { useRegisterPageHeader } from "@/components/layout/page-header-context";

interface PageHeaderProps {
  title: string;
  description?: string;
  children?: React.ReactNode;
  className?: string;
}

/**
 * Registers the page's title/description with the app-shell top bar and
 * renders only the action buttons (children) inline. Pass the same title
 * and description props as before — the text now lives in the top bar.
 */
export function PageHeader({ title, description, children, className }: PageHeaderProps) {
  useRegisterPageHeader(title, description);
  if (!children) return null;
  return (
    <div className={cn("flex items-center justify-end gap-2", className)}>
      {children}
    </div>
  );
}
