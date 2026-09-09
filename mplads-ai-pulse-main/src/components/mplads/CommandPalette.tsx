import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { FileSearch, MapPin, User } from "lucide-react";

import { CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { useWorks, useMps } from "@/lib/hooks";
import { useGeoStates } from "@/lib/hooks";

/** Global ⌘K / Ctrl+K search across MPs, works, contractors and states --
 * an enterprise command-palette pattern, not a full-text search engine: it
 * debounces onto the same filtered list endpoints every other screen uses. */
export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const navigate = useNavigate();

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, []);

  // Debounced so rapid typing doesn't fire a network request per keystroke --
  // cmdk also does its own client-side re-filtering of whatever is rendered,
  // which is harmless here since the server-filtered set is always a subset.
  useEffect(() => {
    const handle = setTimeout(() => setDebounced(query), 250);
    return () => clearTimeout(handle);
  }, [query]);

  const worksQuery = useWorks({ search: debounced || undefined, limit: 6 });
  const mpsQuery = useMps({ search: debounced || undefined, limit: 6 });
  const { data: states } = useGeoStates();

  const matchingStates = debounced
    ? (states ?? []).filter((s) => s.state.toLowerCase().includes(debounced.toLowerCase())).slice(0, 4)
    : [];

  const go = (to: string, search?: Record<string, string>) => {
    setOpen(false);
    setQuery("");
    navigate({ to, search } as never);
  };

  return (
    // shouldFilter=false: results are already filtered server-side (by
    // fields like district that aren't even rendered in the item), so cmdk's
    // own default client-side re-filter-by-visible-text would just hide
    // correct matches instead of adding value.
    <CommandDialog open={open} onOpenChange={setOpen} shouldFilter={false}>
      <CommandInput placeholder="Search work ID, MP, contractor, state, district…" value={query} onValueChange={setQuery} />
      <CommandList>
        <CommandEmpty>{query ? "No matches." : "Type to search across the whole dataset."}</CommandEmpty>

        {matchingStates.length > 0 && (
          <CommandGroup heading="States">
            {matchingStates.map((s) => (
              <CommandItem key={s.state} onSelect={() => go("/state-intelligence", { state: s.state })}>
                <MapPin className="mr-2 h-4 w-4" />
                {s.state}
                <span className="ml-auto text-xs text-muted-foreground">{s.work_count.toLocaleString("en-IN")} works</span>
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        {(mpsQuery.data?.items.length ?? 0) > 0 && (
          <CommandGroup heading="Members of Parliament">
            {mpsQuery.data!.items.map((mp) => (
              <CommandItem key={mp.mp_id} onSelect={() => go("/mp-intelligence", { mp_id: mp.mp_id })}>
                <User className="mr-2 h-4 w-4" />
                {mp.name}
                <span className="ml-auto text-xs text-muted-foreground">{mp.state}</span>
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        {(worksQuery.data?.items.length ?? 0) > 0 && (
          <CommandGroup heading="Works">
            {worksQuery.data!.items.map((w) => (
              <CommandItem key={w.work_id} onSelect={() => go("/project-investigation", { work_id: w.work_id })}>
                <FileSearch className="mr-2 h-4 w-4" />
                <span className="truncate">{w.work_description || w.work_id}</span>
                <span className="ml-auto text-xs text-muted-foreground">{w.severity ?? "—"}</span>
              </CommandItem>
            ))}
          </CommandGroup>
        )}
      </CommandList>
    </CommandDialog>
  );
}
