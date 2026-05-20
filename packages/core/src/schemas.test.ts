import { describe, expect, it } from "vitest";
import { CreateRoomRequest, JoinRequest, ScanPayloadV1, WsClientMsg } from "./schemas.js";

describe("ScanPayloadV1", () => {
  const base = {
    v: 1 as const,
    rid: "room-1",
    pid: "player-1",
    ts: 1_700_000_000_000,
    nonce: "n-abc",
  };

  it("accepts minimal valid payload", () => {
    expect(ScanPayloadV1.parse(base)).toMatchObject(base);
  });

  it("accepts payload with optional data and sig", () => {
    const parsed = ScanPayloadV1.parse({ ...base, data: { x: 1 }, sig: "s" });
    expect(parsed.data).toEqual({ x: 1 });
    expect(parsed.sig).toBe("s");
  });

  it("rejects non-literal v", () => {
    expect(() => ScanPayloadV1.parse({ ...base, v: 2 })).toThrow();
  });

  it("rejects empty rid/pid/nonce", () => {
    expect(() => ScanPayloadV1.parse({ ...base, rid: "" })).toThrow();
    expect(() => ScanPayloadV1.parse({ ...base, pid: "" })).toThrow();
    expect(() => ScanPayloadV1.parse({ ...base, nonce: "" })).toThrow();
  });

  it("rejects negative or non-integer ts", () => {
    expect(() => ScanPayloadV1.parse({ ...base, ts: -1 })).toThrow();
    expect(() => ScanPayloadV1.parse({ ...base, ts: 1.5 })).toThrow();
  });
});

describe("JoinRequest", () => {
  it("accepts valid client join", () => {
    expect(JoinRequest.parse({ playerId: "p1", name: "Alice", role: "client" })).toEqual({
      playerId: "p1",
      name: "Alice",
      role: "client",
    });
  });

  it("accepts valid host join", () => {
    expect(JoinRequest.parse({ playerId: "h1", name: "Host", role: "host" })).toEqual({
      playerId: "h1",
      name: "Host",
      role: "host",
    });
  });

  it("rejects empty playerId or name", () => {
    expect(() => JoinRequest.parse({ playerId: "", name: "x", role: "client" })).toThrow();
    expect(() => JoinRequest.parse({ playerId: "p", name: "", role: "client" })).toThrow();
  });

  it("rejects name longer than 40 characters", () => {
    expect(() =>
      JoinRequest.parse({ playerId: "p", name: "x".repeat(41), role: "client" }),
    ).toThrow();
  });

  it("rejects unknown role", () => {
    expect(() => JoinRequest.parse({ playerId: "p", name: "x", role: "stranger" })).toThrow();
  });

  it("rejects missing role", () => {
    expect(() => JoinRequest.parse({ playerId: "p", name: "x" })).toThrow();
  });
});

describe("CreateRoomRequest", () => {
  it("accepts handlerId with arbitrary config payload", () => {
    expect(CreateRoomRequest.parse({ handlerId: "relay", handlerConfig: { any: true } })).toEqual({
      handlerId: "relay",
      handlerConfig: { any: true },
    });
  });

  it("rejects empty handlerId", () => {
    expect(() => CreateRoomRequest.parse({ handlerId: "", handlerConfig: {} })).toThrow();
  });
});

describe("WsClientMsg", () => {
  const scan = {
    t: "scan" as const,
    payload: {
      v: 1 as const,
      rid: "r",
      pid: "p",
      ts: 1,
      nonce: "n",
    },
  };

  it("parses scan / ping / start / end", () => {
    expect(WsClientMsg.parse(scan).t).toBe("scan");
    expect(WsClientMsg.parse({ t: "ping" }).t).toBe("ping");
    expect(WsClientMsg.parse({ t: "start" }).t).toBe("start");
    expect(WsClientMsg.parse({ t: "end" }).t).toBe("end");
  });

  it("rejects unknown discriminator", () => {
    expect(() => WsClientMsg.parse({ t: "bogus" })).toThrow();
  });

  it("rejects scan with invalid payload", () => {
    expect(() => WsClientMsg.parse({ t: "scan", payload: { ...scan.payload, rid: "" } })).toThrow();
  });
});
