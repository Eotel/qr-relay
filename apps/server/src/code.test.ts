import { describe, expect, it } from "vitest";
import { generateRoomCode, normalizeRoomCode } from "./code.js";

const ALLOWED = /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]+$/;

describe("generateRoomCode", () => {
  it("returns 6-character code by default", () => {
    const code = generateRoomCode();
    expect(code).toHaveLength(6);
    expect(code).toMatch(ALLOWED);
  });

  it("honors the length argument", () => {
    expect(generateRoomCode(1)).toHaveLength(1);
    expect(generateRoomCode(12)).toHaveLength(12);
  });

  it("only emits characters from the ambiguity-free alphabet", () => {
    // sample many codes to catch character leaks (0, 1, I, O are banned)
    for (let i = 0; i < 200; i++) {
      const code = generateRoomCode(8);
      expect(code).toMatch(ALLOWED);
      expect(code).not.toMatch(/[01IO]/);
    }
  });

  it("does not collide trivially between calls", () => {
    const codes = new Set<string>();
    for (let i = 0; i < 50; i++) codes.add(generateRoomCode(8));
    // 32^8 space — duplicates are essentially impossible at this volume
    expect(codes.size).toBe(50);
  });
});

describe("normalizeRoomCode", () => {
  it("uppercases and trims", () => {
    expect(normalizeRoomCode("  abc123  ")).toBe("ABC123");
  });

  it("is idempotent", () => {
    const once = normalizeRoomCode(" abcDEF ");
    expect(normalizeRoomCode(once)).toBe(once);
  });

  it("leaves already-normalized input untouched", () => {
    expect(normalizeRoomCode("XYZ789")).toBe("XYZ789");
  });
});
