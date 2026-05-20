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

describe("getRole / setRole / clearRole", () => {
  it("getRole は未保存なら null", async () => {
    const { getRole } = await loadIdentity();
    expect(getRole("ABC")).toBeNull();
  });

  it("setRole で保存し getRole で読み戻す", async () => {
    const { getRole, setRole } = await loadIdentity();
    setRole("ABC", "host");
    expect(getRole("ABC")).toBe("host");
    expect(storage.getItem("qr-relay:role:ABC")).toBe("host");
    setRole("ABC", "client");
    expect(getRole("ABC")).toBe("client");
  });

  it("不正な値は getRole で null として扱う", async () => {
    storage.setItem("qr-relay:role:ABC", "stranger");
    const { getRole } = await loadIdentity();
    expect(getRole("ABC")).toBeNull();
  });

  it("clearRole で削除する", async () => {
    const { getRole, setRole, clearRole } = await loadIdentity();
    setRole("ABC", "host");
    clearRole("ABC");
    expect(getRole("ABC")).toBeNull();
  });

  it("code ごとに独立して保存される", async () => {
    const { getRole, setRole } = await loadIdentity();
    setRole("ABC", "host");
    setRole("XYZ", "client");
    expect(getRole("ABC")).toBe("host");
    expect(getRole("XYZ")).toBe("client");
  });
});

describe("acceptInviteRole", () => {
  it("auto-accepts as client when no role is stored (cold invite landing)", async () => {
    const { acceptInviteRole, getRole } = await loadIdentity();
    expect(acceptInviteRole("ABC")).toBe("client");
    expect(getRole("ABC")).toBe("client");
  });

  it("preserves an existing host claim (re-opening own room link does not demote)", async () => {
    storage.setItem("qr-relay:role:ABC", "host");
    const { acceptInviteRole, getRole } = await loadIdentity();
    expect(acceptInviteRole("ABC")).toBe("host");
    expect(getRole("ABC")).toBe("host");
  });

  it("preserves an existing client claim (no flip back to host)", async () => {
    storage.setItem("qr-relay:role:ABC", "client");
    const { acceptInviteRole, getRole } = await loadIdentity();
    expect(acceptInviteRole("ABC")).toBe("client");
    expect(getRole("ABC")).toBe("client");
  });

  // URL = intent, localStorage = authority. The /r/CODE/host URL segment is
  // decorative (lets a host's bookmark self-describe). It must NOT promote a
  // visitor to host when the device has no stored host claim — otherwise the
  // host could escalate someone by sharing the /host link, or self-demote by
  // losing localStorage. The function is URL-agnostic by design: it sees only
  // the code, so the same contract holds whether the caller landed on
  // /r/CODE or /r/CODE/host.
  it("treats /r/CODE/host the same as /r/CODE — URL never promotes to host without a stored claim", async () => {
    const { acceptInviteRole, getRole } = await loadIdentity();
    // Simulate a cold /r/CODE/host landing (e.g. tapping a shared host link
    // on a device that has never opened this room): no role in storage.
    expect(acceptInviteRole("ABC")).toBe("client");
    expect(getRole("ABC")).toBe("client");
  });
});

describe("recent host code", () => {
  it("getRecentHostCode は未保存なら null", async () => {
    const { getRecentHostCode } = await loadIdentity();
    expect(getRecentHostCode()).toBeNull();
  });

  it("setRecentHostCode で保存し getRecentHostCode で読み戻す", async () => {
    const { getRecentHostCode, setRecentHostCode } = await loadIdentity();
    setRecentHostCode("ABC");
    expect(getRecentHostCode()).toBe("ABC");
    expect(storage.getItem("qr-relay:last-host-code")).toBe("ABC");
  });

  it("setRecentHostCode は上書きする (直近 1 件のみ保持)", async () => {
    const { getRecentHostCode, setRecentHostCode } = await loadIdentity();
    setRecentHostCode("ABC");
    setRecentHostCode("XYZ");
    expect(getRecentHostCode()).toBe("XYZ");
  });

  it("空文字 / 空白のみは保存しない (defensive)", async () => {
    const { getRecentHostCode, setRecentHostCode } = await loadIdentity();
    setRecentHostCode("");
    expect(getRecentHostCode()).toBeNull();
    setRecentHostCode("   ");
    expect(getRecentHostCode()).toBeNull();
  });

  it("clearRecentHostCode (引数なし) は無条件で消す", async () => {
    const { clearRecentHostCode, getRecentHostCode, setRecentHostCode } = await loadIdentity();
    setRecentHostCode("ABC");
    clearRecentHostCode();
    expect(getRecentHostCode()).toBeNull();
  });

  it("clearRecentHostCode(code) は code が一致した場合だけ消す", async () => {
    const { clearRecentHostCode, getRecentHostCode, setRecentHostCode } = await loadIdentity();
    setRecentHostCode("ABC");
    clearRecentHostCode("XYZ");
    expect(getRecentHostCode()).toBe("ABC");
    clearRecentHostCode("ABC");
    expect(getRecentHostCode()).toBeNull();
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
    // shape: <adjective><animal> — no numeric suffix
    expect(name).toMatch(/^[^-\s]+$/);
    expect(name.length).toBeGreaterThanOrEqual(2);
    // persists the generated name
    expect(storage.getItem("qr-relay:player-name")).toBe(name);
  });

  it("is stable once a name has been generated", async () => {
    const { ensurePlayerName } = await loadIdentity();
    const first = ensurePlayerName();
    expect(ensurePlayerName()).toBe(first);
  });
});
