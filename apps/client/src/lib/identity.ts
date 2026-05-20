const ID_KEY = "qr-relay:player-id";
const NAME_KEY = "qr-relay:player-name";

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
