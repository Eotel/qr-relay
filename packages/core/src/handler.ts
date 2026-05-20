import type { ZodType, ZodTypeDef } from "zod";
import type { GameEvent, Metric, Player } from "./types.js";

export type HandlerInitArgs<TConfig> = {
  config: TConfig;
  players: Player[];
  now: number;
};

export type HandlerPayloadArgs<TConfig, TState> = {
  state: TState;
  config: TConfig;
  player: Player;
};

export type HandlerScanArgs<TConfig, TState, TData> = {
  state: TState;
  config: TConfig;
  scanner: Player;
  scanned: Player;
  payloadData: TData;
  now: number;
};

export type HandlerScanResult<TState> = {
  nextState: TState;
  events: GameEvent[];
};

export type HandlerMetricsArgs<TConfig, TState> = {
  state: TState;
  config: TConfig;
  players: Player[];
  now: number;
};

export type HandlerOverArgs<TConfig, TState> = {
  state: TState;
  config: TConfig;
  now: number;
};

export type HandlerPlayerJoinArgs<TConfig, TState> = {
  state: TState;
  config: TConfig;
  player: Player;
  now: number;
};

export type HandlerPlayerLeaveArgs<TConfig, TState> = {
  state: TState;
  config: TConfig;
  player: Player;
  now: number;
};

export interface ScanHandler<TConfig = unknown, TState = unknown, TData = unknown> {
  readonly id: string;
  readonly name: string;
  readonly description?: string;
  readonly configSchema: ZodType<TConfig, ZodTypeDef, unknown>;
  readonly dataSchema: ZodType<TData, ZodTypeDef, unknown>;

  initialState(args: HandlerInitArgs<TConfig>): TState;

  /**
   * Mid-game join hook. Called by reduceJoin when a new player joins after
   * initialState has already produced a state (i.e. the game has been
   * started). Handlers materialize the new player's slot here so late
   * joiners can scan and be scanned immediately. If omitted, the state is
   * left unchanged (late-joiner support is opt-in per handler).
   */
  onPlayerJoin?(args: HandlerPlayerJoinArgs<TConfig, TState>): TState;

  /**
   * Player removal hook. Called by reduceLeave so handlers can drop the
   * player's slot from internal state. If omitted, the state is left
   * unchanged (metrics will derive from the new `players` list and any
   * orphan slot is silently ignored).
   */
  onPlayerLeave?(args: HandlerPlayerLeaveArgs<TConfig, TState>): TState;

  /** スキャン時に被スキャナ側 (= 表示している QR) が載せるべきデータを返す */
  payloadFor(args: HandlerPayloadArgs<TConfig, TState>): TData;

  /** 純粋関数として状態遷移 */
  onScan(args: HandlerScanArgs<TConfig, TState, TData>): HandlerScanResult<TState>;

  metrics(args: HandlerMetricsArgs<TConfig, TState>): Metric[];

  isOver?(args: HandlerOverArgs<TConfig, TState>): boolean;
}
