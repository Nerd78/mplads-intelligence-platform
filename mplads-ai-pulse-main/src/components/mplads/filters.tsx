import { useEffect, useState } from "react";
import { Search } from "lucide-react";

import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useGeoStates } from "@/lib/hooks";

export function FilterBar({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-wrap items-center gap-2">{children}</div>;
}

const ALL = "__all__";

export function StateSelect({ value, onChange }: { value?: string | undefined; onChange: (v: string | undefined) => void }) {
  const { data } = useGeoStates();
  const states = [...(data ?? [])].sort((a, b) => a.state.localeCompare(b.state));
  return (
    <Select value={value ?? ALL} onValueChange={(v) => onChange(v === ALL ? undefined : v)}>
      <SelectTrigger className="h-8 w-[180px] text-xs">
        <SelectValue placeholder="All states" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ALL}>All states</SelectItem>
        {states.map((s) => (
          <SelectItem key={s.state} value={s.state}>
            {s.state}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
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
  return (
    <Select value={value ?? ALL} onValueChange={(v) => onChange(v === ALL ? undefined : v)} disabled={disabled ?? false}>
      <SelectTrigger className="h-8 w-[180px] text-xs">
        <SelectValue placeholder="All districts" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ALL}>All districts</SelectItem>
        {districts.map((d) => (
          <SelectItem key={d} value={d}>
            {d}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

const SEVERITIES = ["Low", "Medium", "High", "Critical"];

export function SeveritySelect({ value, onChange }: { value?: string | undefined; onChange: (v: string | undefined) => void }) {
  return (
    <Select value={value ?? ALL} onValueChange={(v) => onChange(v === ALL ? undefined : v)}>
      <SelectTrigger className="h-8 w-[150px] text-xs">
        <SelectValue placeholder="All severities" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ALL}>All severities</SelectItem>
        {SEVERITIES.map((s) => (
          <SelectItem key={s} value={s}>
            {s}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

// Fixed list -- there is no dedicated "distinct categories" endpoint, and
// this set is stable across the loaded dataset (verified against the DB).
const WORK_CATEGORIES = [
  "Road",
  "Normal/Others",
  "Street Lighting",
  "School Infrastructure",
  "Drinking Water",
  "Community Hall",
  "Public Utility",
  "Sports Infrastructure",
  "Drainage",
  "Repair and Renovation",
  "Sanitation",
  "Health Infrastructure",
  "Trust and Society",
  "Other Public Infrastructure",
  "Bar and Associations",
];

export function CategorySelect({ value, onChange }: { value?: string | undefined; onChange: (v: string | undefined) => void }) {
  return (
    <Select value={value ?? ALL} onValueChange={(v) => onChange(v === ALL ? undefined : v)}>
      <SelectTrigger className="h-8 w-[180px] text-xs">
        <SelectValue placeholder="All categories" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ALL}>All categories</SelectItem>
        {WORK_CATEGORIES.map((c) => (
          <SelectItem key={c} value={c}>
            {c}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function DataSourceSelect({ value, onChange }: { value?: string | undefined; onChange: (v: string | undefined) => void }) {
  return (
    <Select value={value ?? ALL} onValueChange={(v) => onChange(v === ALL ? undefined : v)}>
      <SelectTrigger className="h-8 w-[170px] text-xs">
        <SelectValue placeholder="All sources" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ALL}>All sources</SelectItem>
        <SelectItem value="WEB_SCRAPED_REAL">Real · eSAKSHI</SelectItem>
        <SelectItem value="SYNTHETIC_BENCHMARK">Synthetic · Benchmark</SelectItem>
      </SelectContent>
    </Select>
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
      <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
      <Input
        value={local}
        onChange={(e) => setLocal(e.target.value)}
        placeholder={placeholder}
        className="h-8 w-[240px] pl-7 text-xs"
      />
    </div>
  );
}
