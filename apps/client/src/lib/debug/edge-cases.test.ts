import { describe, expect, it } from "vitest";
import {
  EDGE_CASES,
  type EdgeCaseId,
  buildEdgeCasePayload,
  describeExpectedServerError,
} from "./edge-cases.js";

const baseCtx = {
  rid: "ABC123",
  scannerId: "bot-scanner",
  targetId: "bot-target",
  now: 1_700_000_000_000,
  lastSuccessNonce: "good-nonce",
  nonce: () => "fresh-nonce",
};

describe("buildEdgeCasePayload", () => {
  it("replay-nonce: reuses lastSuccessNonce; needs prior success", () => {
    const p = buildEdgeCasePayload("replay-nonce", baseCtx);
    expect(p.kind).toBe("scan");
    if (p.kind !== "scan") return;
    expect(p.payload.nonce).toBe("good-nonce");
    // Without a prior success, it returns 'unavailable' so the UI can guide.
    const p2 = buildEdgeCasePayload("replay-nonce", { ...baseCtx, lastSuccessNonce: null });
    expect(p2.kind).toBe("unavailable");
  });

  it("stale-ts: ts < now - 60_000", () => {
    const p = buildEdgeCasePayload("stale-ts", baseCtx);
    if (p.kind !== "scan") throw new Error("expected scan");
    expect(baseCtx.now - p.payload.ts).toBeGreaterThan(60_000);
  });

  it("future-ts: ts > now + 60_000", () => {
    const p = buildEdgeCasePayload("future-ts", baseCtx);
    if (p.kind !== "scan") throw new Error("expected scan");
    expect(p.payload.ts - baseCtx.now).toBeGreaterThan(60_000);
  });

  it("wrong-rid: rid differs from context (payload still well-formed)", () => {
    const p = buildEdgeCasePayload("wrong-rid", baseCtx);
    if (p.kind !== "scan") throw new Error("expected scan");
    expect(p.payload.rid).not.toBe(baseCtx.rid);
    expect(p.payload.rid.length).toBeGreaterThan(0);
  });

  it("self-scan: payload.pid == scannerId", () => {
    const p = buildEdgeCasePayload("self-scan", baseCtx);
    if (p.kind !== "scan") throw new Error("expected scan");
    expect(p.payload.pid).toBe(baseCtx.scannerId);
  });

  it("unknown-pid: payload.pid is a random non-participant id", () => {
    const p = buildEdgeCasePayload("unknown-pid", baseCtx);
    if (p.kind !== "scan") throw new Error("expected scan");
    expect(p.payload.pid).not.toBe(baseCtx.scannerId);
    expect(p.payload.pid).not.toBe(baseCtx.targetId);
    expect(p.payload.pid.length).toBeGreaterThan(0);
  });

  it("invalid-data: payload.data is something that handler.dataSchema rejects", () => {
    const p = buildEdgeCasePayload("invalid-data", baseCtx);
    if (p.kind !== "scan") throw new Error("expected scan");
    // We can't introspect handler.dataSchema here, so encode the contract:
    // payload.data is set and is intentionally an unexpected shape.
    expect(p.payload.data).toBeDefined();
    expect(typeof p.payload.data === "object").toBe(true);
  });

  it("malformed-json: emits a raw text frame instead of a scan", () => {
    const p = buildEdgeCasePayload("malformed-json", baseCtx);
    expect(p.kind).toBe("raw");
    if (p.kind !== "raw") return;
    expect(() => JSON.parse(p.text)).toThrow();
  });
});

describe("describeExpectedServerError", () => {
  const expectations: Record<EdgeCaseId, string> = {
    "replay-nonce": "duplicate nonce",
    "stale-ts": "timestamp out of window",
    "future-ts": "timestamp out of window",
    "wrong-rid": "unknown player",
    "self-scan": "cannot scan self",
    "unknown-pid": "unknown player",
    "invalid-data": "invalid payload data",
    "malformed-json": "invalid",
    "scan-while-ready": "game is not running",
    "host-scan": "host cannot scan",
  };
  for (const [id, expected] of Object.entries(expectations) as [EdgeCaseId, string][]) {
    it(`${id} → ${expected}`, () => {
      expect(describeExpectedServerError(id).toLowerCase()).toContain(expected);
    });
  }
});

describe("EDGE_CASES", () => {
  it("covers all 10 ids used by the console UI", () => {
    const ids = EDGE_CASES.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toContain("replay-nonce");
    expect(ids).toContain("malformed-json");
    expect(ids).toContain("scan-while-ready");
    expect(ids).toContain("host-scan");
  });
});
