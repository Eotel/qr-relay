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

let storage: MemoryStorage;

beforeEach(async () => {
  storage = new MemoryStorage();
  vi.stubGlobal("localStorage", storage);
  vi.resetModules();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

async function loadIdentity() {
  return import("./identity.js");
}

describe("getPlayerId", () => {
  it("generates and persists a new id on first call", async () => {
    const { getPlayerId } = await loadIdentity();
    const id = getPlayerId();
    expect(id).not.toBe("");
    expect(storage.getItem("qr-relay:player-id")).toBe(id);
  });

  it("returns the same id on subsequent calls", async () => {
    const { getPlayerId } = await loadIdentity();
    expect(getPlayerId()).toBe(getPlayerId());
  });

  it("re-uses an id already in storage", async () => {
    storage.setItem("qr-relay:player-id", "preset-id");
    const { getPlayerId } = await loadIdentity();
    expect(getPlayerId()).toBe("preset-id");
  });
});

describe("getPlayerName / setPlayerName", () => {
  it("returns empty string when no name is stored", async () => {
    const { getPlayerName } = await loadIdentity();
    expect(getPlayerName()).toBe("");
  });

  it("setPlayerName persists and getPlayerName reads it back", async () => {
    const { getPlayerName, setPlayerName } = await loadIdentity();
    setPlayerName("Alice");
    expect(getPlayerName()).toBe("Alice");
    expect(storage.getItem("qr-relay:player-name")).toBe("Alice");
  });
});

describe("ensurePlayerName", () => {
  it("preserves an existing name", async () => {
    storage.setItem("qr-relay:player-name", "Bob");
    const { ensurePlayerName } = await loadIdentity();
    expect(ensurePlayerName()).toBe("Bob");
  });

  it("generates a random animal name in the documented shape", async () => {
    const { ensurePlayerName } = await loadIdentity();
    const name = ensurePlayerName();
    // shape: <adjective><animal>-<3 digits>
    expect(name).toMatch(/^.+-\d{3}$/);
    // persists the generated name
    expect(storage.getItem("qr-relay:player-name")).toBe(name);
  });

  it("is stable once a name has been generated", async () => {
    const { ensurePlayerName } = await loadIdentity();
    const first = ensurePlayerName();
    expect(ensurePlayerName()).toBe(first);
  });
});
