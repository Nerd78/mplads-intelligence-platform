import { createFileRoute, useNavigate } from "@tanstack/react-router";

import { RiskMap } from "@/components/mplads/RiskMap";
import { Card, CardContent } from "@/components/ui/card";

export const Route = createFileRoute("/risk-map")({
  head: () => ({ meta: [{ title: "Risk Map — MPLADS Intelligence" }] }),
  component: RiskMapPage,
});

function RiskMapPage() {
  const navigate = useNavigate();

  return (
    <div className="flex h-full flex-col gap-4">
      <div>
        <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Geospatial</p>
        <h2 className="text-lg font-semibold text-foreground">Risk map</h2>
        <p className="text-sm text-muted-foreground">
          Every state is colored by its average composite risk score — this covers all 111K+ works. The dots are the ~3,958 synthetic
          benchmark works that carry coordinates; real scraped works don't have geocoding in this dataset, so they're represented at the
          state/district level instead of as individual points.
        </p>
      </div>
      <Card className="flex-1 border-border shadow-none">
        <CardContent className="h-[640px] p-2">
          <RiskMap onStateClick={(state) => navigate({ to: "/state-intelligence", search: { state } })} />
        </CardContent>
      </Card>
    </div>
  );
}
