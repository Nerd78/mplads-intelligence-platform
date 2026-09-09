import type { LucideIcon } from "lucide-react";
import { TrendingDown, TrendingUp } from "lucide-react";

import { cn } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Skeleton } from "@/components/ui/skeleton";

export type KpiTone = "neutral" | "warning" | "critical" | "positive";

const toneClasses: Record<KpiTone, string> = {
  neutral: "text-foreground",
  positive: "text-risk-low",
  warning: "text-risk-medium",
  critical: "text-risk-critical",
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
  loading?: boolean | undefined;
}

export function KpiCard({ label, value, icon: Icon, tone = "neutral", trend, explanation, loading }: KpiCardProps) {
  return (
    <Card className="border-border/80 shadow-none">
      <CardContent className="flex items-start justify-between gap-3 p-4">
        <div className="flex min-w-0 flex-col gap-1">
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</span>
            {explanation && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="cursor-help text-muted-foreground/70">ⓘ</span>
                </TooltipTrigger>
                <TooltipContent className="max-w-64 text-xs">{explanation}</TooltipContent>
              </Tooltip>
            )}
          </div>
          {loading ? (
            <Skeleton className="h-7 w-24" />
          ) : (
            <span className={cn("text-2xl font-semibold tabular-nums tracking-tight", toneClasses[tone])}>{value}</span>
          )}
          {trend && (
            <div className={cn("flex items-center gap-1 text-xs", trend.direction === "up" ? "text-risk-critical" : "text-risk-low")}>
              {trend.direction === "up" ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
              {trend.value}
            </div>
          )}
        </div>
        {Icon && (
          <div className="rounded-md bg-muted p-2 text-muted-foreground">
            <Icon className="h-4 w-4" />
          </div>
        )}
      </CardContent>
    </Card>
  );
}
