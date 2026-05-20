import { lazy } from "react";
import { Navigate, type RouteObject, useRoutes } from "react-router-dom";
import { Home } from "./routes/Home.js";

export const NewRoomLazy = lazy(() =>
  import("./routes/NewRoom.js").then((m) => ({ default: m.NewRoom })),
);
export const RoomLayoutLazy = lazy(() =>
  import("./routes/RoomLayout.js").then((m) => ({ default: m.RoomLayout })),
);
export const RoomLazy = lazy(() => import("./routes/Room.js").then((m) => ({ default: m.Room })));
export const ScoreboardLazy = lazy(() =>
  import("./routes/Scoreboard.js").then((m) => ({ default: m.Scoreboard })),
);

export const appRouteObjects: RouteObject[] = [
  { path: "/", element: <Home /> },
  { path: "/new", element: <NewRoomLazy /> },
  {
    path: "/r/:code",
    element: <RoomLayoutLazy />,
    children: [
      { index: true, element: <RoomLazy /> },
      { path: "scoreboard", element: <ScoreboardLazy /> },
    ],
  },
  { path: "*", element: <Navigate to="/" replace /> },
];

export function AppRoutes() {
  return useRoutes(appRouteObjects);
}
