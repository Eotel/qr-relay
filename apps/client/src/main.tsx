import React, { Suspense } from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import "@qr-relay/ui/styles.css";
import { initInstallPrompt } from "./lib/install-prompt.js";
import { AppRoutes } from "./routes.js";

initInstallPrompt();

function RouteFallback() {
  return (
    <main className="mx-auto flex max-w-[720px] flex-col items-center px-4 pt-[calc(1.5rem+env(safe-area-inset-top))] pb-8">
      <span className="text-sm font-bold tracking-[0.14em] text-muted-foreground">読み込み中…</span>
    </main>
  );
}

const root = document.getElementById("root");
if (!root) throw new Error("missing #root");

ReactDOM.createRoot(root).render(
  <React.StrictMode>
    <BrowserRouter>
      <Suspense fallback={<RouteFallback />}>
        <AppRoutes />
      </Suspense>
    </BrowserRouter>
  </React.StrictMode>,
);
