import { useEffect, useState } from "react";
import { Check, ChevronsUpDown, Search } from "lucide-react";

import { Input } from "@/components/ui/input";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useGeoStates, useStatsOverview, useWorkCategories } from "@/lib/hooks";
import { formatAnomalyLabel } from "@/lib/mplads-data";
import { cn } from "@/lib/utils";

export function FilterBar({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-wrap items-center gap-2">{children}</div>;
}

export type Option = { value: string; label: string; hint?: string };

/**
 * Combobox for filters whose option list is long enough to need typing.
 *
 * A plain Radix Select was unusable for these: 37 states rendered a list that
 * ran the full height of the viewport (its content uses
 * `--radix-select-content-available-height`, so it grows to fill the screen)
 * and offered no way to jump to an entry except scrolling. This caps the list
 * at ~240px, scrolls inside it, and focuses the search box on open so the
 * filter can be driven entirely from the keyboard.
 *
 * Short, fixed lists (severity, data source) stay on Select - a search box
 * over four options is friction, not help.
 */
export function SearchableSelect({
  options,
  value,
  onChange,
  allLabel,
  placeholder,
  width = "w-[190px]",
  disabled,
  searchable = true,
}: {
  options: Option[];
  value?: string | undefined;
  onChange: (v: string | undefined) => void;
  allLabel: string;
  placeholder?: string | undefined;
  width?: string | undefined;
  disabled?: boolean | undefined;
  /** Short, fixed lists skip the search box but keep the identical trigger. */
  searchable?: boolean | undefined;
}) {
  const [open, setOpen] = useState(false);
  const selected = options.find((o) => o.value === value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          role="combobox"
          aria-expanded={open}
          disabled={disabled ?? false}
          className={cn(
            "flex h-8 items-center justify-between gap-1 rounded-md border border-border bg-surface px-2.5 text-xs text-ink",
            "transition-colors hover:border-blue-300 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200",
            "disabled:cursor-not-allowed disabled:bg-surface-sunken disabled:text-ink-subtle",
            width,
          )}
        >
          <span className={cn("truncate", !selected && "text-ink-subtle")}>{selected ? selected.label : allLabel}</span>
          <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 text-ink-subtle" />
        </button>
      </PopoverTrigger>
      <PopoverContent className={cn("p-0", searchable ? "w-[260px]" : "w-[200px]")} align="start">
        <Command>
          {/* autoFocus so the list is typeable the moment it opens */}
          {searchable && <CommandInput autoFocus placeholder={placeholder ?? "Search…"} className="h-9 text-xs" />}
          <CommandList className="max-h-[240px]">
            <CommandEmpty className="py-4 text-center text-xs text-ink-muted">No match.</CommandEmpty>
            <CommandGroup>
              <CommandItem
                value={allLabel}
                onSelect={() => {
                  onChange(undefined);
                  setOpen(false);
                }}
                className="text-xs"
              >
                <Check className={cn("mr-2 h-3.5 w-3.5", value ? "opacity-0" : "opacity-100")} />
                {allLabel}
              </CommandItem>
              {options.map((o) => (
                <CommandItem
                  key={o.value}
                  value={o.label}
                  onSelect={() => {
                    onChange(o.value === value ? undefined : o.value);
                    setOpen(false);
                  }}
                  className="text-xs"
                >
                  <Check className={cn("mr-2 h-3.5 w-3.5", value === o.value ? "opacity-100" : "opacity-0")} />
                  <span className="truncate">{o.label}</span>
                  {o.hint && <span className="ml-auto pl-2 text-[10px] text-ink-subtle tnum">{o.hint}</span>}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

export function StateSelect({ value, onChange }: { value?: string | undefined; onChange: (v: string | undefined) => void }) {
  const { data } = useGeoStates();
  const options = [...(data ?? [])]
    .sort((a, b) => a.state.localeCompare(b.state))
    .map((s) => ({ value: s.state, label: s.state, hint: s.work_count.toLocaleString("en-IN") }));

  return (
    <SearchableSelect
      options={options}
      value={value}
      onChange={onChange}
      allLabel="All states"
      placeholder="Search states…"
    />
  );
}

export function DistrictSelect({
  districts,
  value,
  onChange,
  disabled,
}: {
  districts: string[];
  value?: string | undefined;
  onChange: (v: string | undefined) => void;
  disabled?: boolean | undefined;
}) {
  const options = districts.map((d) => ({ value: d, label: d }));
  return (
    <SearchableSelect
      options={options}
      value={value}
      onChange={onChange}
      allLabel="All districts"
      placeholder="Search districts…"
      disabled={disabled ?? false}
    />
  );
}

const SEVERITIES = ["Low", "Medium", "High", "Critical"];

export function SeveritySelect({ value, onChange }: { value?: string | undefined; onChange: (v: string | undefined) => void }) {
  return (
    <SearchableSelect
      options={SEVERITIES.map((s) => ({ value: s, label: s }))}
      value={value}
      onChange={onChange}
      allLabel="All severities"
      width="w-[150px]"
      searchable={false}
    />
  );
}

/**
 * Categories come from /works/categories, not a hardcoded list. The list used
 * to be pasted in from a one-off query, which meant a re-scrape introducing a
 * new category would silently leave it unfilterable - the option simply would
 * not exist. Counts come along for free and are shown as a hint.
 */
export function CategorySelect({ value, onChange }: { value?: string | undefined; onChange: (v: string | undefined) => void }) {
  const { data } = useWorkCategories();
  const options = (data ?? []).map((c) => ({
    value: c.category,
    label: c.category,
    hint: c.work_count.toLocaleString("en-IN"),
  }));

  return (
    <SearchableSelect
      options={options}
      value={value}
      onChange={onChange}
      allLabel="All categories"
      placeholder="Search categories…"
    />
  );
}

/**
 * Anomaly flags come from the overview's `anomaly_type_counts` rather than a
 * hardcoded list, so the options always match what the current detection run
 * actually produced -- a rule that fires zero times never becomes a filter
 * that returns nothing.
 */
export function AnomalySelect({ value, onChange }: { value?: string | undefined; onChange: (v: string | undefined) => void }) {
  const { data } = useStatsOverview();
  const options = Object.entries(data?.anomaly_type_counts ?? {})
    .filter(([label]) => label !== "NORMAL")
    .sort((a, b) => b[1] - a[1])
    .map(([code, count]) => ({
      value: code,
      label: formatAnomalyLabel(code),
      hint: count.toLocaleString("en-IN"),
    }));

  return (
    <SearchableSelect
      options={options}
      value={value}
      onChange={onChange}
      allLabel="All anomaly types"
      placeholder="Search anomaly types…"
      width="w-[210px]"
    />
  );
}

export function DataSourceSelect({ value, onChange }: { value?: string | undefined; onChange: (v: string | undefined) => void }) {
  return (
    <SearchableSelect
      options={[
        { value: "WEB_SCRAPED_REAL", label: "Real · eSAKSHI" },
        { value: "SYNTHETIC_BENCHMARK", label: "Synthetic · Benchmark" },
      ]}
      value={value}
      onChange={onChange}
      allLabel="All sources"
      width="w-[170px]"
      searchable={false}
    />
  );
}

export function SearchInput({
  value,
  onChange,
  placeholder = "Search work, MP, contractor…",
  delay = 350,
}: {
  value?: string | undefined;
  onChange: (v: string | undefined) => void;
  placeholder?: string | undefined;
  delay?: number | undefined;
}) {
  const [local, setLocal] = useState(value ?? "");

  useEffect(() => setLocal(value ?? ""), [value]);

  useEffect(() => {
    const handle = setTimeout(() => {
      onChange(local.trim() || undefined);
    }, delay);
    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [local]);

  return (
    <div className="relative">
      <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-subtle" />
      <Input
        value={local}
        onChange={(e) => setLocal(e.target.value)}
        placeholder={placeholder}
        className="h-8 w-[240px] pl-7 text-xs"
      />
    </div>
  );
}
