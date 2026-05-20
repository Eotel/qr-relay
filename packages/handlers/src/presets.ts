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
    id: "infection",
    name: "感染",
    description: "感染者の QR をスキャンすると感染。感染者は減らない (= 雪だるま式に広がる)。",
    rule: {
      value: { kind: "token" },
      initial: { holders: "one" },
      onScan: { source: "keep", sink: "gain" },
      constraints: { requireSourceHas: true },
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
];

export const presetById: Record<string, Preset> = Object.fromEntries(presets.map((p) => [p.id, p]));
