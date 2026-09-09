import { createFileRoute, useNavigate } from "@tanstack/react-router";

import { WorksTable } from "@/components/mplads/WorksTable";
import { CategorySelect, DataSourceSelect, FilterBar, SearchInput, SeveritySelect, StateSelect } from "@/components/mplads/filters";
import type { Loose } from "@/lib/types";

type Search = Loose<{
  state: string;
  work_category: string;
  data_source: string;
  severity: string;
  search: string;
  sort: string;
  offset: number;
}>;

export const Route = createFileRoute("/works")({
  head: () => ({ meta: [{ title: "Works — MPLADS Intelligence" }] }),
  validateSearch: (search: Record<string, unknown>): Search => ({
    state: typeof search["state"] === "string" ? search["state"] : undefined,
    work_category: typeof search["work_category"] === "string" ? search["work_category"] : undefined,
    data_source: typeof search["data_source"] === "string" ? search["data_source"] : undefined,
    severity: typeof search["severity"] === "string" ? search["severity"] : undefined,
    search: typeof search["search"] === "string" ? search["search"] : undefined,
    sort: typeof search["sort"] === "string" ? search["sort"] : undefined,
    offset: Number(search["offset"]) || 0,
  }),
  component: WorksPage,
});

function WorksPage() {
  const navigate = useNavigate();
  const search = Route.useSearch();

  const patch = (p: Partial<Search>) => navigate({ to: "/works", search: { ...search, offset: 0, ...p } });

  return (
    <div className="space-y-4">
      <div>
        <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Investigations</p>
        <h2 className="text-lg font-semibold text-foreground">Works</h2>
        <p className="text-sm text-muted-foreground">Full, server-paginated register of every loaded work — filter, sort and search across all 111K+ records.</p>
      </div>

      <FilterBar>
        <SearchInput value={search.search} onChange={(v) => patch({ search: v })} />
        <StateSelect value={search.state} onChange={(v) => patch({ state: v })} />
        <CategorySelect value={search.work_category} onChange={(v) => patch({ work_category: v })} />
        <SeveritySelect value={search.severity} onChange={(v) => patch({ severity: v })} />
        <DataSourceSelect value={search.data_source} onChange={(v) => patch({ data_source: v })} />
      </FilterBar>

      <WorksTable
        filters={search}
        onPageChange={(offset) => navigate({ to: "/works", search: { ...search, offset } })}
        onSortChange={(sort) => patch({ sort })}
      />
    </div>
  );
}
