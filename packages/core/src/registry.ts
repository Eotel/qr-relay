import type { ScanHandler } from "./handler.js";

const handlers = new Map<string, ScanHandler<unknown, unknown, unknown>>();

export function registerHandler<TConfig, TState, TData>(
  handler: ScanHandler<TConfig, TState, TData>,
): void {
  handlers.set(handler.id, handler as unknown as ScanHandler<unknown, unknown, unknown>);
}

export function getHandler(id: string): ScanHandler<unknown, unknown, unknown> | undefined {
  return handlers.get(id);
}

export function requireHandler(id: string): ScanHandler<unknown, unknown, unknown> {
  const h = handlers.get(id);
  if (!h) {
    throw new Error(`Handler not found: ${id}`);
  }
  return h;
}

export function listHandlers(): ScanHandler<unknown, unknown, unknown>[] {
  return Array.from(handlers.values());
}

export function clearHandlers(): void {
  handlers.clear();
}
