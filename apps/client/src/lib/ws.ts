import { type WsStore, createWsStore } from "./ws-store.js";

export type { PlayerLite, WsMessage, WsStoreState as WsStore } from "./ws-store.js";

function defaultSocketFactory(url: string): WebSocket {
  return new WebSocket(url);
}

export const useWs: WsStore = createWsStore({
  socketFactory: defaultSocketFactory,
});
