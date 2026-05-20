import { lazy } from "react";
import { Navigate, type RouteObject, useRoutes } from "react-router-dom";
import { Home } from "./routes/Home.js";

export const NewRoomLazy = lazy(() =>
  import("./routes/NewRoom.js").then((m) => ({ default: m.NewRoom })),
);
export const RoomLayoutLazy = lazy(() =>
  import("./routes/RoomLayout.js").then((m) => ({ default: m.RoomLayout })),
);
export const RoomRootLazy = lazy(() =>
  import("./routes/RoomRoot.js").then((m) => ({ default: m.RoomRoot })),
);
export const ScoreboardLazy = lazy(() =>
  import("./routes/Scoreboard.js").then((m) => ({ default: m.Scoreboard })),
);
export const RoomClosedLazy = lazy(() =>
  import("./routes/RoomClosed.js").then((m) => ({ default: m.RoomClosed })),
);

// DEV-only debug routes. Gated on `import.meta.env.DEV` (a build-time constant)
// so Vite/Rollup eliminates the entire DEV branch — including the dynamic
// import() calls — from `vite build`. The production bundle ships without
// /debug, DebugRoom, the bot pool, scenarios, or edge-case payloads.
const debugRouteObjects: RouteObject[] = import.meta.env.DEV
  ? (() => {
      const Debug = lazy(() =>
        import("./routes/Debug.js").then((m) => ({ default: m.Debug })),
      );
      const DebugRoom = lazy(() =>
        import("./routes/DebugRoom.js").then((m) => ({ default: m.DebugRoom })),
      );
      return [
        { path: "/debug", element: <Debug /> },
        { path: "/debug/:code", element: <DebugRoom /> },
      ];
    })()
  : [];

export const appRouteObjects: RouteObject[] = [
  { path: "/", element: <Home /> },
  { path: "/new", element: <NewRoomLazy /> },
  // /r/:code/closed is intentionally outside RoomLayout so it doesn't re-trigger
  // a WS join after the room is gone.
  { path: "/r/:code/closed", element: <RoomClosedLazy /> },
  {
    path: "/r/:code",
    element: <RoomLayoutLazy />,
    children: [
      { index: true, element: <RoomRootLazy /> },
      // `/host` is intent decoration. The localStorage host claim is the
      // authority; landing here without one still falls back to client (see
      // acceptInviteRole in lib/identity.ts). The segment exists so a host's
      // bookmark / PWA shortcut can self-describe its role.
      { path: "host", element: <RoomRootLazy /> },
      { path: "scoreboard", element: <ScoreboardLazy /> },
    ],
  },
  ...debugRouteObjects,
  { path: "*", element: <Navigate to="/" replace /> },
];

export function AppRoutes() {
  return useRoutes(appRouteObjects);
}
