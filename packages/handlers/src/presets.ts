import type { ScanRule } from "./relay-rule.js";

export type Preset = {
  id: string;
  name: string;
  description: string;
  rule: ScanRule;
};

export const presets: Preset[] = [
  {
    id: "baton",
    name: "バトン",
    description: "1人だけがバトンを持つ。スキャンすると相手にバトンが移る。",
    rule: {
      value: { kind: "token" },
      initial: { holders: "one" },
      onScan: { source: "lose", sink: "gain" },
      constraints: { requireSourceHas: true, requireSinkLacks: true },
    },
  },
  {
    id: "hot-potato",
    name: "ホットポテト",
    description: "バトンと同じ動きだが、一定時間後に止まった人が負け。",
    rule: {
      value: { kind: "token" },
      initial: { holders: "one" },
      onScan: { source: "lose", sink: "gain" },
      constraints: { requireSourceHas: true, requireSinkLacks: true },
      end: { kind: "timer-ms", ms: 60_000 },
    },
  },
  {
    id: "steal",
    name: "奪い合い",
    description: "全員が持点 10。スキャンすると相手の点数を奪う。",
    rule: {
      value: { kind: "score", defaultAmount: 10 },
      initial: { holders: "all", amount: 10 },
      onScan: { source: "decrement", sink: "increment", amount: 1 },
      constraints: { requireSourceHas: true, minValue: 0 },
    },
  },
  {
    id: "collection",
    name: "コレクション",
    description: "出会った人の数を数える。同じ相手は重複カウントしない。",
    rule: {
      value: { kind: "score", defaultAmount: 0 },
      initial: { holders: "none" },
      onScan: { source: "keep", sink: "increment", amount: 1 },
      constraints: { uniquePerPair: true },
    },
  },
  {
    id: "greeting",
    name: "あいさつ",
    description: "スキャンするとお互いに +1。挨拶を増やそう。",
    rule: {
      value: { kind: "score", defaultAmount: 0 },
      initial: { holders: "none" },
      onScan: { source: "increment", sink: "increment", amount: 1 },
    },
  },
  {
    id: "quota",
    name: "ノルマ",
    description: "10 人と出会えたら達成。",
    rule: {
      value: { kind: "score", defaultAmount: 0 },
      initial: { holders: "none" },
      onScan: { source: "keep", sink: "increment", amount: 1 },
      constraints: { uniquePerPair: true },
      end: { kind: "target", value: 10 },
    },
  },
  {
    id: "tag",
    name: "鬼ごっこ",
    description: "鬼の QR をスキャンしたら自分が鬼になる。最後まで鬼でなかった人が勝ち。",
    rule: {
      value: { kind: "status", defaultStatus: "safe" },
      initial: { holders: "one", status: "oni" },
      onScan: {
        source: "set-status",
        sink: "set-status",
        sourceStatus: "safe",
        sinkStatus: "oni",
      },
      constraints: { requireSourceHas: "oni" },
    },
  },
  {
    id: "infection",
    name: "感染",
    description: "感染者からスキャンされた人も感染。全員感染で終了。",
    rule: {
      value: { kind: "status", defaultStatus: "healthy" },
      initial: { holders: "one", status: "infected" },
      onScan: { source: "keep", sink: "set-status", sinkStatus: "infected" },
      constraints: { requireSourceHas: "infected" },
      end: { kind: "all-have-status", status: "infected" },
    },
  },
  {
    id: "oni-swap",
    name: "鬼交代",
    description: "スキャンすると鬼が入れ替わる。",
    rule: {
      value: { kind: "status", defaultStatus: "safe" },
      initial: { holders: "one", status: "oni" },
      onScan: { source: "keep", sink: "keep", swap: true },
      constraints: { requireSourceHas: "oni" },
    },
  },
];

export const presetById: Record<string, Preset> = Object.fromEntries(presets.map((p) => [p.id, p]));
