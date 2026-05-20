import { Button } from "@qr-relay/ui/button";
import { cn } from "@qr-relay/ui/cn";
import { useState } from "react";
import type { BotEntry } from "../../lib/debug/bot-pool.js";
import { EDGE_CASES, type EdgeCaseId } from "../../lib/debug/edge-cases.js";
import type { AutonomyConfig, AutonomyMode } from "./types.js";

type TabId = "manual" | "autonomy" | "scenarios" | "edge";

type ManualProps = {
  bots: BotEntry[];
  onSendScan: (scannerId: string, targetId: string) => void;
  onRandomOnce: () => void;
  onAllPairsBurst: () => void;
  randomLoop: { running: boolean; intervalMs: number };
  onToggleRandomLoop: () => void;
  onChangeRandomInterval: (ms: number) => void;
};

type AutonomyProps = {
  bots: BotEntry[];
  configs: Map<string, AutonomyConfig>;
  globalRunning: boolean;
  onToggleGlobal: () => void;
  onSetMode: (botId: string, mode: AutonomyMode) => void;
  onSetInterval: (botId: string, ms: number) => void;
  onSetStopAfter: (botId: string, n: number | null) => void;
  onResetCounters: () => void;
};

type ScenariosProps = {
  bots: BotEntry[];
  onRoundRobin: () => void;
  onAllToAll: () => void;
  storm: { rateHz: number; durationMs: number };
  onSetStorm: (next: { rateHz: number; durationMs: number }) => void;
  onRandomStorm: () => void;
  tokenRelay: { steps: number };
  onSetTokenRelay: (next: { steps: number }) => void;
  onTokenRelay: () => void;
};

type EdgeProps = {
  bots: BotEntry[];
  hasSuccessNonce: boolean;
  onFire: (caseId: EdgeCaseId, scannerId: string, targetId: string) => void;
};

type Props = ManualProps & AutonomyProps & ScenariosProps & EdgeProps;

export function ScanControls(props: Props) {
  const [tab, setTab] = useState<TabId>("manual");
  return (
    <section className="flex flex-col gap-2 rounded-[var(--radius-md)] border border-border bg-card p-3">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="m-0 text-sm font-extrabold uppercase tracking-[0.14em] text-muted-foreground">
          scan controls
        </h3>
        <nav className="flex gap-1" aria-label="tabs">
          {(["manual", "autonomy", "scenarios", "edge"] as TabId[]).map((id) => (
            <button
              type="button"
              key={id}
              aria-pressed={tab === id}
              onClick={() => setTab(id)}
              className={cn(
                "rounded-full px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wider",
                tab === id
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted/40 hover:bg-muted/60 text-foreground",
              )}
            >
              {id}
            </button>
          ))}
        </nav>
      </header>
      {tab === "manual" && <ManualTab {...props} />}
      {tab === "autonomy" && <AutonomyTab {...props} />}
      {tab === "scenarios" && <ScenariosTab {...props} />}
      {tab === "edge" && <EdgeTab {...props} />}
    </section>
  );
}

function ManualTab(p: ManualProps) {
  const [scannerId, setScannerId] = useState<string>("");
  const [targetId, setTargetId] = useState<string>("");
  const candidates = p.bots;
  const scanner = scannerId || candidates[0]?.id || "";
  const targets = candidates.filter((b) => b.id !== scanner);
  const target = targetId && targets.some((t) => t.id === targetId) ? targetId : targets[0]?.id ?? "";
  return (
    <div className="flex flex-col gap-2">
      <div className="grid grid-cols-1 gap-2 md:grid-cols-[1fr,1fr,auto]">
        <BotSelect label="scanner" bots={candidates} value={scanner} onChange={setScannerId} />
        <BotSelect label="scanned" bots={targets} value={target} onChange={setTargetId} />
        <Button
          type="button"
          variant="primary"
          size="submit"
          className="w-auto"
          disabled={!scanner || !target}
          onClick={() => p.onSendScan(scanner, target)}
        >
          scan
        </Button>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="pill"
          disabled={candidates.length < 2}
          onClick={p.onRandomOnce}
        >
          ランダム 1 回
        </Button>
        <Button
          type="button"
          variant="outline"
          size="pill"
          disabled={candidates.length < 2}
          onClick={p.onAllPairsBurst}
        >
          全ペア順に発火
        </Button>
        <div className="flex items-center gap-1.5">
          <label className="text-[11px] uppercase tracking-wider text-muted-foreground" htmlFor="random-interval">
            interval(ms)
          </label>
          <input
            id="random-interval"
            type="number"
            min={100}
            step={100}
            value={p.randomLoop.intervalMs}
            onChange={(e) => p.onChangeRandomInterval(Number(e.target.value) || 500)}
            className="h-7 w-20 rounded-sm border border-border bg-background px-1 text-[12px]"
          />
          <Button
            type="button"
            variant={p.randomLoop.running ? "primary" : "outline"}
            size="pill"
            disabled={candidates.length < 2}
            onClick={p.onToggleRandomLoop}
          >
            {p.randomLoop.running ? "stop loop" : "start loop"}
          </Button>
        </div>
      </div>
    </div>
  );
}

function AutonomyTab(p: AutonomyProps) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant={p.globalRunning ? "primary" : "outline"}
          size="pill"
          onClick={p.onToggleGlobal}
        >
          {p.globalRunning ? "pause all" : "play all"}
        </Button>
        <Button type="button" variant="outline" size="pill" onClick={p.onResetCounters}>
          reset counters
        </Button>
      </div>
      <div className="max-h-[280px] overflow-auto rounded-md border border-border/50 bg-background/60">
        {p.bots.length === 0 ? (
          <p className="m-0 p-3 text-sm text-muted-foreground">bot がいません。</p>
        ) : (
          <table className="w-full border-collapse text-[12px]">
            <thead className="sticky top-0 bg-card text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
              <tr>
                <th className="px-2 py-1 text-left">bot</th>
                <th className="px-2 py-1 text-left">mode</th>
                <th className="px-2 py-1 text-left">target</th>
                <th className="px-2 py-1 text-right">interval</th>
                <th className="px-2 py-1 text-right">stopAfter</th>
                <th className="px-2 py-1 text-right">sent</th>
              </tr>
            </thead>
            <tbody>
              {p.bots.map((b) => {
                const cfg = p.configs.get(b.id);
                const mode = cfg?.mode ?? { kind: "idle" };
                const interval = cfg?.intervalMs ?? 1000;
                const stopAfter = cfg?.stopAfter;
                const sent = cfg?.sentInRun ?? 0;
                const otherBots = p.bots.filter((x) => x.id !== b.id);
                return (
                  <tr key={b.id} className="border-t border-border/40">
                    <td className="px-2 py-1">{b.name}</td>
                    <td className="px-2 py-1">
                      <select
                        value={mode.kind}
                        onChange={(e) => {
                          const k = e.target.value as AutonomyMode["kind"];
                          if (k === "target") {
                            const t = otherBots[0]?.id ?? b.id;
                            p.onSetMode(b.id, { kind: "target", targetId: t });
                          } else {
                            p.onSetMode(b.id, { kind: k } as AutonomyMode);
                          }
                        }}
                        className="h-7 rounded-sm border border-border bg-background px-1 text-[12px]"
                      >
                        <option value="idle">idle</option>
                        <option value="random">random</option>
                        <option value="roundRobin">round-robin</option>
                        <option value="target">target</option>
                        <option value="tokenChase">tokenChase</option>
                      </select>
                    </td>
                    <td className="px-2 py-1">
                      {mode.kind === "target" ? (
                        <select
                          value={mode.targetId}
                          onChange={(e) =>
                            p.onSetMode(b.id, { kind: "target", targetId: e.target.value })
                          }
                          className="h-7 rounded-sm border border-border bg-background px-1 text-[12px]"
                        >
                          {otherBots.map((o) => (
                            <option key={o.id} value={o.id}>
                              {o.name}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-2 py-1 text-right">
                      <input
                        type="number"
                        min={100}
                        step={100}
                        value={interval}
                        onChange={(e) => p.onSetInterval(b.id, Number(e.target.value) || 1000)}
                        className="h-7 w-20 rounded-sm border border-border bg-background px-1 text-right text-[12px]"
                      />
                    </td>
                    <td className="px-2 py-1 text-right">
                      <input
                        type="number"
                        min={0}
                        step={1}
                        value={stopAfter ?? 0}
                        placeholder="0=∞"
                        onChange={(e) => {
                          const v = Number(e.target.value);
                          p.onSetStopAfter(b.id, v > 0 ? v : null);
                        }}
                        className="h-7 w-20 rounded-sm border border-border bg-background px-1 text-right text-[12px]"
                      />
                    </td>
                    <td className="px-2 py-1 text-right font-mono tabular-nums">{sent}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function ScenariosTab(p: ScenariosProps) {
  return (
    <div className="flex flex-col gap-2">
      <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
        <ScenarioCard
          title="round-robin chain"
          description="bot[i] → bot[i+1] を順に 1 周。"
          action={
            <Button
              type="button"
              variant="primary"
              size="pill"
              disabled={p.bots.length < 2}
              onClick={p.onRoundRobin}
            >
              fire
            </Button>
          }
        />
        <ScenarioCard
          title="all-to-all burst"
          description="全 (i, j) 組み合わせ (i≠j) を burst で。"
          action={
            <Button
              type="button"
              variant="primary"
              size="pill"
              disabled={p.bots.length < 2}
              onClick={p.onAllToAll}
            >
              fire
            </Button>
          }
        />
        <ScenarioCard
          title="random storm"
          description={`rate × duration ÷ 1000 個のランダム scan を burst 送信。`}
          action={
            <div className="flex items-center gap-1.5">
              <label className="text-[11px] uppercase tracking-wider text-muted-foreground">
                Hz
              </label>
              <input
                type="number"
                min={1}
                value={p.storm.rateHz}
                onChange={(e) =>
                  p.onSetStorm({ ...p.storm, rateHz: Math.max(1, Number(e.target.value) || 1) })
                }
                className="h-7 w-16 rounded-sm border border-border bg-background px-1 text-right text-[12px]"
              />
              <label className="text-[11px] uppercase tracking-wider text-muted-foreground">
                ms
              </label>
              <input
                type="number"
                min={100}
                step={100}
                value={p.storm.durationMs}
                onChange={(e) =>
                  p.onSetStorm({
                    ...p.storm,
                    durationMs: Math.max(100, Number(e.target.value) || 100),
                  })
                }
                className="h-7 w-20 rounded-sm border border-border bg-background px-1 text-right text-[12px]"
              />
              <Button
                type="button"
                variant="primary"
                size="pill"
                disabled={p.bots.length < 2}
                onClick={p.onRandomStorm}
              >
                fire
              </Button>
            </div>
          }
        />
        <ScenarioCard
          title="token relay"
          description="token holder → ランダム target を N step。"
          action={
            <div className="flex items-center gap-1.5">
              <label className="text-[11px] uppercase tracking-wider text-muted-foreground">
                steps
              </label>
              <input
                type="number"
                min={1}
                value={p.tokenRelay.steps}
                onChange={(e) =>
                  p.onSetTokenRelay({ steps: Math.max(1, Number(e.target.value) || 1) })
                }
                className="h-7 w-16 rounded-sm border border-border bg-background px-1 text-right text-[12px]"
              />
              <Button
                type="button"
                variant="primary"
                size="pill"
                disabled={p.bots.length < 2}
                onClick={p.onTokenRelay}
              >
                fire
              </Button>
            </div>
          }
        />
      </div>
    </div>
  );
}

function EdgeTab(p: EdgeProps) {
  const [scannerId, setScannerId] = useState<string>("");
  const [targetId, setTargetId] = useState<string>("");
  const scanner = scannerId || p.bots[0]?.id || "";
  const targets = p.bots.filter((b) => b.id !== scanner);
  const target = targetId && targets.some((t) => t.id === targetId) ? targetId : targets[0]?.id ?? "";
  return (
    <div className="flex flex-col gap-2">
      <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
        <BotSelect label="scanner" bots={p.bots} value={scanner} onChange={setScannerId} />
        <BotSelect label="target" bots={targets} value={target} onChange={setTargetId} />
      </div>
      <ul className="m-0 grid list-none grid-cols-1 gap-1.5 p-0 md:grid-cols-2">
        {EDGE_CASES.map((c) => {
          const disabled = !scanner || (c.id !== "self-scan" && !target) ||
            (c.id === "replay-nonce" && !p.hasSuccessNonce);
          return (
            <li
              key={c.id}
              className="flex items-center justify-between gap-2 rounded-md border border-border/50 bg-background/60 px-2 py-1.5"
            >
              <div className="min-w-0">
                <p className="m-0 truncate text-[12px] font-bold">{c.label}</p>
                {c.precondition && (
                  <p className="m-0 truncate text-[10px] text-muted-foreground">{c.precondition}</p>
                )}
              </div>
              <Button
                type="button"
                variant="outline"
                size="pill"
                disabled={disabled}
                onClick={() => p.onFire(c.id, scanner, target)}
              >
                fire
              </Button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function ScenarioCard({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5 rounded-md border border-border/50 bg-background/60 p-2">
      <p className="m-0 text-[13px] font-extrabold">{title}</p>
      <p className="m-0 text-[11px] text-muted-foreground">{description}</p>
      <div className="flex justify-end">{action}</div>
    </div>
  );
}

function BotSelect({
  label,
  bots,
  value,
  onChange,
}: {
  label: string;
  bots: BotEntry[];
  value: string;
  onChange: (id: string) => void;
}) {
  return (
    <label className="flex flex-col gap-0.5">
      <span className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-9 rounded-sm border border-border bg-background px-2 text-[13px]"
      >
        {bots.length === 0 && <option value="">(no bots)</option>}
        {bots.map((b) => (
          <option key={b.id} value={b.id}>
            {b.name} ({b.id.slice(0, 6)})
          </option>
        ))}
      </select>
    </label>
  );
}
