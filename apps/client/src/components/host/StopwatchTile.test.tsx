import type { Phase } from "@qr-relay/core";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { StopwatchTile, formatStopwatch } from "./StopwatchTile.js";

const running: Phase = { kind: "running", startedAt: 0, accumulatedMs: 0 };

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
});
