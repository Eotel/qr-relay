import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

class MemoryStorage {
  private store = new Map<string, string>();
  getItem(k: string): string | null {
    return this.store.has(k) ? (this.store.get(k) ?? null) : null;
  }
  setItem(k: string, v: string): void {
    this.store.set(k, String(v));
  }
  removeItem(k: string): void {
    this.store.delete(k);
  }
  clear(): void {
    this.store.clear();
  }
  key(i: number): string | null {
    return Array.from(this.store.keys())[i] ?? null;
  }
  get length(): number {
    return this.store.size;
  }
}

beforeEach(() => {
  vi.stubGlobal("localStorage", new MemoryStorage());
  vi.resetModules();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

async function load() {
  return import("./nickname.js");
}

const player = (id: string, name: string) => ({ id, name, joinedAt: 0 });

describe("resolveNickname", () => {
  it("returns the input verbatim when no collision", async () => {
    const { resolveNickname } = await load();
    expect(
      resolveNickname({ input: "太郎", selfId: "me", players: [player("p1", "花子")] }),
    ).toBe("太郎");
  });

  it("falls back to a generated name when input is empty", async () => {
    const { resolveNickname } = await load();
    const name = resolveNickname({ input: "", selfId: "me", players: [] });
    expect(name.length).toBeGreaterThan(0);
    expect(name).not.toContain("(");
  });

  it("appends (2) when one other player has the same name", async () => {
    const { resolveNickname } = await load();
    expect(
      resolveNickname({
        input: "太郎",
        selfId: "me",
        players: [player("p1", "太郎")],
      }),
    ).toBe("太郎(2)");
  });

  it("finds the next free index when (2) is also taken", async () => {
    const { resolveNickname } = await load();
    expect(
      resolveNickname({
        input: "太郎",
        selfId: "me",
        players: [player("p1", "太郎"), player("p2", "太郎(2)")],
      }),
    ).toBe("太郎(3)");
  });

  it("ignores the caller's own existing entry", async () => {
    const { resolveNickname } = await load();
    // self is already in the list under the same name (re-join scenario)
    expect(
      resolveNickname({
        input: "太郎",
        selfId: "me",
        players: [player("me", "太郎")],
      }),
    ).toBe("太郎");
  });

  it("also deduplicates auto-generated names against others", async () => {
    const { resolveNickname } = await load();
    // Force ensurePlayerName to return a known name via prior localStorage.
    localStorage.setItem("qr-relay:player-name", "やさしいウサギ");
    const name = resolveNickname({
      input: "",
      selfId: "me",
      players: [player("p1", "やさしいウサギ")],
    });
    expect(name).toBe("やさしいウサギ(2)");
  });
});
