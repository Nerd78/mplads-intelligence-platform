import { cn } from "@/lib/utils";
import { riskColors, riskDotColors } from "@/lib/mplads-data";
import type { Severity } from "@/lib/api";

export function SeverityBadge({ severity, className }: { severity: Severity | null | undefined; className?: string }) {
  if (!severity) {
    return <span className={cn("text-xs text-muted-foreground", className)}>—</span>;
  }
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium tracking-tight",
        riskColors[severity],
        className,
      )}
    >
      <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", riskDotColors[severity])} />
      {severity}
    </span>
  );
}
