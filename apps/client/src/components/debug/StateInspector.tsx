import type { Metric } from "@qr-relay/core";

type Player = { id: string; name: string };

type Props = {
  state: unknown;
  metrics: Metric[];
  players: Player[];
  tokenHolderId: string | null;
};

export function StateInspector({ state, metrics, players, tokenHolderId }: Props) {
  const holder = tokenHolderId
    ? (players.find((p) => p.id === tokenHolderId) ?? null)
    : null;
  return (
    <section className="flex flex-col gap-2 rounded-[var(--radius-md)] border border-border bg-card p-3">
      <header className="flex items-center justify-between gap-2">
        <h3 className="m-0 text-sm font-extrabold uppercase tracking-[0.14em] text-muted-foreground">
          state inspector
        </h3>
        {holder && (
          <span className="rounded-full bg-primary/20 px-2.5 py-0.5 text-[12px] font-bold text-primary">
            token: {holder.name}
          </span>
        )}
      </header>
      <div className="grid grid-cols-1 gap-2 md:grid-cols-[1fr,1fr]">
        <div>
          <p className="mb-1 text-[11px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
            metrics
          </p>
          {metrics.length === 0 ? (
            <p className="m-0 text-sm text-muted-foreground">なし</p>
          ) : (
            <ul className="m-0 list-none space-y-1 p-0 text-[12px]">
              {metrics.map((m, i) => (
                <li
                  key={`${m.label}-${i}`}
                  className="flex items-baseline justify-between gap-2 rounded-sm bg-muted/30 px-2 py-1"
                >
                  <span className="truncate">{m.label}</span>
                  <span className="font-mono tabular-nums">{formatMetric(m)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div>
          <p className="mb-1 text-[11px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
            state
          </p>
          <pre className="m-0 max-h-[280px] overflow-auto rounded-sm bg-muted/30 p-2 text-[11px] leading-snug">
            {JSON.stringify(state, null, 2)}
          </pre>
        </div>
      </div>
    </section>
  );
}

function formatMetric(m: Metric): string {
  if (m.kind === "count") return String(m.total);
  if (m.kind === "time") return `${m.ms}ms`;
  if (m.kind === "score") return `${Object.keys(m.byPlayer).length} players`;
  return JSON.stringify(m);
}
