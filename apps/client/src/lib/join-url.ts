/**
 * Parse a Join QR payload (URL string) into a room code.
 *
 * Returns the normalized uppercase code on success, or null when the payload
 * is not a join URL we recognise. Accepts:
 *   - full URLs: https://app/r/ABC123 (any origin)
 *   - bare path : /r/ABC123
 *   - role-suffixed path: /r/ABC123/host or /r/ABC123/scoreboard (still resolves to ABC123)
 *   - bare code : ABC123 (last-resort fallback so typed input also works)
 *
 * Role suffixes (`/host`, `/scoreboard`) are intentionally folded back into the
 * room code: a copied host link pasted into the join flow becomes a client
 * join. URL = intent; localStorage = authority (see acceptInviteRole).
 */
export function parseJoinPayload(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  // Try parsing as URL (absolute or relative to a dummy origin so /r/CODE works).
  try {
    const url = trimmed.includes("://")
      ? new URL(trimmed)
      : new URL(trimmed.startsWith("/") ? trimmed : `/${trimmed}`, "https://placeholder.local");
    const match = url.pathname.match(/^\/r\/([^/?#]+)/);
    if (match?.[1]) return decodeURIComponent(match[1]).toUpperCase();
  } catch {
    // fall through to bare-code path
  }

  // Bare alphanumeric code (4–12 chars). Rejects anything containing whitespace,
  // JSON braces, or scheme separators that the URL parser would have caught.
  if (/^[A-Za-z0-9]{4,12}$/.test(trimmed)) return trimmed.toUpperCase();
  return null;
}
