import type { RoomSnapshot } from "./api-client.js";
import { ensurePlayerName } from "./identity.js";

export interface ResolveNicknameArgs {
  input: string;
  selfId: string;
  players: RoomSnapshot["players"];
}

export function resolveNickname({ input, selfId, players }: ResolveNicknameArgs): string {
  const base = input || ensurePlayerName();
  const others = new Set(players.filter((p) => p.id !== selfId).map((p) => p.name));
  if (!others.has(base)) return base;
  for (let i = 2; i < 1000; i++) {
    const candidate = `${base}(${i})`;
    if (!others.has(candidate)) return candidate;
  }
  return `${base}(${selfId.slice(0, 4)})`;
}
