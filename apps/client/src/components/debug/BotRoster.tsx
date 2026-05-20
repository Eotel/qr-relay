import { Button } from "@qr-relay/ui/button";
import { useState } from "react";
import type { BotEntry } from "../../lib/debug/bot-pool.js";

export type RemoteBotEntry = {
  id: string;
  name: string;
};

type Props = {
  bots: BotEntry[];
  remoteBots: RemoteBotEntry[];
  busy: boolean;
  onAdd: (n: number) => void;
  onAddHost: () => void;
  onRemove: (id: string) => void;
  onRemoveRemote: (id: string) => void;
  onRename: (id: string, name: string) => void;
  onDisconnect: (id: string) => void;
  onReconnect: (id: string) => void;
  onDisconnectAll: () => void;
  onReconnectAll: () => void;
  onClear: () => void;
};

const READY_STATE_LABEL: Record<number, string> = {
  0: "CONNECTING",
  1: "OPEN",
  2: "CLOSING",
  3: "CLOSED",
};

export function BotRoster({
  bots,
  remoteBots,
  busy,
  onAdd,
  onAddHost,
  onRemove,
  onRemoveRemote,
  onRename,
  onDisconnect,
  onReconnect,
  onDisconnectAll,
  onReconnectAll,
  onClear,
}: Props) {
  const total = bots.length + remoteBots.length;
  return (
    <section className="flex flex-col gap-2 rounded-[var(--radius-md)] border border-border bg-card p-3">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="m-0 text-sm font-extrabold uppercase tracking-[0.14em] text-muted-foreground">
          bot roster ({total})
          {remoteBots.length > 0 ? (
            <span className="ml-1 font-mono text-[10px] font-bold text-muted-foreground/80">
              ({bots.length} local + {remoteBots.length} remote)
            </span>
          ) : null}
        </h3>
        <div className="flex flex-wrap items-center gap-1.5">
          <Button type="button" variant="primary" size="pill" disabled={busy} onClick={() => onAdd(1)}>
            +1
          </Button>
          <Button type="button" variant="primary" size="pill" disabled={busy} onClick={() => onAdd(3)}>
            +3
          </Button>
          <Button
            type="button"
            variant="primary"
            size="pill"
            disabled={busy}
            onClick={() => onAdd(10)}
          >
            +10
          </Button>
          <Button type="button" variant="outline" size="pill" disabled={busy} onClick={onAddHost}>
            +host bot
          </Button>
          <Button type="button" variant="outline" size="pill" onClick={onDisconnectAll}>
            全 disconnect
          </Button>
          <Button type="button" variant="outline" size="pill" onClick={onReconnectAll}>
            全 reconnect
          </Button>
          <Button type="button" variant="outline" size="pill" onClick={onClear}>
            全削除
          </Button>
        </div>
      </header>
      <div className="max-h-[320px] overflow-auto rounded-md border border-border/50 bg-background/60">
        {total === 0 ? (
          <p className="m-0 p-3 text-sm text-muted-foreground">bot がいません。+1 で追加。</p>
        ) : (
          <table className="w-full border-collapse text-[12px]">
            <thead className="sticky top-0 bg-card text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
              <tr>
                <th className="px-2 py-1 text-left font-bold">id</th>
                <th className="px-2 py-1 text-left font-bold">name</th>
                <th className="px-2 py-1 text-left font-bold">role</th>
                <th className="px-2 py-1 text-left font-bold">ws</th>
                <th className="px-2 py-1 text-right font-bold">sent</th>
                <th className="px-2 py-1 text-right font-bold">err</th>
                <th className="px-2 py-1 text-left font-bold">last target</th>
                <th className="px-2 py-1 text-right font-bold">ops</th>
              </tr>
            </thead>
            <tbody>
              {bots.map((b) => (
                <BotRow
                  key={b.id}
                  bot={b}
                  onRemove={onRemove}
                  onRename={onRename}
                  onDisconnect={onDisconnect}
                  onReconnect={onReconnect}
                />
              ))}
              {remoteBots.map((b) => (
                <RemoteBotRow key={b.id} bot={b} onRemove={onRemoveRemote} />
              ))}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
}

function RemoteBotRow({
  bot,
  onRemove,
}: {
  bot: RemoteBotEntry;
  onRemove: (id: string) => void;
}) {
  return (
    <tr className="border-t border-border/40 bg-muted/10">
      <td className="px-2 py-1 font-mono text-[11px] text-muted-foreground" title={bot.id}>
        {bot.id.slice(0, 8)}
      </td>
      <td className="px-2 py-1 text-muted-foreground">{bot.name}</td>
      <td className="px-2 py-1">
        <span className="rounded-full bg-muted/40 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider">
          remote
        </span>
      </td>
      <td className="px-2 py-1 text-muted-foreground" colSpan={4}>
        他タブが作成 — このタブからは制御不可
      </td>
      <td className="px-2 py-1 text-right">
        <button
          type="button"
          onClick={() => onRemove(bot.id)}
          className="rounded bg-destructive/20 px-1.5 py-0.5 text-[10px] font-bold text-destructive hover:bg-destructive/30"
        >
          ×
        </button>
      </td>
    </tr>
  );
}

function BotRow({
  bot,
  onRemove,
  onRename,
  onDisconnect,
  onReconnect,
}: {
  bot: BotEntry;
  onRemove: (id: string) => void;
  onRename: (id: string, name: string) => void;
  onDisconnect: (id: string) => void;
  onReconnect: (id: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(bot.name);
  const commit = () => {
    setEditing(false);
    if (draft && draft !== bot.name) onRename(bot.id, draft);
  };
  const isOpen = bot.status.readyState === 1;
  return (
    <tr className="border-t border-border/40">
      <td className="px-2 py-1 font-mono text-[11px] text-muted-foreground" title={bot.id}>
        {bot.id.slice(0, 8)}
      </td>
      <td className="px-2 py-1">
        {editing ? (
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === "Enter") commit();
              if (e.key === "Escape") {
                setDraft(bot.name);
                setEditing(false);
              }
            }}
            autoFocus
            className="h-7 rounded-sm border border-border bg-background px-1 text-[12px]"
          />
        ) : (
          <button
            type="button"
            className="text-left underline-offset-2 hover:underline"
            onClick={() => {
              setDraft(bot.name);
              setEditing(true);
            }}
          >
            {bot.name}
          </button>
        )}
      </td>
      <td className="px-2 py-1">
        <span
          className={
            bot.role === "host"
              ? "rounded-full bg-secondary/30 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-secondary-foreground"
              : "rounded-full bg-muted/40 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider"
          }
        >
          {bot.role}
        </span>
      </td>
      <td className="px-2 py-1">
        <span
          className={
            isOpen
              ? "rounded-full bg-secondary/30 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-secondary-foreground"
              : "rounded-full bg-destructive/20 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-destructive"
          }
        >
          {READY_STATE_LABEL[bot.status.readyState] ?? bot.status.readyState}
        </span>
      </td>
      <td className="px-2 py-1 text-right font-mono tabular-nums">{bot.status.sentCount}</td>
      <td
        className={
          bot.status.errorCount > 0
            ? "px-2 py-1 text-right font-mono tabular-nums text-destructive"
            : "px-2 py-1 text-right font-mono tabular-nums"
        }
        title={bot.status.lastError ?? undefined}
      >
        {bot.status.errorCount}
      </td>
      <td
        className="px-2 py-1 font-mono text-[11px] text-muted-foreground"
        title={bot.status.lastTargetId ?? undefined}
      >
        {bot.status.lastTargetId ? bot.status.lastTargetId.slice(0, 8) : "—"}
      </td>
      <td className="px-2 py-1 text-right">
        <div className="inline-flex items-center gap-1">
          {isOpen ? (
            <button
              type="button"
              onClick={() => onDisconnect(bot.id)}
              className="rounded bg-muted/40 px-1.5 py-0.5 text-[10px] font-bold hover:bg-muted/60"
            >
              disc
            </button>
          ) : (
            <button
              type="button"
              onClick={() => onReconnect(bot.id)}
              className="rounded bg-primary/20 px-1.5 py-0.5 text-[10px] font-bold text-primary hover:bg-primary/30"
            >
              re
            </button>
          )}
          <button
            type="button"
            onClick={() => onRemove(bot.id)}
            className="rounded bg-destructive/20 px-1.5 py-0.5 text-[10px] font-bold text-destructive hover:bg-destructive/30"
          >
            ×
          </button>
        </div>
      </td>
    </tr>
  );
}
