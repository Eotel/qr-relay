export type Clock = {
  now: () => number;
};

export const systemClock: Clock = {
  now: () => Date.now(),
};

/**
 * Port for scheduling a single future wake-up (Cloudflare DO Alarm semantics).
 * `setAlarm(t)` overwrites any pending alarm; only one is active at a time.
 */
export type AlarmScheduler = {
  setAlarm: (timestampMs: number) => Promise<void>;
  getAlarm: () => Promise<number | null>;
  deleteAlarm: () => Promise<void>;
};

/**
 * Production AlarmScheduler backed by Cloudflare Durable Object storage. The
 * storage object exposes setAlarm/getAlarm/deleteAlarm; we wrap them to keep
 * the DO class free of direct storage calls for alarm logic.
 */
export function createDurableObjectAlarmScheduler(storage: DurableObjectStorage): AlarmScheduler {
  return {
    setAlarm: async (t) => {
      await storage.setAlarm(t);
    },
    getAlarm: async () => (await storage.getAlarm()) ?? null,
    deleteAlarm: async () => {
      await storage.deleteAlarm();
    },
  };
}
