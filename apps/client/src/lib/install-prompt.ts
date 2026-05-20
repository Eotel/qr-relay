/**
 * Captures the `beforeinstallprompt` event so the UI can offer "Add to Home
 * Screen" on Chromium browsers that support it. iOS Safari / Firefox do not
 * fire this event — those users get the manual instructions in HomeFaq.
 */
export type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

let deferred: BeforeInstallPromptEvent | null = null;
const listeners = new Set<(canInstall: boolean) => void>();

function notify(): void {
  for (const l of listeners) l(deferred !== null);
}

export function initInstallPrompt(): void {
  if (typeof window === "undefined") return;
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferred = e as BeforeInstallPromptEvent;
    notify();
  });
  window.addEventListener("appinstalled", () => {
    deferred = null;
    notify();
  });
}

export function subscribeInstallable(fn: (canInstall: boolean) => void): () => void {
  listeners.add(fn);
  fn(deferred !== null);
  return () => {
    listeners.delete(fn);
  };
}

export function canInstall(): boolean {
  return deferred !== null;
}

export async function promptInstall(): Promise<"accepted" | "dismissed" | "unavailable"> {
  if (!deferred) return "unavailable";
  await deferred.prompt();
  const choice = await deferred.userChoice;
  deferred = null;
  notify();
  return choice.outcome;
}
