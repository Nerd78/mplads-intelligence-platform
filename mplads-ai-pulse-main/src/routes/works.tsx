import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { X } from "lucide-react";

import { WorksTable } from "@/components/mplads/WorksTable";
import { Panel, PageHeader } from "@/components/mplads/Panel";
import {
  AnomalySelect,
  CategorySelect,
  DataSourceSelect,
  FilterBar,
  SearchInput,
  SeveritySelect,
  StateSelect,
} from "@/components/mplads/filters";
import type { Loose } from "@/lib/types";

type Search = Loose<{
  state: string;
  work_category: string;
  data_source: string;
  severity: string;
  flag: string;
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
    flag: typeof search["flag"] === "string" ? search["flag"] : undefined,
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

  const activeCount = [
    search.search,
    search.state,
    search.work_category,
    search.severity,
    search.data_source,
    search.flag,
  ].filter(Boolean).length;

  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow="Investigations"
        title="Works"
        description="Full, server-paginated register of every loaded work — filter, sort and search across all 111K+ records."
      />

      {/*
        This page owns its filters in the URL so a filtered view is
        shareable, so WorksTable's built-in toolbar is switched off here
        (searchable={false}) -- otherwise the page shows two competing
        sets of the same controls.
      */}
      <Panel className="p-3">
        <FilterBar>
          <SearchInput value={search.search} onChange={(v) => patch({ search: v })} />
          <StateSelect value={search.state} onChange={(v) => patch({ state: v })} />
          <AnomalySelect value={search.flag} onChange={(v) => patch({ flag: v })} />
          <CategorySelect value={search.work_category} onChange={(v) => patch({ work_category: v })} />
          <SeveritySelect value={search.severity} onChange={(v) => patch({ severity: v })} />
          <DataSourceSelect value={search.data_source} onChange={(v) => patch({ data_source: v })} />
          {activeCount > 0 && (
            <button
              type="button"
              onClick={() =>
                navigate({
                  to: "/works",
                  search: { offset: 0, ...(search.sort ? { sort: search.sort } : {}) },
                })
              }
              className="flex items-center gap-1 rounded-md border border-border-strong bg-surface px-2 py-1 text-[11px] font-medium text-ink-muted transition-colors hover:border-blue-300 hover:text-blue-800"
            >
              <X className="h-3 w-3" />
              Clear {activeCount}
            </button>
          )}
        </FilterBar>
      </Panel>

      <WorksTable
        filters={search}
        searchable={false}
        onPageChange={(offset) => navigate({ to: "/works", search: { ...search, offset } })}
        onSortChange={(sort) => patch({ sort })}
      />
    </div>
  );
}
