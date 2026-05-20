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
      { path: "scoreboard", element: <ScoreboardLazy /> },
    ],
  },
  { path: "*", element: <Navigate to="/" replace /> },
];

export function AppRoutes() {
  return useRoutes(appRouteObjects);
}
