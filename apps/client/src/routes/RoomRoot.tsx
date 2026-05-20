import { useOutletContext } from "react-router-dom";
import { ClientRoom } from "./ClientRoom.js";
import { HostRoom } from "./HostRoom.js";
import type { RoomOutletContext } from "./RoomLayout.js";

export function RoomRoot() {
  const { role } = useOutletContext<RoomOutletContext>();
  return role === "host" ? <HostRoom /> : <ClientRoom />;
}
