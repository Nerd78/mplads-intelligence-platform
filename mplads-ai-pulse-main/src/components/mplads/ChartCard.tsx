import type { ReactNode } from "react";

import { Panel, PanelHeader } from "./Panel";
import { CardSkeleton, EmptyState, ErrorState } from "./StateViews";

export function ChartCard({
  title,
  explanation,
  loading,
  error,
  onRetry,
  empty,
  children,
  actions,
  legend,
  height = 260,
}: {
  title: string;
  explanation?: string | undefined;
  loading?: boolean | undefined;
  error?: unknown;
  onRetry?: (() => void) | undefined;
  empty?: boolean | undefined;
  children: ReactNode;
  actions?: ReactNode;
  /** Rendered under the plot. Required whenever a chart draws 2+ series. */
  legend?: ReactNode;
  height?: number | undefined;
}) {
  return (
    <Panel className="h-full">
      <PanelHeader title={title} description={explanation} actions={actions} />
      <div className="flex min-w-0 flex-1 flex-col p-3">
        <div style={{ height }} className="min-w-0">
          {loading ? (
            <CardSkeleton className="h-full w-full" />
          ) : error ? (
            <ErrorState message={(error as Error)?.message} onRetry={onRetry} />
          ) : empty ? (
            <EmptyState title="No data yet" />
          ) : (
            children
          )}
        </div>
        {legend && !loading && !error && !empty && (
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-border px-1 pt-2">{legend}</div>
        )}
      </div>
    </Panel>
  );
}

/** Legend swatch + label. Identity is never carried by the mark color alone. */
export function LegendItem({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5 text-[11px] text-ink-muted">
      <span className="h-2.5 w-2.5 rounded-[3px]" style={{ background: color }} aria-hidden="true" />
      {label}
    </span>
  );
}
