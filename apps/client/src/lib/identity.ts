const ID_KEY = "qr-relay:player-id";
const NAME_KEY = "qr-relay:player-name";
const ROLE_KEY_PREFIX = "qr-relay:role:";
const RECENT_HOST_KEY = "qr-relay:last-host-code";

export type Role = "host" | "client";

function roleKey(code: string): string {
  return `${ROLE_KEY_PREFIX}${code}`;
}

export function getRole(code: string): Role | null {
  const raw = localStorage.getItem(roleKey(code));
  return raw === "host" || raw === "client" ? raw : null;
}

export function setRole(code: string, role: Role): void {
  localStorage.setItem(roleKey(code), role);
}

export function clearRole(code: string): void {
  localStorage.removeItem(roleKey(code));
}

/**
 * Resolve the role for someone arriving via an invite QR / share link.
 * If this device already holds a host claim for the room, keep it (a host
 * shouldn't get demoted by re-scanning their own QR). Otherwise pin the
 * role to "client" so /r/CODE landings always join as a player.
 *
 * URL = intent, localStorage = authority: landing on `/r/CODE/host` without
 * a stored host claim still resolves to client. The `/host` URL segment is
 * decorative (so a host's bookmark / shared link can self-describe), not a
 * promotion path — otherwise a host could escalate someone by sharing the
 * `/host` link, or self-demote by losing localStorage.
 *
 * Returns the resolved role so the caller can act on it without re-reading.
 */
export function acceptInviteRole(code: string): Role {
  const existing = getRole(code);
  if (existing === "host") return "host";
  setRole(code, "client");
  return "client";
}

// Tracks the most recent room this device opened as host. Used by Home to
// surface a one-tap rejoin CTA when a host's tab is closed / app cold-started.
// Only one entry — the typical session is "one venue = one room", so a list UI
// would be friction without payoff.
export function getRecentHostCode(): string | null {
  const raw = localStorage.getItem(RECENT_HOST_KEY);
  return raw?.trim() ? raw : null;
}

export function setRecentHostCode(code: string): void {
  const trimmed = code.trim();
  if (!trimmed) return;
  localStorage.setItem(RECENT_HOST_KEY, trimmed);
}

// Pass `code` to only clear when it matches — protects against a stale tab
// from a previous room overwriting a fresh "current host room" entry.
export function clearRecentHostCode(code?: string): void {
  if (code === undefined) {
    localStorage.removeItem(RECENT_HOST_KEY);
    return;
  }
  if (getRecentHostCode() === code) {
    localStorage.removeItem(RECENT_HOST_KEY);
  }
}

function uuid(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export function getPlayerId(): string {
  let id = localStorage.getItem(ID_KEY);
  if (!id) {
    id = uuid();
    localStorage.setItem(ID_KEY, id);
  }
  return id;
}

export function getPlayerName(): string {
  return localStorage.getItem(NAME_KEY) ?? "";
}

export function setPlayerName(name: string): void {
  localStorage.setItem(NAME_KEY, name);
}

const ANIMALS = [
  "ウサギ",
  "ネコ",
  "イヌ",
  "パンダ",
  "ラッコ",
  "キツネ",
  "リス",
  "ペンギン",
  "アザラシ",
  "クマ",
  "タヌキ",
  "シカ",
  "ウマ",
  "ゾウ",
  "トラ",
  "カワウソ",
  "ハリネズミ",
  "モモンガ",
  "シマウマ",
  "アライグマ",
  "イルカ",
  "アシカ",
  "カピバラ",
  "フェネック",
  "ナマケモノ",
  "オオカミ",
  "アルパカ",
  "ハムスター",
  "コアラ",
  "カンガルー",
] as const;

const ADJECTIVES = [
  "やさしい",
  "はやい",
  "つよい",
  "しずかな",
  "あかるい",
  "ふしぎな",
  "ちいさな",
  "おおきな",
  "やわらかい",
  "すばやい",
  "かしこい",
  "おだやかな",
  "げんきな",
  "ほがらかな",
  "ゆうかんな",
  "さわやかな",
  "きまぐれな",
  "ひかる",
  "おもしろい",
  "ねむい",
] as const;

function randomInt(maxExclusive: number): number {
  if (typeof crypto !== "undefined" && "getRandomValues" in crypto) {
    const buf = new Uint32Array(1);
    crypto.getRandomValues(buf);
    return (buf[0] ?? 0) % maxExclusive;
  }
  return Math.floor(Math.random() * maxExclusive);
}

function pick<T>(arr: readonly T[]): T {
  const item = arr[randomInt(arr.length)];
  if (item === undefined) throw new Error("empty pool");
  return item;
}

function makeAnimalName(): string {
  const adj = pick(ADJECTIVES);
  const animal = pick(ANIMALS);
  return `${adj}${animal}`;
}

export function ensurePlayerName(): string {
  let name = getPlayerName();
  if (!name) {
    name = makeAnimalName();
    setPlayerName(name);
  }
  return name;
}
