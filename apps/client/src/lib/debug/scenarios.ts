export type ScenarioBot = { id: string; name: string };
export type ScanPair = { scannerId: string; scannedId: string };

export function roundRobinChain(bots: ScenarioBot[]): ScanPair[] {
  if (bots.length < 2) return [];
  const pairs: ScanPair[] = [];
  for (let i = 0; i < bots.length; i += 1) {
    const a = bots[i];
    const b = bots[(i + 1) % bots.length];
    if (!a || !b) continue;
    pairs.push({ scannerId: a.id, scannedId: b.id });
  }
  return pairs;
}

export function allToAllBurst(bots: ScenarioBot[]): ScanPair[] {
  const pairs: ScanPair[] = [];
  for (const a of bots) {
    for (const b of bots) {
      if (a.id === b.id) continue;
      pairs.push({ scannerId: a.id, scannedId: b.id });
    }
  }
  return pairs;
}

export type RandomStormOpts = {
  rateHz: number;
  durationMs: number;
  rng: () => number;
};

export function randomStormSteps(bots: ScenarioBot[], opts: RandomStormOpts): ScanPair[] {
  if (bots.length < 2) return [];
  const count = Math.floor((opts.rateHz * opts.durationMs) / 1000);
  const steps: ScanPair[] = [];
  for (let i = 0; i < count; i += 1) {
    const aIdx = Math.floor(opts.rng() * bots.length);
    let bIdx = Math.floor(opts.rng() * bots.length);
    if (bIdx === aIdx) bIdx = (bIdx + 1) % bots.length;
    const a = bots[aIdx];
    const b = bots[bIdx];
    if (!a || !b) continue;
    steps.push({ scannerId: a.id, scannedId: b.id });
  }
  return steps;
}

export type TokenRelayOpts = {
  holderId: string;
  steps: number;
  rng: () => number;
};

export function tokenRelaySteps(bots: ScenarioBot[], opts: TokenRelayOpts): ScanPair[] {
  if (bots.length < 2) return [];
  if (!bots.some((b) => b.id === opts.holderId)) return [];
  const steps: ScanPair[] = [];
  let scannerId = opts.holderId;
  for (let i = 0; i < opts.steps; i += 1) {
    const targets = bots.filter((b) => b.id !== scannerId);
    if (targets.length === 0) break;
    const idx = Math.floor(opts.rng() * targets.length);
    const target = targets[idx];
    if (!target) break;
    steps.push({ scannerId, scannedId: target.id });
    scannerId = target.id;
  }
  return steps;
}
