import { Landmark, Users } from "lucide-react";

import { Panel, PanelHeader } from "./Panel";
import { CardSkeleton, EmptyState, ErrorState } from "./StateViews";
import { useHouseStats } from "@/lib/hooks";
import { formatCurrency, formatNumber, formatPercent } from "@/lib/mplads-data";
import type { HouseStats } from "@/lib/api";

/**
 * Lok Sabha and Rajya Sabha are shown side by side, never summed.
 *
 * Lok Sabha members hold a constituency and carry ~110k works; Rajya Sabha
 * members represent a state and carry ~1.2k. A pooled national average is
 * therefore dominated by Lok Sabha and hides that Rajya Sabha works score
 * roughly twice as high on average -- the comparison is the finding, so the
 * layout refuses to combine them.
 */
function HouseCard({ row, isHigherRisk }: { row: HouseStats; isHigherRisk: boolean }) {
  const utilisation =
    row.total_sanctioned > 0 ? (row.total_expenditure / row.total_sanctioned) * 100 : null;
  const Icon = row.house === "Rajya Sabha" ? Landmark : Users;

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-3.5">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-100 text-blue-800">
            <Icon className="h-3.5 w-3.5" />
          </span>
          <div>
            <p className="text-sm font-semibold text-ink">{row.house}</p>
            <p className="text-[11px] text-ink-subtle tnum">{formatNumber(row.mp_count)} MPs</p>
          </div>
        </div>
        {isHigherRisk && (
          <span className="rounded-full border border-sev-high bg-sev-high-surface px-2 py-0.5 text-[10px] font-semibold text-sev-high">
            Higher avg risk
          </span>
        )}
      </div>

      <div className="grid grid-cols-2 gap-x-3 gap-y-2.5">
        <Metric label="Avg risk score" value={row.avg_composite_score === null ? "—" : row.avg_composite_score.toFixed(1)} emphasis />
        <Metric label="Works scored" value={formatNumber(row.works_scored)} />
        <Metric label="Sanctioned" value={formatCurrency(row.total_sanctioned)} />
        <Metric label="Utilisation" value={utilisation === null ? "—" : formatPercent(utilisation, 1)} />
        <Metric label="Critical" value={formatNumber(row.critical_count)} />
        <Metric label="High risk" value={formatNumber(row.high_count)} />
      </div>
    </div>
  );
}

function Metric({ label, value, emphasis }: { label: string; value: string; emphasis?: boolean }) {
  return (
    <div className="min-w-0">
      <p className="truncate text-[10px] font-semibold uppercase tracking-wide text-ink-subtle">{label}</p>
      <p className={`truncate tnum ${emphasis ? "text-lg font-semibold text-ink" : "text-sm font-medium text-ink"}`}>
        {value}
      </p>
    </div>
  );
}

export function HouseComparison() {
  const { data, isLoading, isError, error, refetch } = useHouseStats();

  const maxScore = Math.max(0, ...(data ?? []).map((r) => r.avg_composite_score ?? 0));

  return (
    <Panel>
      <PanelHeader
        title="Lok Sabha vs Rajya Sabha"
        description="The two houses run at very different work volumes, so their risk profiles are compared side by side rather than pooled."
      />
      <div className="p-3">
        {isLoading ? (
          <CardSkeleton className="h-40 w-full" />
        ) : isError ? (
          <ErrorState message={(error as Error)?.message} onRetry={refetch} />
        ) : !data || data.length === 0 ? (
          <EmptyState title="No house data recorded" />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {data.map((row) => (
              <HouseCard
                key={row.house}
                row={row}
                isHigherRisk={data.length > 1 && (row.avg_composite_score ?? 0) === maxScore && maxScore > 0}
              />
            ))}
          </div>
        )}
      </div>
    </Panel>
  );
}
