import type { Phase } from "@qr-relay/core";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { StopwatchTile, formatStopwatch } from "./StopwatchTile.js";

const ready: Phase = { kind: "ready" };
const running: Phase = { kind: "running", startedAt: 0, accumulatedMs: 0 };
const paused: Phase = { kind: "paused", pausedAt: 0, accumulatedMs: 10_000 };

describe("formatStopwatch", () => {
  it("zero-pads seconds", () => {
    expect(formatStopwatch(0)).toBe("0:00");
    expect(formatStopwatch(5_000)).toBe("0:05");
    expect(formatStopwatch(65_000)).toBe("1:05");
  });
});

describe("StopwatchTile", () => {
  it("renders elapsed time and phase label", () => {
    render(<StopwatchTile phase={running} elapsedMs={12_000} />);
    expect(screen.getByText("0:12")).toBeInTheDocument();
    expect(screen.getByText("進行中")).toBeInTheDocument();
  });

  it("renders throughput 1-liner when provided", () => {
    render(<StopwatchTile phase={running} elapsedMs={0} throughput={7} />);
    expect(screen.getByText(/直近 60s/)).toBeInTheDocument();
    expect(screen.getByText("7")).toBeInTheDocument();
  });

  it("omits the throughput 1-liner when undefined", () => {
    render(<StopwatchTile phase={ready} elapsedMs={0} />);
    expect(screen.queryByText(/直近 60s/)).toBeNull();
  });

  it("renders throughput 0 explicitly (so dormant rooms read as '0', not absent)", () => {
    render(<StopwatchTile phase={paused} elapsedMs={10_000} throughput={0} />);
    expect(screen.getByText(/直近 60s/)).toBeInTheDocument();
    expect(screen.getByText("0")).toBeInTheDocument();
  });
});
