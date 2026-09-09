import { Database, FlaskConical } from "lucide-react";

import { cn } from "@/lib/utils";
import { DATA_SOURCE_LABEL } from "@/lib/mplads-data";
import type { DataSource } from "@/lib/api";

/** Never let a synthetic-benchmark record visually pass as a real government
 * record -- this badge is required wherever a work/payment row appears. */
export function DataSourceBadge({ dataSource, className }: { dataSource: DataSource | null | undefined; className?: string }) {
  if (!dataSource) return null;
  const isReal = dataSource === "WEB_SCRAPED_REAL";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide",
        isReal
          ? "border-border bg-muted text-muted-foreground"
          : "border-accent bg-accent text-accent-foreground",
        className,
      )}
      title={isReal ? "Scraped from the real eSAKSHI portal" : "Synthetic benchmark record with injected ground-truth labels"}
    >
      {isReal ? <Database className="h-3 w-3" /> : <FlaskConical className="h-3 w-3" />}
      {DATA_SOURCE_LABEL[dataSource]}
    </span>
  );
}
