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

export interface ScanHandler<TConfig = unknown, TState = unknown, TData = unknown> {
  readonly id: string;
  readonly name: string;
  readonly description?: string;
  readonly configSchema: ZodType<TConfig, ZodTypeDef, unknown>;
  readonly dataSchema: ZodType<TData, ZodTypeDef, unknown>;

  initialState(args: HandlerInitArgs<TConfig>): TState;

  /** スキャン時に被スキャナ側 (= 表示している QR) が載せるべきデータを返す */
  payloadFor(args: HandlerPayloadArgs<TConfig, TState>): TData;

  /** 純粋関数として状態遷移 */
  onScan(args: HandlerScanArgs<TConfig, TState, TData>): HandlerScanResult<TState>;

  metrics(args: HandlerMetricsArgs<TConfig, TState>): Metric[];

  isOver?(args: HandlerOverArgs<TConfig, TState>): boolean;
}
