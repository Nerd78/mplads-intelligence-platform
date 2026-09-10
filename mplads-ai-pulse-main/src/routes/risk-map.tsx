import { createFileRoute, useNavigate } from "@tanstack/react-router";

import { RiskMap } from "@/components/mplads/RiskMap";
import { Panel, PageHeader } from "@/components/mplads/Panel";

export const Route = createFileRoute("/risk-map")({
  head: () => ({ meta: [{ title: "Risk Map — MPLADS Intelligence" }] }),
  component: RiskMapPage,
});

function RiskMapPage() {
  const navigate = useNavigate();

  return (
    <div className="flex h-full flex-col gap-4">
      <PageHeader
        eyebrow="Geospatial"
        title="Risk map"
        description="States are shaded by quintile of average composite risk across all 111K+ works. The dots are the ~3,958 synthetic benchmark works that carry coordinates — real scraped works have no geocoding in this dataset, so they are represented at state and district level instead."
      />
      <Panel className="flex-1">
        <div className="h-[640px] p-3">
          <RiskMap onStateClick={(state) => navigate({ to: "/state-intelligence", search: { state } })} />
        </div>
      </Panel>
    </div>
  );
}
