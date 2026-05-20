import type { Phase, ScanPayloadV1 } from "@qr-relay/core";
import { Card } from "@qr-relay/ui/card";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { BotRoster } from "../components/debug/BotRoster.js";
import { EventLog } from "../components/debug/EventLog.js";
import { RoomControl } from "../components/debug/RoomControl.js";
import { ScanControls } from "../components/debug/ScanControls.js";
import { StateInspector } from "../components/debug/StateInspector.js";
import type { AutonomyConfig, AutonomyMode, EventLogItem } from "../components/debug/types.js";
import {
  joinRoom,
  leaveRoom,
  pauseRoom,
  resetRoom,
  resumeRoom,
  startRoom,
} from "../lib/api.js";
import { defaultApiClient } from "../lib/api-client.js";
import { type BotEntry, type BotPool, createBotPool } from "../lib/debug/bot-pool.js";
import { type EdgeCaseId, buildEdgeCasePayload } from "../lib/debug/edge-cases.js";
import {
  type ScanPair,
  allToAllBurst,
  randomStormSteps,
  roundRobinChain,
  tokenRelaySteps,
} from "../lib/debug/scenarios.js";
import { systemRng } from "../lib/rng.js";
import { createWsStore } from "../lib/ws-store.js";

const EVENT_LOG_LIMIT = 500;
const DEFAULT_AUTONOMY_INTERVAL = 1000;

function defaultSocketFactory(url: string): WebSocket {
  return new WebSocket(url);
}

// Observer id is stable per (tab, room code) via sessionStorage. Without this,
// every reload spawned a fresh `debug-observer-*` pid and the previous one
// was left orphaned in the room (visible as duplicated "debug-observer" rows
// in the participants tile until inactivity GC).
function observerPidFor(code: string): string {
  const key = `qr-relay:debug-observer:${code}`;
  if (typeof sessionStorage === "undefined") {
    return `debug-observer-${Math.random().toString(36).slice(2, 10)}`;
  }
  const existing = sessionStorage.getItem(key);
  if (existing) return existing;
  const fresh = `debug-observer-${Math.random().toString(36).slice(2, 10)}`;
  sessionStorage.setItem(key, fresh);
  return fresh;
}

function genBotId(index: number): string {
  return `bot-${Math.random().toString(36).slice(2, 6)}-${index}`;
}

const ADJ = ["やさしい", "はやい", "つよい", "しずかな", "あかるい", "ふしぎな", "きまぐれな"];
const NOUN = ["ウサギ", "ネコ", "イヌ", "パンダ", "ラッコ", "キツネ", "リス", "ペンギン"];
function genBotName(index: number): string {
  const a = ADJ[index % ADJ.length] ?? "やさしい";
  const n = NOUN[(index * 3) % NOUN.length] ?? "ボット";
  return `bot-${a}${n}`;
}

function findTokenHolderId(state: unknown): string | null {
  if (!state || typeof state !== "object") return null;
  const values = (state as { values?: unknown }).values;
  if (!values || typeof values !== "object") return null;
  for (const [id, slot] of Object.entries(values as Record<string, unknown>)) {
    if (slot && typeof slot === "object") {
      const s = slot as { kind?: unknown; has?: unknown };
      if (s.kind === "token" && s.has === true) return id;
    }
  }
  return null;
}

function summarizeRecv(t: string, data: unknown): string {
  if (t === "state") {
    const phase = (data as { phase?: { kind?: string } }).phase?.kind ?? "?";
    const players = (data as { players?: unknown[] }).players?.length ?? 0;
    return `phase=${phase} players=${players}`;
  }
  if (t === "players") {
    return `${(data as { players?: unknown[] }).players?.length ?? 0} players`;
  }
  if (t === "event") {
    const ev = (data as { event?: { kind?: string } }).event;
    return `kind=${ev?.kind ?? "?"}`;
  }
  if (t === "error") {
    return (data as { message?: string }).message ?? "error";
  }
  return t;
}

function buildPayload(
  code: string,
  pid: string,
  ts: number,
  nonce: string,
): ScanPayloadV1 {
  return { v: 1, rid: code, pid, ts, nonce };
}

export function DebugRoom() {
  const { code = "" } = useParams<{ code: string }>();
  const observerPidRef = useRef<string>(observerPidFor(code));

  const wsRef = useRef<ReturnType<typeof createWsStore> | null>(null);
  if (!wsRef.current) {
    wsRef.current = createWsStore({ socketFactory: defaultSocketFactory });
  }
  const useWs = wsRef.current;

  const [connected, setConnected] = useState(false);
  const [phase, setPhase] = useState<Phase>({ kind: "ready" });
  const [state, setState] = useState<unknown>(null);
  const [metrics, setMetrics] = useState<ReturnType<typeof useWs.getState>["metrics"]>([]);
  const [players, setPlayers] = useState<{ id: string; name: string; joinedAt: number }[]>([]);
  const [inactivityCloseAt, setInactivityCloseAt] = useState<number | null>(null);
  const [logItems, setLogItems] = useState<EventLogItem[]>([]);
  const logPausedRef = useRef(false);
  const [logPaused, setLogPaused] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);

  const poolRef = useRef<BotPool | null>(null);
  const [bots, setBots] = useState<BotEntry[]>([]);
  const [busy, setBusy] = useState(false);
  const counterRef = useRef(0);
  const [autonomyConfigs, setAutonomyConfigs] = useState<Map<string, AutonomyConfig>>(new Map());
  const [globalAutonomy, setGlobalAutonomy] = useState(false);
  const autonomyTimersRef = useRef<Map<string, ReturnType<typeof setInterval>>>(new Map());
  const roundRobinIdxRef = useRef(0);
  const [storm, setStorm] = useState({ rateHz: 10, durationMs: 1_000 });
  const [tokenRelay, setTokenRelay] = useState({ steps: 5 });
  const [randomLoop, setRandomLoop] = useState({ running: false, intervalMs: 500 });
  const randomLoopTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const appendLog = useCallback((item: EventLogItem) => {
    if (logPausedRef.current) return;
    setLogItems((prev) => {
      const next = [...prev, item];
      return next.length > EVENT_LOG_LIMIT ? next.slice(next.length - EVENT_LOG_LIMIT) : next;
    });
  }, []);

  const refreshBots = useCallback(() => {
    setBots(poolRef.current?.list() ?? []);
  }, []);

  useEffect(() => {
    const pool = createBotPool({
      code,
      fetchImpl: (input, init) => fetch(input, init),
      socketFactory: defaultSocketFactory,
      buildUrl: defaultBuildUrl,
      nameFor: (i) => genBotName(i),
      playerIdFor: (i) => genBotId(i),
    });
    poolRef.current = pool;

    const unsubPool = pool.subscribe(refreshBots);
    const unsubMsg = pool.onMessage((botId, msg) => {
      if (msg && typeof msg === "object") {
        const m = msg as { t?: string; message?: string };
        if (m.t === "error") {
          const owner = pool.get(botId);
          appendLog({
            kind: "send",
            ts: Date.now(),
            botId,
            botName: owner?.name ?? botId,
            payload: { raw: `server-error: ${m.message ?? ""}` },
            summary: `${owner?.name ?? botId}: ${m.message ?? "error"}`,
          });
        }
      }
    });
    const unsubSend = pool.onSend(({ botId, payload, ts }) => {
      const owner = pool.get(botId);
      appendLog({
        kind: "send",
        ts,
        botId,
        botName: owner?.name ?? botId,
        payload,
        summary: `${owner?.name ?? botId} → ${payload.pid.slice(0, 8)}`,
      });
    });

    return () => {
      unsubPool();
      unsubMsg();
      unsubSend();
      // Send leave for each bot before clearing so the server drops them from
      // stored.players. Otherwise route navigation (back to /debug) leaves
      // orphan bot rows in the room.
      for (const b of pool.list()) {
        void leaveRoom(code, b.id).catch(() => {});
      }
      pool.clear();
      poolRef.current = null;
    };
  }, [code, appendLog, refreshBots]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const snap = await joinRoom(code, observerPidRef.current, "debug-observer", "client");
        if (cancelled) return;
        useWs.getState().setRoom(snap.room);
        useWs.getState().setSnapshot({
          players: snap.players,
          state: snap.state,
          metrics: snap.metrics,
        });
        setPhase(snap.room.phase);
        useWs.getState().connect(code, observerPidRef.current, "client");
      } catch (err) {
        if (!cancelled) setJoinError(String(err));
      }
    })();

    const unsub = useWs.subscribe((s) => {
      setConnected(s.connected);
      setPlayers(s.players);
      setState(s.state);
      setMetrics(s.metrics);
      setPhase(s.phase);
      setInactivityCloseAt(s.inactivity?.closeAt ?? null);
    });

    return () => {
      cancelled = true;
      unsub();
      useWs.getState().disconnect();
      // Tell the server the observer is gone so it doesn't accumulate
      // duplicate "debug-observer" rows across reloads / navigations.
      // Fire-and-forget; the route is unmounting so we can't surface errors.
      void leaveRoom(code, observerPidRef.current).catch(() => {});
    };
  }, [code, useWs]);

  // Tab close / browser quit: pagehide fires more reliably than beforeunload
  // on mobile. Use sendBeacon when available so the leave reaches the server
  // even as the page tears down. Covers ALL bots + the observer in one pass.
  useEffect(() => {
    const onPageHide = () => {
      const ids = [observerPidRef.current, ...(poolRef.current?.list().map((b) => b.id) ?? [])];
      const send = (id: string) => {
        const url = `/api/rooms/${encodeURIComponent(code)}/leave`;
        const body = JSON.stringify({ playerId: id });
        if (typeof navigator !== "undefined" && "sendBeacon" in navigator) {
          try {
            navigator.sendBeacon(url, new Blob([body], { type: "application/json" }));
            return;
          } catch {
            // fall through to fetch
          }
        }
        void fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body,
          keepalive: true,
        }).catch(() => {});
      };
      for (const id of ids) send(id);
    };
    window.addEventListener("pagehide", onPageHide);
    return () => window.removeEventListener("pagehide", onPageHide);
  }, [code]);

  // Observer raw event capture via lower-level message listener.
  useEffect(() => {
    const store = useWs;
    let lastSocket: WebSocket | null = null;
    const unsub = store.subscribe((s) => {
      if (s.socket === lastSocket) return;
      lastSocket = s.socket;
      if (!s.socket) return;
      s.socket.addEventListener("message", (ev) => {
        try {
          const raw = (ev as MessageEvent).data;
          const data = JSON.parse(typeof raw === "string" ? raw : String(raw)) as {
            t?: string;
          };
          const t = data.t ?? "unknown";
          appendLog({
            kind: "recv",
            ts: Date.now(),
            type: t,
            summary: summarizeRecv(t, data),
            payload: data,
          });
        } catch {
          // malformed payload — log raw text
          appendLog({
            kind: "recv",
            ts: Date.now(),
            type: "raw",
            summary: "malformed payload",
            payload: (ev as MessageEvent).data,
          });
        }
      });
    });
    return () => {
      unsub();
    };
  }, [useWs, appendLog]);

  // === Bot operations ===

  const addBots = useCallback(
    async (n: number, role: "host" | "client" = "client") => {
      const pool = poolRef.current;
      if (!pool) return;
      setBusy(true);
      try {
        for (let i = 0; i < n; i += 1) {
          counterRef.current += 1;
          await pool.addBot({
            playerId: genBotId(counterRef.current),
            name: genBotName(counterRef.current),
            role,
          });
        }
      } finally {
        setBusy(false);
        refreshBots();
      }
    },
    [refreshBots],
  );

  const sendScan = useCallback((scannerId: string, targetId: string) => {
    const pool = poolRef.current;
    if (!pool) return;
    const payload = buildPayload(
      code,
      targetId,
      Date.now(),
      `${systemRng.nonce()}`,
    );
    pool.sendScan(scannerId, payload);
  }, [code]);

  const sendPayload = useCallback(
    (scannerId: string, payload: ScanPayloadV1) => {
      poolRef.current?.sendScan(scannerId, payload);
    },
    [],
  );

  const sendRaw = useCallback((scannerId: string, text: string) => {
    poolRef.current?.sendRaw(scannerId, text);
  }, []);

  // === Manual / scenario / autonomy / edge helpers ===

  const fireScanPair = useCallback(
    ({ scannerId, scannedId }: ScanPair) => {
      sendScan(scannerId, scannedId);
    },
    [sendScan],
  );

  const onRandomOnce = useCallback(() => {
    if (bots.length < 2) return;
    const a = bots[Math.floor(Math.random() * bots.length)];
    if (!a) return;
    const targets = bots.filter((b) => b.id !== a.id);
    const b = targets[Math.floor(Math.random() * targets.length)];
    if (!b) return;
    fireScanPair({ scannerId: a.id, scannedId: b.id });
  }, [bots, fireScanPair]);

  const onAllPairsBurst = useCallback(() => {
    for (const pair of allToAllBurst(bots.map((b) => ({ id: b.id, name: b.name })))) {
      fireScanPair(pair);
    }
  }, [bots, fireScanPair]);

  const onToggleRandomLoop = useCallback(() => {
    setRandomLoop((prev) => {
      const next = { ...prev, running: !prev.running };
      const existing = randomLoopTimerRef.current;
      if (existing) {
        clearInterval(existing);
        randomLoopTimerRef.current = null;
      }
      if (next.running) {
        randomLoopTimerRef.current = setInterval(() => {
          onRandomOnce();
        }, Math.max(100, next.intervalMs));
      }
      return next;
    });
  }, [onRandomOnce]);

  const onChangeRandomInterval = useCallback((ms: number) => {
    setRandomLoop((prev) => {
      const next = { ...prev, intervalMs: ms };
      if (next.running && randomLoopTimerRef.current) {
        clearInterval(randomLoopTimerRef.current);
        randomLoopTimerRef.current = setInterval(() => {
          onRandomOnce();
        }, Math.max(100, ms));
      }
      return next;
    });
  }, [onRandomOnce]);

  useEffect(() => () => {
    const t = randomLoopTimerRef.current;
    if (t) clearInterval(t);
  }, []);

  const onRoundRobin = useCallback(() => {
    for (const pair of roundRobinChain(bots.map((b) => ({ id: b.id, name: b.name })))) {
      fireScanPair(pair);
    }
  }, [bots, fireScanPair]);

  const onAllToAll = useCallback(() => {
    onAllPairsBurst();
  }, [onAllPairsBurst]);

  const onRandomStorm = useCallback(() => {
    const steps = randomStormSteps(
      bots.map((b) => ({ id: b.id, name: b.name })),
      { rateHz: storm.rateHz, durationMs: storm.durationMs, rng: Math.random },
    );
    for (const s of steps) fireScanPair(s);
  }, [bots, storm, fireScanPair]);

  const onTokenRelay = useCallback(() => {
    const holder = findTokenHolderId(state);
    if (!holder) {
      appendLog({
        kind: "recv",
        ts: Date.now(),
        type: "info",
        summary: "tokenRelay aborted: no holder",
        payload: { hint: "preset baton/infection が必要、かつ phase=running" },
      });
      return;
    }
    const steps = tokenRelaySteps(
      bots.map((b) => ({ id: b.id, name: b.name })),
      { holderId: holder, steps: tokenRelay.steps, rng: Math.random },
    );
    for (const s of steps) fireScanPair(s);
  }, [bots, state, tokenRelay, fireScanPair, appendLog]);

  // Autonomy
  const tickBotRef = useRef<(b: BotEntry) => void>(() => {});
  tickBotRef.current = (b: BotEntry) => {
    const cfg = autonomyConfigs.get(b.id);
    if (!cfg) return;
    if (cfg.stopAfter !== null && cfg.sentInRun >= cfg.stopAfter) return;
    const others = bots.filter((x) => x.id !== b.id);
    if (others.length === 0) return;
    let target: BotEntry | undefined;
    const mode = cfg.mode;
    if (mode.kind === "random") {
      target = others[Math.floor(Math.random() * others.length)];
    } else if (mode.kind === "roundRobin") {
      target = others[roundRobinIdxRef.current % others.length];
      roundRobinIdxRef.current += 1;
    } else if (mode.kind === "target") {
      target = others.find((x) => x.id === mode.targetId);
    } else if (mode.kind === "tokenChase") {
      const holderId = findTokenHolderId(state);
      target = holderId && holderId !== b.id ? others.find((x) => x.id === holderId) : undefined;
    }
    if (!target) return;
    fireScanPair({ scannerId: b.id, scannedId: target.id });
    setAutonomyConfigs((prev) => {
      const next = new Map(prev);
      const c = next.get(b.id);
      if (c) next.set(b.id, { ...c, sentInRun: c.sentInRun + 1 });
      return next;
    });
  };

  useEffect(() => {
    const timers = autonomyTimersRef.current;
    for (const [id, t] of timers) {
      clearInterval(t);
      timers.delete(id);
    }
    if (!globalAutonomy) return;
    for (const b of bots) {
      const cfg = autonomyConfigs.get(b.id);
      if (!cfg || cfg.mode.kind === "idle") continue;
      const t = setInterval(() => {
        tickBotRef.current(b);
      }, Math.max(100, cfg.intervalMs));
      timers.set(b.id, t);
    }
    return () => {
      for (const [id, t] of timers) {
        clearInterval(t);
        timers.delete(id);
      }
    };
  }, [globalAutonomy, bots, autonomyConfigs]);

  const onSetAutonomyMode = useCallback((botId: string, mode: AutonomyMode) => {
    setAutonomyConfigs((prev) => {
      const next = new Map(prev);
      const existing = next.get(botId) ?? {
        mode: { kind: "idle" } as AutonomyMode,
        intervalMs: DEFAULT_AUTONOMY_INTERVAL,
        stopAfter: null,
        sentInRun: 0,
      };
      next.set(botId, { ...existing, mode });
      return next;
    });
  }, []);

  const onSetAutonomyInterval = useCallback((botId: string, ms: number) => {
    setAutonomyConfigs((prev) => {
      const next = new Map(prev);
      const existing = next.get(botId) ?? {
        mode: { kind: "idle" } as AutonomyMode,
        intervalMs: DEFAULT_AUTONOMY_INTERVAL,
        stopAfter: null,
        sentInRun: 0,
      };
      next.set(botId, { ...existing, intervalMs: ms });
      return next;
    });
  }, []);

  const onSetAutonomyStopAfter = useCallback((botId: string, n: number | null) => {
    setAutonomyConfigs((prev) => {
      const next = new Map(prev);
      const existing = next.get(botId) ?? {
        mode: { kind: "idle" } as AutonomyMode,
        intervalMs: DEFAULT_AUTONOMY_INTERVAL,
        stopAfter: null,
        sentInRun: 0,
      };
      next.set(botId, { ...existing, stopAfter: n });
      return next;
    });
  }, []);

  const onResetAutonomyCounters = useCallback(() => {
    setAutonomyConfigs((prev) => {
      const next = new Map(prev);
      for (const [id, c] of next) next.set(id, { ...c, sentInRun: 0 });
      return next;
    });
  }, []);

  // Edge cases
  const onFireEdge = useCallback(
    (caseId: EdgeCaseId, scannerId: string, targetId: string) => {
      const pool = poolRef.current;
      if (!pool) return;
      const result = buildEdgeCasePayload(caseId, {
        rid: code,
        scannerId,
        targetId,
        now: Date.now(),
        lastSuccessNonce: pool.lastSuccessNonce(),
        nonce: () => systemRng.nonce(),
      });
      if (result.kind === "unavailable") {
        appendLog({
          kind: "recv",
          ts: Date.now(),
          type: "info",
          summary: `edge ${caseId} unavailable`,
          payload: { reason: result.reason },
        });
        return;
      }
      if (result.kind === "raw") {
        sendRaw(scannerId, result.text);
        return;
      }
      sendPayload(scannerId, result.payload);
    },
    [code, sendRaw, sendPayload, appendLog],
  );

  // Bot removal that also tells the server to drop the player so the
  // dashboard's participant count actually goes down. Pool.removeBot only
  // closes the local WS — without a leave call the server keeps the player.
  const onRemoveLocal = useCallback(
    (id: string) => {
      void leaveRoom(code, id).catch((err) => setJoinError(String(err)));
      poolRef.current?.removeBot(id);
    },
    [code],
  );

  const onRemoveRemoteBot = useCallback(
    (id: string) => {
      void leaveRoom(code, id).catch((err) => setJoinError(String(err)));
    },
    [code],
  );

  const onClearAllBots = useCallback(() => {
    const pool = poolRef.current;
    if (!pool) return;
    const localIds = pool.list().map((b) => b.id);
    const remoteIds = players
      .filter((p) => p.id.startsWith("bot-") && !localIds.includes(p.id))
      .map((p) => p.id);
    const ids = [...localIds, ...remoteIds];
    for (const id of ids) {
      void leaveRoom(code, id).catch((err) => setJoinError(String(err)));
    }
    pool.clear();
  }, [code, players]);

  const remoteBots = useMemo(() => {
    const localIds = new Set(bots.map((b) => b.id));
    return players
      .filter((p) => p.id.startsWith("bot-") && !localIds.has(p.id))
      .map((p) => ({ id: p.id, name: p.name }));
  }, [players, bots]);

  // Room phase ops
  const onStart = useCallback(() => {
    void startRoom(code).catch((err) => setJoinError(String(err)));
  }, [code]);
  const onPause = useCallback(() => {
    void pauseRoom(code).catch((err) => setJoinError(String(err)));
  }, [code]);
  const onResume = useCallback(() => {
    void resumeRoom(code).catch((err) => setJoinError(String(err)));
  }, [code]);
  const onReset = useCallback(() => {
    void resetRoom(code).catch((err) => setJoinError(String(err)));
  }, [code]);

  const onObserverDisconnect = useCallback(() => useWs.getState().disconnect(), [useWs]);
  const onObserverReconnect = useCallback(() => {
    useWs.getState().connect(code, observerPidRef.current, "client");
  }, [code, useWs]);

  const onToggleLogPaused = useCallback(() => {
    logPausedRef.current = !logPausedRef.current;
    setLogPaused(logPausedRef.current);
  }, []);

  const onClearLog = useCallback(() => setLogItems([]), []);

  const tokenHolderId = useMemo(() => findTokenHolderId(state), [state]);

  return (
    <main className="mx-auto flex max-w-[1440px] flex-col gap-3 px-3 pt-4 pb-6">
      <header className="flex items-center justify-between gap-2">
        <div className="flex items-baseline gap-2">
          <p className="m-0 text-xs font-bold uppercase tracking-[0.18em] text-muted-foreground">
            /debug/
          </p>
          <h1 className="m-0 font-mono text-xl font-extrabold tracking-[0.16em]">{code}</h1>
        </div>
        <nav className="flex items-center gap-2">
          <Link
            to="/debug"
            className="rounded-full bg-muted/40 px-3 py-1 text-[12px] font-bold hover:bg-muted/60"
          >
            ← /debug
          </Link>
          <a
            href={`/r/${encodeURIComponent(code)}`}
            target="_blank"
            rel="noreferrer"
            className="rounded-full bg-muted/40 px-3 py-1 text-[12px] font-bold hover:bg-muted/60"
          >
            open /r/{code} ↗
          </a>
        </nav>
      </header>

      {joinError && (
        <Card
          role="alert"
          className="border border-destructive/40 bg-destructive/10 text-sm font-bold text-destructive"
        >
          {joinError}
        </Card>
      )}

      <div className="grid grid-cols-1 gap-3 md:grid-cols-[minmax(260px,320px)_minmax(360px,1fr)_minmax(360px,1fr)]">
        <RoomControl
          code={code}
          phase={phase}
          connected={connected}
          inactivityCloseAt={inactivityCloseAt}
          onStart={onStart}
          onPause={onPause}
          onResume={onResume}
          onReset={onReset}
          onDisconnectObserver={onObserverDisconnect}
          onReconnectObserver={onObserverReconnect}
        />
        <BotRoster
          bots={bots}
          remoteBots={remoteBots}
          busy={busy}
          onAdd={(n) => void addBots(n)}
          onAddHost={() => void addBots(1, "host")}
          onRemove={onRemoveLocal}
          onRemoveRemote={onRemoveRemoteBot}
          onRename={(id, name) => poolRef.current?.renameBot(id, name)}
          onDisconnect={(id) => poolRef.current?.disconnectBot(id)}
          onReconnect={(id) => poolRef.current?.reconnectBot(id)}
          onDisconnectAll={() => poolRef.current?.disconnectAll()}
          onReconnectAll={() => poolRef.current?.reconnectAll()}
          onClear={onClearAllBots}
        />
        <ScanControls
          bots={bots}
          onSendScan={sendScan}
          onRandomOnce={onRandomOnce}
          onAllPairsBurst={onAllPairsBurst}
          randomLoop={randomLoop}
          onToggleRandomLoop={onToggleRandomLoop}
          onChangeRandomInterval={onChangeRandomInterval}
          configs={autonomyConfigs}
          globalRunning={globalAutonomy}
          onToggleGlobal={() => setGlobalAutonomy((p) => !p)}
          onSetMode={onSetAutonomyMode}
          onSetInterval={onSetAutonomyInterval}
          onSetStopAfter={onSetAutonomyStopAfter}
          onResetCounters={onResetAutonomyCounters}
          onRoundRobin={onRoundRobin}
          onAllToAll={onAllToAll}
          storm={storm}
          onSetStorm={setStorm}
          onRandomStorm={onRandomStorm}
          tokenRelay={tokenRelay}
          onSetTokenRelay={setTokenRelay}
          onTokenRelay={onTokenRelay}
          hasSuccessNonce={poolRef.current?.lastSuccessNonce() !== null}
          onFire={onFireEdge}
        />
      </div>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-[1fr_1fr]">
        <EventLog
          items={logItems}
          onClear={onClearLog}
          paused={logPaused}
          onTogglePaused={onToggleLogPaused}
        />
        <StateInspector
          state={state}
          metrics={metrics}
          players={players}
          tokenHolderId={tokenHolderId}
        />
      </div>
    </main>
  );
}

function defaultBuildUrl(code: string, playerId: string): string {
  const proto = window.location.protocol === "https:" ? "wss" : "ws";
  return `${proto}://${window.location.host}/ws/${encodeURIComponent(code)}?pid=${encodeURIComponent(
    playerId,
  )}`;
}
