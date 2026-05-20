export type Rng = {
  nonce: () => string;
};

function defaultNonce(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export const systemRng: Rng = {
  nonce: defaultNonce,
};
