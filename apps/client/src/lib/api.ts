import {
  type ApiClient,
  type JoinRole,
  type RoomInfo,
  type RoomSnapshot,
  defaultApiClient,
} from "./api-client.js";

export type { RoomInfo, JoinRole };
// 旧来の型名 (RoomState) を維持して既存 import を壊さない
export type RoomState = RoomSnapshot;

let activeClient: ApiClient = defaultApiClient;

export function setApiClient(client: ApiClient): void {
  activeClient = client;
}

export function getApiClient(): ApiClient {
  return activeClient;
}

export function listHandlersAndPresets() {
  return activeClient.listHandlersAndPresets();
}

export function createRoom(handlerId: string, handlerConfig: unknown) {
  return activeClient.createRoom(handlerId, handlerConfig);
}

export function getRoom(code: string) {
  return activeClient.getRoom(code);
}

export function joinRoom(code: string, playerId: string, name: string, role: JoinRole) {
  return activeClient.joinRoom(code, playerId, name, role);
}

export function startRoom(code: string) {
  return activeClient.startRoom(code);
}

export function pauseRoom(code: string) {
  return activeClient.pauseRoom(code);
}

export function resumeRoom(code: string) {
  return activeClient.resumeRoom(code);
}

export function resetRoom(code: string) {
  return activeClient.resetRoom(code);
}
