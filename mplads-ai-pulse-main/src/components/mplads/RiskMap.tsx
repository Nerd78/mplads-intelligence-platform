import { useMemo, useState } from "react";
import { ComposableMap, Geographies, Geography, Marker, ZoomableGroup } from "react-simple-maps";
import { useNavigate } from "@tanstack/react-router";

import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { CardSkeleton, ErrorState } from "./StateViews";
import { useGeoPoints, useGeoStates, useStateNameMap } from "@/lib/hooks";
import type { GeoPoint, MapMetric } from "@/lib/api";

const GEO_URL = "/geo/india-states.json";

const MAP_MODES: { value: MapMetric; label: string }[] = [
  { value: "overall", label: "Overall risk" },
  { value: "critical", label: "Critical" },
  { value: "cost_overrun", label: "Cost overrun" },
  { value: "delayed", label: "Delayed work" },
  { value: "duplicate", label: "Duplicate work" },
  { value: "contractor", label: "Blacklisted contractor" },
  { value: "progress_mismatch", label: "Progress mismatch" },
];

const SEVERITY_DOT: Record<string, string> = {
  Low: "var(--risk-low)",
  Medium: "var(--risk-medium)",
  High: "var(--risk-high)",
  Critical: "var(--risk-critical)",
};

function scoreColor(score: number): string {
  if (score >= 61) return "var(--risk-high)";
  if (score >= 31) return "var(--risk-medium)";
  if (score > 0) return "var(--risk-low)";
  return "var(--muted)";
}

/** Simple grid-based clustering: points within the same lat/lon cell (cell
 * size shrinks as zoom increases) are merged into one bubble showing a
 * count, so the ~4,000-point overlay never renders that many raw SVG nodes
 * at once. */
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
    const maxScore = Math.max(...group.map((p) => p.composite_score ?? 0));
    const worstSeverity = group.reduce<string>((worst, p) => {
      const order = ["Low", "Medium", "High", "Critical"];
      if (!p.severity) return worst;
      return order.indexOf(p.severity) > order.indexOf(worst) ? p.severity : worst;
    }, "Low");
    return { lat, lon, count: group.length, maxScore, worstSeverity, points: group };
  });
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
  const { data: states, isLoading: statesLoading, isError: statesError, error: statesErr, refetch: refetchStates } = useGeoStates(metric);
  const { data: points, isLoading: pointsLoading } = useGeoPoints();
  const { data: nameMap } = useStateNameMap();
  const [zoom, setZoom] = useState(1);
  const [center, setCenter] = useState<[number, number]>([82, 22]);

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

  const clusters = useMemo(() => clusterPoints(points ?? [], zoom), [points, zoom]);

  if (statesLoading || pointsLoading) return <CardSkeleton className="h-full w-full" />;
  if (statesError) return <ErrorState message={(statesErr as Error)?.message} onRetry={refetchStates} />;

  return (
    <TooltipProvider delayDuration={150}>
      <div className="flex h-full w-full flex-col gap-2">
        {!compact && (
          <div className="flex flex-wrap gap-1">
            {MAP_MODES.map((m) => (
              <button
                key={m.value}
                onClick={() => setMetric(m.value)}
                className={`rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors ${
                  metric === m.value
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-card text-muted-foreground hover:bg-accent"
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>
        )}
        <div className="relative min-h-0 flex-1 overflow-hidden rounded-md border border-border bg-muted/20">
        <ComposableMap
          projection="geoMercator"
          projectionConfig={{ scale: compact ? 700 : 1000, center: [82, 22] }}
          width={800}
          height={compact ? 420 : 620}
          style={{ width: "100%", height: "100%" }}
        >
          <ZoomableGroup center={center} zoom={zoom} onMoveEnd={({ zoom: z, coordinates }) => {
            setZoom(z);
            setCenter(coordinates);
          }} minZoom={1} maxZoom={8}>
            <Geographies geography={GEO_URL}>
              {({ geographies }) =>
                geographies.map((geo) => {
                  const rawName: string = geo.properties.state;
                  const canonical = nameMap?.aliases[rawName.trim().toLowerCase()] ?? rawName;
                  const agg = scoreByState.get(canonical);
                  return (
                    <Tooltip key={geo.rsmKey}>
                      <TooltipTrigger asChild>
                        <Geography
                          geography={geo}
                          onClick={() => onStateClick?.(canonical)}
                          style={{
                            default: {
                              fill: agg ? scoreColor(agg.metricValue) : "var(--muted)",
                              stroke: "var(--background)",
                              strokeWidth: 0.5,
                              outline: "none",
                              cursor: onStateClick ? "pointer" : "default",
                              transition: "fill 120ms ease",
                            },
                            hover: {
                              fill: agg ? scoreColor(agg.metricValue) : "var(--muted)",
                              stroke: "var(--foreground)",
                              strokeWidth: 1,
                              outline: "none",
                              opacity: 0.85,
                              cursor: onStateClick ? "pointer" : "default",
                            },
                            pressed: { fill: "var(--primary)", outline: "none" },
                          }}
                        />
                      </TooltipTrigger>
                      <TooltipContent className="text-xs">
                        <p className="font-medium">{canonical}</p>
                        {agg ? (
                          <>
                            <p>{agg.count.toLocaleString("en-IN")} works · avg score {agg.score.toFixed(0)}</p>
                            {metric !== "overall" && (
                              <p>{MAP_MODES.find((m) => m.value === metric)?.label}: {agg.metricValue.toFixed(0)}%</p>
                            )}
                            <p>{agg.critical} critical · {agg.high} high</p>
                            {agg.top && <p className="text-muted-foreground">Top signal: {agg.top.replaceAll("_", " ")}</p>}
                          </>
                        ) : (
                          <p className="text-muted-foreground">No works recorded</p>
                        )}
                      </TooltipContent>
                    </Tooltip>
                  );
                })
              }
            </Geographies>

            {clusters.map((c, i) => (
              <Marker key={i} coordinates={[c.lon, c.lat]}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <circle
                      r={c.count > 1 ? Math.min(14, 5 + Math.log2(c.count) * 2) : 4}
                      fill={SEVERITY_DOT[c.worstSeverity] ?? "var(--muted-foreground)"}
                      fillOpacity={0.85}
                      stroke="var(--background)"
                      strokeWidth={1}
                      className="cursor-pointer"
                      onClick={() => {
                        const only = c.points[0];
                        if (c.count === 1 && only) {
                          navigate({ to: "/project-investigation", search: { work_id: only.work_id } });
                        } else {
                          setZoom((z) => Math.min(8, z * 2));
                          setCenter([c.lon, c.lat]);
                        }
                      }}
                    />
                  </TooltipTrigger>
                  <TooltipContent className="text-xs">
                    {c.count === 1 && c.points[0] ? (
                      <>
                        <p className="font-medium">{c.points[0].work_category ?? "Work"}</p>
                        <p>Severity: {c.points[0].severity ?? "—"} · score {c.points[0].composite_score?.toFixed(0) ?? "—"}</p>
                      </>
                    ) : (
                      <p>{c.count} synthetic geo-tagged works · click to zoom in</p>
                    )}
                  </TooltipContent>
                </Tooltip>
              </Marker>
            ))}
          </ZoomableGroup>
        </ComposableMap>

        <div className="absolute bottom-2 left-2 rounded-md border border-border bg-card/90 px-2 py-1 text-[10px] text-muted-foreground backdrop-blur">
          Choropleth: {MAP_MODES.find((m) => m.value === metric)?.label.toLowerCase()} by state · dots: synthetic geo-tagged works (
          {(points ?? []).length.toLocaleString("en-IN")})
        </div>
        </div>
      </div>
    </TooltipProvider>
  );
}
