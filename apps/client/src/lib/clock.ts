export type TimerId = number;

export type Clock = {
  now: () => number;
  setTimeout: (fn: () => void, ms: number) => TimerId;
  clearTimeout: (id: TimerId) => void;
};

export const systemClock: Clock = {
  now: () => Date.now(),
  setTimeout: (fn, ms) => window.setTimeout(fn, ms),
  clearTimeout: (id) => window.clearTimeout(id),
};
