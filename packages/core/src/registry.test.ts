import { beforeEach, describe, expect, it } from "vitest";
import { z } from "zod";
import type { ScanHandler } from "./handler.js";
import {
  clearHandlers,
  getHandler,
  listHandlers,
  registerHandler,
  requireHandler,
} from "./registry.js";

function makeStubHandler(id: string): ScanHandler<unknown, unknown, unknown> {
  return {
    id,
    name: id,
    configSchema: z.unknown(),
    dataSchema: z.unknown(),
    initialState: () => ({}),
    payloadFor: () => null,
    onScan: ({ state }) => ({ nextState: state, events: [] }),
    metrics: () => [],
  };
}

describe("registry", () => {
  beforeEach(() => {
    clearHandlers();
  });

  it("registers and retrieves a handler", () => {
    const h = makeStubHandler("relay");
    registerHandler(h);
    expect(getHandler("relay")?.id).toBe("relay");
  });

  it("returns undefined for unknown handler", () => {
    expect(getHandler("missing")).toBeUndefined();
  });

  it("throws via requireHandler when not found", () => {
    expect(() => requireHandler("missing")).toThrow(/Handler not found/);
  });

  it("lists all handlers", () => {
    registerHandler(makeStubHandler("a"));
    registerHandler(makeStubHandler("b"));
    expect(
      listHandlers()
        .map((h) => h.id)
        .sort(),
    ).toEqual(["a", "b"]);
  });

  it("overwrites previous handler with same id", () => {
    registerHandler(makeStubHandler("dup"));
    const overwriting = makeStubHandler("dup");
    registerHandler(overwriting);
    expect(listHandlers()).toHaveLength(1);
    expect(getHandler("dup")).toBe(overwriting);
  });
});
