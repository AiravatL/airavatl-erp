import { cn } from "@/lib/utils";

interface PageHeaderProps {
  title: string;
  description?: string;
  children?: React.ReactNode;
  className?: string;
}

export function PageHeader({ title, description, children, className }: PageHeaderProps) {
  return (
    <div className={cn("flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between", className)}>
      <div>
        <h1 className="text-lg font-semibold text-gray-900">{title}</h1>
        {description && <p className="text-sm text-gray-500">{description}</p>}
      </div>
      {children && <div className="flex items-center gap-2 mt-2 sm:mt-0">{children}</div>}
    </div>
  );
}
