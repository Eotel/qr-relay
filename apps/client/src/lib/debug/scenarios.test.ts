import { describe, expect, it } from "vitest";
import {
  type ScenarioBot,
  allToAllBurst,
  randomStormSteps,
  roundRobinChain,
  tokenRelaySteps,
} from "./scenarios.js";

const bots = (...names: string[]): ScenarioBot[] => names.map((id) => ({ id, name: id }));

describe("roundRobinChain", () => {
  it("returns (bot[i], bot[i+1]) pairs that close the loop", () => {
    const pairs = roundRobinChain(bots("a", "b", "c"));
    expect(pairs).toEqual([
      { scannerId: "a", scannedId: "b" },
      { scannerId: "b", scannedId: "c" },
      { scannerId: "c", scannedId: "a" },
    ]);
  });

  it("empty pool → []", () => {
    expect(roundRobinChain([])).toEqual([]);
  });

  it("single bot → []", () => {
    expect(roundRobinChain(bots("only"))).toEqual([]);
  });
});

describe("allToAllBurst", () => {
  it("returns every (i,j) pair where i!=j", () => {
    const pairs = allToAllBurst(bots("a", "b", "c"));
    expect(pairs).toHaveLength(6);
    expect(pairs).toContainEqual({ scannerId: "a", scannedId: "b" });
    expect(pairs).toContainEqual({ scannerId: "b", scannedId: "a" });
    expect(pairs).toContainEqual({ scannerId: "c", scannedId: "a" });
  });

  it("never includes self-pairs", () => {
    const pairs = allToAllBurst(bots("a", "b"));
    expect(pairs.every((p) => p.scannerId !== p.scannedId)).toBe(true);
  });
});

describe("randomStormSteps", () => {
  it("count = floor(rate * durationMs / 1000)", () => {
    const rng = mulberry32(42);
    const steps = randomStormSteps(bots("a", "b", "c"), { rateHz: 10, durationMs: 2_000, rng });
    expect(steps).toHaveLength(20);
  });

  it("never produces self-pairs", () => {
    const rng = mulberry32(99);
    const steps = randomStormSteps(bots("a", "b"), { rateHz: 50, durationMs: 200, rng });
    expect(steps.every((s) => s.scannerId !== s.scannedId)).toBe(true);
  });

  it("returns [] when fewer than 2 bots", () => {
    expect(randomStormSteps([], { rateHz: 10, durationMs: 1_000, rng: Math.random })).toEqual([]);
    expect(
      randomStormSteps(bots("only"), { rateHz: 10, durationMs: 1_000, rng: Math.random }),
    ).toEqual([]);
  });
});

describe("tokenRelaySteps", () => {
  it("starts at the current holder and walks N steps", () => {
    const rng = mulberry32(7);
    const steps = tokenRelaySteps(bots("a", "b", "c", "d"), {
      holderId: "a",
      steps: 3,
      rng,
    });
    expect(steps).toHaveLength(3);
    expect(steps[0]?.scannerId).toBe("a");
    // Each step's scanner becomes the previous step's scanned.
    for (let i = 1; i < steps.length; i += 1) {
      const prev = steps[i - 1];
      const curr = steps[i];
      if (!prev || !curr) throw new Error("missing step");
      expect(curr.scannerId).toBe(prev.scannedId);
      expect(curr.scannerId).not.toBe(curr.scannedId);
    }
  });

  it("[] if holder is unknown", () => {
    expect(
      tokenRelaySteps(bots("a", "b"), { holderId: "missing", steps: 2, rng: Math.random }),
    ).toEqual([]);
  });

  it("[] if fewer than 2 bots", () => {
    expect(tokenRelaySteps(bots("only"), { holderId: "only", steps: 5, rng: Math.random })).toEqual(
      [],
    );
  });
});

// Deterministic PRNG (mulberry32) so the randomness-aware tests are stable.
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a += 0x6d2b79f5;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}
