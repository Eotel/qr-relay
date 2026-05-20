import React, { Suspense, lazy } from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import "@qr-relay/ui/styles.css";
import { Home } from "./routes/Home.js";

const NewRoom = lazy(() => import("./routes/NewRoom.js").then((m) => ({ default: m.NewRoom })));
const Room = lazy(() => import("./routes/Room.js").then((m) => ({ default: m.Room })));
const Scoreboard = lazy(() =>
  import("./routes/Scoreboard.js").then((m) => ({ default: m.Scoreboard })),
);

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
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/new" element={<NewRoom />} />
          <Route path="/r/:code" element={<Room />} />
          <Route path="/r/:code/scoreboard" element={<Scoreboard />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  </React.StrictMode>,
);
