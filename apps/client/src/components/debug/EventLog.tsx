import { Button } from "@qr-relay/ui/button";
import { useMemo, useState } from "react";
import type { EventLogItem } from "./types.js";

type Props = {
  items: EventLogItem[];
  onClear: () => void;
  paused: boolean;
  onTogglePaused: () => void;
};

const TYPE_FILTERS = ["all", "state", "players", "event", "error", "inactivity", "send"] as const;
type Filter = (typeof TYPE_FILTERS)[number];

export function EventLog({ items, onClear, paused, onTogglePaused }: Props) {
  const [filter, setFilter] = useState<Filter>("all");
  const filtered = useMemo(() => {
    if (filter === "all") return items;
    if (filter === "send") return items.filter((i) => i.kind === "send");
    if (filter === "inactivity")
      return items.filter((i) => i.kind === "recv" && i.type.startsWith("inactivity"));
    return items.filter((i) => i.kind === "recv" && i.type === filter);
  }, [items, filter]);

  const onExport = () => {
    const blob = JSON.stringify(items, null, 2);
    void navigator.clipboard?.writeText(blob).catch(() => {});
  };

  return (
    <section className="flex flex-col gap-2 rounded-[var(--radius-md)] border border-border bg-card p-3">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <h3 className="m-0 text-sm font-extrabold uppercase tracking-[0.14em] text-muted-foreground">
            event log
          </h3>
          <span className="rounded-full bg-muted/40 px-2 py-0.5 text-[11px] font-bold tabular-nums">
            {items.length}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex flex-wrap items-center gap-1">
            {TYPE_FILTERS.map((f) => (
              <button
                key={f}
                type="button"
                aria-pressed={filter === f}
                onClick={() => setFilter(f)}
                className={
                  filter === f
                    ? "rounded-full bg-primary px-2.5 py-0.5 text-[11px] font-bold text-primary-foreground"
                    : "rounded-full bg-muted/40 px-2.5 py-0.5 text-[11px] font-bold text-foreground hover:bg-muted/60"
                }
              >
                {f}
              </button>
            ))}
          </div>
          <Button type="button" variant="outline" size="pill" onClick={onTogglePaused}>
            {paused ? "再開" : "一時停止"}
          </Button>
          <Button type="button" variant="outline" size="pill" onClick={onExport}>
            copy JSON
          </Button>
          <Button type="button" variant="outline" size="pill" onClick={onClear}>
            clear
          </Button>
        </div>
      </header>
      <div className="max-h-[280px] overflow-auto rounded-md border border-border/50 bg-background/60">
        {filtered.length === 0 ? (
          <p className="m-0 p-3 text-sm text-muted-foreground">no events</p>
        ) : (
          <ul className="m-0 list-none divide-y divide-border/40 p-0">
            {filtered
              .slice()
              .reverse()
              .map((it, idx) => (
                <EventRow key={`${it.ts}-${idx}`} item={it} />
              ))}
          </ul>
        )}
      </div>
    </section>
  );
}

function EventRow({ item }: { item: EventLogItem }) {
  const [open, setOpen] = useState(false);
  const tsLabel = new Date(item.ts).toISOString().slice(11, 23);
  const tag = item.kind === "recv" ? item.type : "send";
  return (
    <li className="flex flex-col gap-1 px-3 py-2 text-[12px]">
      <button
        type="button"
        onClick={() => setOpen((p) => !p)}
        className="flex items-center justify-between gap-2 text-left"
      >
        <span className="flex items-center gap-2 truncate">
          <span className="font-mono tabular-nums text-muted-foreground">{tsLabel}</span>
          <span
            className={
              item.kind === "send"
                ? "rounded bg-secondary/30 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-secondary-foreground"
                : item.type === "error"
                  ? "rounded bg-destructive/20 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-destructive"
                  : "rounded bg-muted/40 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider"
            }
          >
            {tag}
          </span>
          <span className="truncate">{item.summary}</span>
        </span>
        <span aria-hidden className="text-muted-foreground">
          {open ? "▾" : "▸"}
        </span>
      </button>
      {open && (
        <pre className="m-0 max-h-[180px] overflow-auto rounded-sm bg-muted/30 p-2 text-[11px] leading-snug">
          {JSON.stringify(item.kind === "send" ? item.payload : item.payload, null, 2)}
        </pre>
      )}
    </li>
  );
}
