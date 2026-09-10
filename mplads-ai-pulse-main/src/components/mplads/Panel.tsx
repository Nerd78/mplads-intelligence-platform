import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * The single surface primitive every card in the app is built from.
 *
 * Before this existed each page hand-rolled `<Card className="border-border/80
 * shadow-none">`, so padding, border weight and header spacing drifted from
 * page to page. Panel fixes the shell; callers only supply content.
 */
export function Panel({
  className,
  children,
  ...rest
}: { className?: string; children: ReactNode } & React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("flex min-w-0 flex-col overflow-hidden rounded-xl border border-border bg-surface", className)}
      {...rest}
    >
      {children}
    </div>
  );
}

export function PanelHeader({
  title,
  description,
  actions,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex items-start justify-between gap-3 border-b border-border px-4 py-3", className)}>
      <div className="min-w-0">
        <h3 className="truncate text-sm font-semibold text-ink">{title}</h3>
        {description && <p className="mt-0.5 text-xs leading-snug text-ink-muted">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  );
}

export function PanelBody({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn("min-w-0 p-4", className)}>{children}</div>;
}

/**
 * Page-level heading. Kept here so every route states its section and title
 * the same way instead of repeating a bespoke eyebrow + h2 pair.
 */
export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow: string;
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-blue-700">{eyebrow}</p>
        <h2 className="mt-0.5 text-xl font-semibold tracking-tight text-ink">{title}</h2>
        {description && <p className="mt-1 max-w-2xl text-sm text-ink-muted">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  );
}
