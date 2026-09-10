import { useMemo, useState } from "react";
import { ComposableMap, Geographies, Geography, Marker, ZoomableGroup } from "react-simple-maps";
import { useNavigate } from "@tanstack/react-router";
import { Minus, Plus, RotateCcw } from "lucide-react";

import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { CardSkeleton, ErrorState } from "./StateViews";
import { useGeoPoints, useGeoStates, useStateNameMap } from "@/lib/hooks";
import { formatAnomalyLabel } from "@/lib/mplads-data";
import { cn } from "@/lib/utils";
import type { GeoPoint, MapMetric } from "@/lib/api";

const GEO_URL = "/geo/india-states.json";
const DEFAULT_CENTER: [number, number] = [82, 22];

const MAP_MODES: { value: MapMetric; label: string }[] = [
  { value: "overall", label: "Overall risk" },
  { value: "critical", label: "Critical" },
  { value: "cost_overrun", label: "Cost overrun" },
  { value: "delayed", label: "Delayed work" },
  { value: "duplicate", label: "Duplicate work" },
  { value: "contractor", label: "Blacklisted contractor" },
  { value: "progress_mismatch", label: "Progress mismatch" },
];

/**
 * The choropleth encodes magnitude, so it uses the sequential blue ramp --
 * five solid steps, light to dark. It previously used the severity
 * green/amber/red, which painted most of India green on a screen titled
 * "risk map" and implied a severity bucket the state average doesn't carry.
 */
const CHOROPLETH = [
  "var(--chart-seq-1)",
  "var(--chart-seq-2)",
  "var(--chart-seq-3)",
  "var(--chart-seq-4)",
  "var(--chart-seq-5)",
];
const NO_DATA_FILL = "var(--surface-inset)";

const SEVERITY_DOT: Record<string, string> = {
  Low: "var(--sev-low)",
  Medium: "var(--sev-medium)",
  High: "var(--sev-high)",
  Critical: "var(--sev-critical)",
};

const SEVERITY_RANK = ["Low", "Medium", "High", "Critical"];

/**
 * Quantile breaks, not linear ones. State risk averages cluster tightly
 * (most sit between 20 and 36 on a 0-100 scale), so slicing 0..max into five
 * equal bands drops nearly every state into the lightest step and paints a
 * flat, uninformative map. Ranking the values and cutting at quintiles keeps
 * roughly a fifth of the states in each shade, so the ramp actually
 * separates them. The tooltip still reports the raw number, so the relative
 * shading never hides the absolute value.
 */
function quantileBreaks(values: number[]): number[] {
  const sorted = values.filter((v) => v > 0).sort((a, b) => a - b);
  if (sorted.length === 0) return [];
  const breaks: number[] = [];
  for (let i = 1; i < CHOROPLETH.length; i++) {
    const idx = Math.floor((i / CHOROPLETH.length) * sorted.length);
    breaks.push(sorted[Math.min(idx, sorted.length - 1)] as number);
  }
  return breaks;
}

function stepFor(value: number, breaks: number[]): number {
  if (!(value > 0) || breaks.length === 0) return -1;
  let step = 0;
  while (step < breaks.length && value >= (breaks[step] as number)) step++;
  return Math.min(CHOROPLETH.length - 1, step);
}

/** Grid clustering: points sharing a lat/lon cell (cell shrinks as zoom
 * grows) merge into one bubble, so the ~4,000-point overlay never renders
 * that many SVG nodes at once. */
function clusterPoints(points: GeoPoint[], zoom: number) {
  const cellSize = Math.max(0.4, 6 / zoom);
  const buckets = new Map<string, GeoPoint[]>();
  for (const p of points) {
    const key = `${Math.round(p.latitude / cellSize)}:${Math.round(p.longitude / cellSize)}`;
    const list = buckets.get(key);
    if (list) list.push(p);
    else buckets.set(key, [p]);
  }
  return Array.from(buckets.values()).map((group) => {
    const lat = group.reduce((s, p) => s + p.latitude, 0) / group.length;
    const lon = group.reduce((s, p) => s + p.longitude, 0) / group.length;
    const worstSeverity = group.reduce<string>((worst, p) => {
      if (!p.severity) return worst;
      return SEVERITY_RANK.indexOf(p.severity) > SEVERITY_RANK.indexOf(worst) ? p.severity : worst;
    }, "Low");
    return { lat, lon, count: group.length, worstSeverity, points: group };
  });
}

function MapButton({
  onClick,
  label,
  children,
}: {
  onClick: () => void;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="flex h-7 w-7 items-center justify-center rounded-md border border-border bg-surface text-ink-muted transition-colors hover:bg-blue-100 hover:text-blue-800"
    >
      {children}
    </button>
  );
}

export function RiskMap({
  onStateClick,
  compact = false,
}: {
  onStateClick?: ((state: string) => void) | undefined;
  compact?: boolean | undefined;
}) {
  const navigate = useNavigate();
  const [metric, setMetric] = useState<MapMetric>("overall");
  const [showPoints, setShowPoints] = useState(!compact);
  const [hovered, setHovered] = useState<string | null>(null);
  const {
    data: states,
    isLoading: statesLoading,
    isError: statesError,
    error: statesErr,
    refetch: refetchStates,
  } = useGeoStates(metric);
  const { data: points, isLoading: pointsLoading } = useGeoPoints();
  const { data: nameMap } = useStateNameMap();
  const [zoom, setZoom] = useState(1);
  const [center, setCenter] = useState<[number, number]>(DEFAULT_CENTER);

  const scoreByState = useMemo(() => {
    const m = new Map<
      string,
      { score: number; metricValue: number; count: number; critical: number; high: number; top: string | null }
    >();
    for (const s of states ?? []) {
      m.set(s.state, {
        score: s.avg_composite_score,
        metricValue: s.metric_value,
        count: s.work_count,
        critical: s.critical_count,
        high: s.high_count,
        top: s.top_anomaly_label,
      });
    }
    return m;
  }, [states]);

  const breaks = useMemo(() => quantileBreaks((states ?? []).map((s) => s.metric_value)), [states]);
  const clusters = useMemo(() => (showPoints ? clusterPoints(points ?? [], zoom) : []), [points, zoom, showPoints]);

  const reset = () => {
    setZoom(1);
    setCenter(DEFAULT_CENTER);
  };

  if (statesLoading || pointsLoading) return <CardSkeleton className="h-full w-full" />;
  if (statesError) return <ErrorState message={(statesErr as Error)?.message} onRetry={refetchStates} />;

  const activeMode = MAP_MODES.find((m) => m.value === metric);

  return (
    <TooltipProvider delayDuration={120}>
      <div className="flex h-full w-full flex-col gap-2">
        {!compact && (
          <div className="flex flex-wrap items-center gap-1.5">
            {MAP_MODES.map((m) => (
              <button
                key={m.value}
                type="button"
                onClick={() => setMetric(m.value)}
                className={cn(
                  "rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors",
                  metric === m.value
                    ? "border-blue-700 bg-blue-700 text-white"
                    : "border-border bg-surface text-ink-muted hover:border-blue-300 hover:bg-blue-50 hover:text-blue-800",
                )}
              >
                {m.label}
              </button>
            ))}
          </div>
        )}

        <div className="relative min-h-0 flex-1 overflow-hidden rounded-lg border border-border bg-blue-50">
          <ComposableMap
            projection="geoMercator"
            projectionConfig={{ scale: compact ? 700 : 1000, center: DEFAULT_CENTER }}
            width={800}
            height={compact ? 420 : 620}
            style={{ width: "100%", height: "100%" }}
          >
            <ZoomableGroup
              center={center}
              zoom={zoom}
              onMoveEnd={({ zoom: z, coordinates }) => {
                setZoom(z);
                setCenter(coordinates);
              }}
              minZoom={1}
              maxZoom={8}
            >
              <Geographies geography={GEO_URL}>
                {({ geographies }) =>
                  geographies.map((geo) => {
                    const rawName: string = geo.properties.state;
                    const canonical = nameMap?.aliases[rawName.trim().toLowerCase()] ?? rawName;
                    const agg = scoreByState.get(canonical);
                    const step = agg ? stepFor(agg.metricValue, breaks) : -1;
                    const fill = step >= 0 ? (CHOROPLETH[step] as string) : NO_DATA_FILL;
                    const isHovered = hovered === canonical;
                    return (
                      <Tooltip key={geo.rsmKey}>
                        <TooltipTrigger asChild>
                          <Geography
                            geography={geo}
                            onClick={() => onStateClick?.(canonical)}
                            onMouseEnter={() => setHovered(canonical)}
                            onMouseLeave={() => setHovered(null)}
                            tabIndex={-1}
                            style={{
                              default: {
                                fill,
                                stroke: "var(--surface)",
                                strokeWidth: 0.6,
                                outline: "none",
                                cursor: onStateClick ? "pointer" : "default",
                                transition: "fill 140ms ease, stroke 140ms ease",
                              },
                              // Hover lifts the outline instead of fading the
                              // fill -- an opacity change would misread as a
                              // different value on a sequential ramp.
                              hover: {
                                fill,
                                stroke: "var(--blue-900)",
                                strokeWidth: isHovered ? 1.4 : 0.6,
                                outline: "none",
                                cursor: onStateClick ? "pointer" : "default",
                              },
                              pressed: { fill, stroke: "var(--blue-900)", strokeWidth: 1.4, outline: "none" },
                            }}
                          />
                        </TooltipTrigger>
                        <TooltipContent className="text-xs">
                          <p className="font-semibold">{canonical}</p>
                          {agg ? (
                            <>
                              <p className="tnum">
                                {agg.count.toLocaleString("en-IN")} works · avg score {agg.score.toFixed(0)}
                              </p>
                              {metric !== "overall" && (
                                <p className="tnum">
                                  {activeMode?.label}: {agg.metricValue.toFixed(0)}%
                                </p>
                              )}
                              <p className="tnum">
                                {agg.critical} critical · {agg.high} high
                              </p>
                              {agg.top && <p className="text-ink-muted">Top signal: {formatAnomalyLabel(agg.top)}</p>}
                            </>
                          ) : (
                            <p className="text-ink-muted">No works recorded</p>
                          )}
                        </TooltipContent>
                      </Tooltip>
                    );
                  })
                }
              </Geographies>

              {clusters.map((c, i) => {
                const single = c.count === 1;
                const r = single ? 3.5 : Math.min(13, 6 + Math.log2(c.count) * 1.8);
                const color = SEVERITY_DOT[c.worstSeverity] ?? "var(--ink-subtle)";
                return (
                  <Marker key={i} coordinates={[c.lon, c.lat]}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <g
                          className="cursor-pointer"
                          tabIndex={-1}
                          onClick={() => {
                            const only = c.points[0];
                            if (single && only) {
                              navigate({ to: "/project-investigation", search: { work_id: only.work_id } });
                            } else {
                              setZoom((z) => Math.min(8, z * 2));
                              setCenter([c.lon, c.lat]);
                            }
                          }}
                        >
                          {/* Solid fill with a surface-colored ring: overlapping
                              markers stay countable without alpha blending,
                              which previously turned dense areas into mud. */}
                          <circle r={r} fill={color} stroke="var(--surface)" strokeWidth={single ? 1 : 1.5} />
                          {!single && c.count > 3 && (
                            <text
                              textAnchor="middle"
                              dy="0.34em"
                              style={{
                                fontSize: Math.max(7, r * 0.85),
                                fontWeight: 600,
                                fill: "var(--surface)",
                                pointerEvents: "none",
                              }}
                            >
                              {c.count}
                            </text>
                          )}
                        </g>
                      </TooltipTrigger>
                      <TooltipContent className="text-xs">
                        {single && c.points[0] ? (
                          <>
                            <p className="font-semibold">{c.points[0].work_category ?? "Work"}</p>
                            <p className="tnum">
                              {c.points[0].severity ?? "-"} · score {c.points[0].composite_score?.toFixed(0) ?? "-"}
                            </p>
                            <p className="text-ink-muted">Open case file</p>
                          </>
                        ) : (
                          <p className="tnum">{c.count.toLocaleString("en-IN")} works · select to zoom in</p>
                        )}
                      </TooltipContent>
                    </Tooltip>
                  </Marker>
                );
              })}
            </ZoomableGroup>
          </ComposableMap>

          <div className="absolute right-2 top-2 flex flex-col gap-1">
            <MapButton label="Zoom in" onClick={() => setZoom((z) => Math.min(8, z * 1.5))}>
              <Plus className="h-3.5 w-3.5" />
            </MapButton>
            <MapButton label="Zoom out" onClick={() => setZoom((z) => Math.max(1, z / 1.5))}>
              <Minus className="h-3.5 w-3.5" />
            </MapButton>
            <MapButton label="Reset view" onClick={reset}>
              <RotateCcw className="h-3.5 w-3.5" />
            </MapButton>
          </div>

          <div className="absolute bottom-2 left-2 flex flex-col gap-1.5 rounded-lg border border-border bg-surface px-2.5 py-2">
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-semibold uppercase tracking-wide text-ink-muted">
                {activeMode?.label}
              </span>
              <div className="flex items-center gap-1">
                <span className="text-[9px] text-ink-subtle">low</span>
                <div className="flex overflow-hidden rounded-[3px]">
                  {CHOROPLETH.map((c) => (
                    <span key={c} className="h-2.5 w-4" style={{ background: c }} />
                  ))}
                </div>
                <span className="text-[9px] text-ink-subtle">high</span>
              </div>
            </div>
            {(points ?? []).length > 0 && (
              <button
                type="button"
                onClick={() => setShowPoints((v) => !v)}
                className="flex items-center gap-1.5 text-[10px] text-ink-muted transition-colors hover:text-blue-800"
              >
                <span
                  className={cn(
                    "flex h-3 w-3 items-center justify-center rounded-[3px] border",
                    showPoints ? "border-blue-700 bg-blue-700 text-white" : "border-border-strong bg-surface",
                  )}
                >
                  {showPoints && (
                    <svg viewBox="0 0 10 10" className="h-2 w-2" aria-hidden="true">
                      <path d="M1.5 5.2 4 7.6 8.5 2.6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                    </svg>
                  )}
                </span>
                {(points ?? []).length.toLocaleString("en-IN")} geo-tagged works
              </button>
            )}
          </div>
        </div>
      </div>
    </TooltipProvider>
  );
}
