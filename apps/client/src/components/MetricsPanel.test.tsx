import type { Metric } from "@qr-relay/core";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MetricsPanel } from "./MetricsPanel.js";

const PLAYERS = [
  { id: "p1", name: "Alice" },
  { id: "p2", name: "Bob" },
];

describe("MetricsPanel", () => {
  it("metrics 空のときは何も描画しない", () => {
    const { container } = render(<MetricsPanel metrics={[]} players={PLAYERS} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("time メトリクスは m:ss フォーマットで表示", () => {
    const metrics: Metric[] = [{ kind: "time", label: "elapsed", ms: 65_000 }];
    render(<MetricsPanel metrics={metrics} players={PLAYERS} />);
    expect(screen.getByText(/elapsed:/i)).toBeInTheDocument();
    expect(screen.getByText("1:05")).toBeInTheDocument();
  });

  it("byPlayer 付き count: 各プレイヤーのバッジが表示される", () => {
    const metrics: Metric[] = [
      { kind: "count", label: "scans", total: 4, byPlayer: { p1: 3, p2: 1 } },
    ];
    render(<MetricsPanel metrics={metrics} players={PLAYERS} selfId="p1" />);
    expect(screen.getByText(/Alice/)).toBeInTheDocument();
    expect(screen.getByText(/Bob/)).toBeInTheDocument();
    expect(screen.getByText(/\(自分\)/)).toBeInTheDocument();
  });

  it("byPlayer 無し count: total を表示", () => {
    const metrics: Metric[] = [{ kind: "count", label: "scans", total: 7 }];
    render(<MetricsPanel metrics={metrics} players={PLAYERS} />);
    expect(screen.getByText("7")).toBeInTheDocument();
  });

  it("score: 同点首位の全員がリーダー表示", () => {
    const metrics: Metric[] = [{ kind: "score", label: "rank", byPlayer: { p1: 5, p2: 5 } }];
    render(<MetricsPanel metrics={metrics} players={PLAYERS} />);
    // 両方とも leader バッジ。SVG の Crown を含む
    const alice = screen.getByText(/Alice: 5/);
    const bob = screen.getByText(/Bob: 5/);
    expect(alice).toBeInTheDocument();
    expect(bob).toBeInTheDocument();
  });

  it("score: スコアが 0 のときはリーダー表示なし", () => {
    const metrics: Metric[] = [{ kind: "score", label: "rank", byPlayer: { p1: 0, p2: 0 } }];
    const { container } = render(<MetricsPanel metrics={metrics} players={PLAYERS} />);
    // Crown のような <svg> が描画されていないことの簡易確認
    expect(container.querySelectorAll("svg").length).toBe(0);
  });

  it("未登録 pid は id 文字列で fallback", () => {
    const metrics: Metric[] = [{ kind: "count", label: "x", total: 2, byPlayer: { unknown: 2 } }];
    render(<MetricsPanel metrics={metrics} players={PLAYERS} />);
    expect(screen.getByText(/unknown: 2/)).toBeInTheDocument();
  });
});
