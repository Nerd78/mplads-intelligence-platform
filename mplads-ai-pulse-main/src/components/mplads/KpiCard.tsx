import type { LucideIcon } from "lucide-react";
import { TrendingDown, TrendingUp } from "lucide-react";

import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Skeleton } from "@/components/ui/skeleton";

export type KpiTone = "neutral" | "warning" | "critical" | "positive";

/**
 * Tone paints the icon tile and the accent rule, never the number itself --
 * a figure rendered in a severity color reads as if the *value* were the
 * alert. The number stays in ink; the tile carries the state.
 */
const toneStyles: Record<KpiTone, { tile: string; rule: string }> = {
  neutral: { tile: "bg-blue-100 text-blue-800", rule: "bg-blue-600" },
  positive: { tile: "bg-sev-low-surface text-sev-low", rule: "bg-sev-low" },
  warning: { tile: "bg-sev-medium-surface text-sev-medium", rule: "bg-sev-medium" },
  critical: { tile: "bg-sev-critical-surface text-sev-critical", rule: "bg-sev-critical" },
};

interface KpiCardProps {
  label: string;
  value: string;
  icon?: LucideIcon | undefined;
  tone?: KpiTone | undefined;
  /** Only pass this when backed by real historical data -- never fabricate
   * a trend when there is only one detection snapshot. */
  trend?: { value: string; direction: "up" | "down" } | null | undefined;
  explanation?: string | undefined;
  /** Short qualifier under the value, e.g. "of 111,525 works". */
  footnote?: string | undefined;
  loading?: boolean | undefined;
}

export function KpiCard({
  label,
  value,
  icon: Icon,
  tone = "neutral",
  trend,
  explanation,
  footnote,
  loading,
}: KpiCardProps) {
  const styles = toneStyles[tone];

  return (
    <div className="relative flex min-h-[104px] flex-col justify-between overflow-hidden rounded-xl border border-border bg-surface p-4">
      <span className={cn("absolute inset-x-0 top-0 h-0.5", styles.rule)} aria-hidden="true" />

      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-1.5">
          <span className="truncate text-[11px] font-semibold uppercase tracking-wider text-ink-muted">{label}</span>
          {explanation && (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  aria-label={`About ${label}`}
                  className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full border border-border-strong text-[9px] font-bold text-ink-subtle"
                >
                  i
                </button>
              </TooltipTrigger>
              <TooltipContent className="max-w-64 text-xs">{explanation}</TooltipContent>
            </Tooltip>
          )}
        </div>
        {Icon && (
          <div className={cn("flex h-7 w-7 shrink-0 items-center justify-center rounded-lg", styles.tile)}>
            <Icon className="h-3.5 w-3.5" />
          </div>
        )}
      </div>

      <div className="mt-2">
        {loading ? (
          <Skeleton className="h-8 w-28" />
        ) : (
          <span className="block truncate text-[26px] font-semibold leading-none tracking-tight text-ink tnum">
            {value}
          </span>
        )}
        {footnote && !loading && <p className="mt-1.5 truncate text-[11px] text-ink-subtle">{footnote}</p>}
        {trend && !loading && (
          <div
            className={cn(
              "mt-1.5 flex items-center gap-1 text-[11px] font-medium",
              trend.direction === "up" ? "text-sev-high" : "text-sev-low",
            )}
          >
            {trend.direction === "up" ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
            {trend.value}
          </div>
        )}
      </div>
    </div>
  );
}
