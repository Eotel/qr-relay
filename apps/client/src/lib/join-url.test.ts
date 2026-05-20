import { describe, expect, it } from "vitest";
import { parseJoinPayload } from "./join-url.js";

describe("parseJoinPayload", () => {
  it("absolute join URL → uppercase code", () => {
    expect(parseJoinPayload("https://qr-relay.example/r/abc123")).toBe("ABC123");
  });

  it("path-only join URL", () => {
    expect(parseJoinPayload("/r/XYZ789")).toBe("XYZ789");
  });

  it("bare code is accepted as last-resort", () => {
    expect(parseJoinPayload("ABC123")).toBe("ABC123");
  });

  it("URL with query/hash is OK; only the code segment is taken", () => {
    expect(parseJoinPayload("https://app/r/abcdef?x=1#frag")).toBe("ABCDEF");
  });

  it("host-suffixed invite URLs collapse to the same code (URL = intent, not authority)", () => {
    expect(parseJoinPayload("https://qr-relay.example/r/abc123/host")).toBe("ABC123");
    expect(parseJoinPayload("/r/abc123/host")).toBe("ABC123");
  });

  it("scoreboard-suffixed URLs collapse to the same code", () => {
    expect(parseJoinPayload("https://qr-relay.example/r/abc123/scoreboard")).toBe("ABC123");
  });

  it("rejects empty / whitespace", () => {
    expect(parseJoinPayload("")).toBeNull();
    expect(parseJoinPayload("   ")).toBeNull();
  });

  it("rejects scan-payload JSON (so in-game QRs aren't mistaken for join QRs)", () => {
    const inGame = JSON.stringify({ v: 1, rid: "ABC", pid: "p1", ts: 1, nonce: "n" });
    expect(parseJoinPayload(inGame)).toBeNull();
  });

  it("rejects arbitrary URLs that aren't /r/CODE", () => {
    expect(parseJoinPayload("https://example.com/foo/bar")).toBeNull();
  });

  it("rejects strings that are too short / too long for a bare code", () => {
    expect(parseJoinPayload("abc")).toBeNull();
    expect(parseJoinPayload("abcdefghijklm")).toBeNull();
  });
});
