const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // ambiguous chars dropped

export function generateRoomCode(length = 6): string {
  let out = "";
  const buf = new Uint8Array(length);
  crypto.getRandomValues(buf);
  for (let i = 0; i < length; i++) {
    const value = buf[i] ?? 0;
    const idx = value % ALPHABET.length;
    out += ALPHABET[idx];
  }
  return out;
}

export function normalizeRoomCode(code: string): string {
  return code.trim().toUpperCase();
}
