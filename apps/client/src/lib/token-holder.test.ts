import { describe, expect, it } from "vitest";
import { isTokenHolder } from "./token-holder.js";

describe("isTokenHolder", () => {
  const baseState = {
    values: {
      alice: { kind: "token", has: true } as const,
      bob: { kind: "token", has: false } as const,
      carol: { kind: "score", amount: 3 } as const,
    },
    scanCounts: {},
    pairCounts: {},
    history: [],
  };

  it("returns true when self holds a token", () => {
    expect(isTokenHolder(baseState, "alice")).toBe(true);
  });

  it("returns false when self has the token slot but has=false", () => {
    expect(isTokenHolder(baseState, "bob")).toBe(false);
  });

  it("returns false for score-slot presets", () => {
    expect(isTokenHolder(baseState, "carol")).toBe(false);
  });

  it("returns false when self is not in values", () => {
    expect(isTokenHolder(baseState, "dave")).toBe(false);
  });

  it("returns false when selfId is null/empty", () => {
    expect(isTokenHolder(baseState, null)).toBe(false);
    expect(isTokenHolder(baseState, "")).toBe(false);
    expect(isTokenHolder(baseState, undefined)).toBe(false);
  });

  it("returns false for null/non-object state", () => {
    expect(isTokenHolder(null, "alice")).toBe(false);
    expect(isTokenHolder(undefined, "alice")).toBe(false);
    expect(isTokenHolder("nope", "alice")).toBe(false);
    expect(isTokenHolder(42, "alice")).toBe(false);
  });

  it("returns false when values key is missing or malformed", () => {
    expect(isTokenHolder({}, "alice")).toBe(false);
    expect(isTokenHolder({ values: null }, "alice")).toBe(false);
    expect(isTokenHolder({ values: "x" }, "alice")).toBe(false);
  });
});
