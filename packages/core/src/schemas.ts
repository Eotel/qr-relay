import { z } from "zod";

export const ScanPayloadV1 = z.object({
  v: z.literal(1),
  rid: z.string().min(1),
  pid: z.string().min(1),
  ts: z.number().int().nonnegative(),
  nonce: z.string().min(1),
  data: z.unknown().optional(),
  sig: z.string().optional(),
});

export type ScanPayloadV1 = z.infer<typeof ScanPayloadV1>;

export const PlayerRole = z.enum(["host", "client"]);
export type PlayerRole = z.infer<typeof PlayerRole>;

export const JoinRequest = z.object({
  playerId: z.string().min(1),
  name: z.string().min(1).max(40),
  role: PlayerRole,
});

export type JoinRequest = z.infer<typeof JoinRequest>;

export const CreateRoomRequest = z.object({
  handlerId: z.string().min(1),
  handlerConfig: z.unknown(),
});

export type CreateRoomRequest = z.infer<typeof CreateRoomRequest>;

export const WsClientMsg = z.discriminatedUnion("t", [
  z.object({ t: z.literal("scan"), payload: ScanPayloadV1 }),
  z.object({ t: z.literal("ping") }),
  z.object({ t: z.literal("start") }),
  z.object({ t: z.literal("pause") }),
  z.object({ t: z.literal("resume") }),
  z.object({ t: z.literal("reset") }),
  z.object({ t: z.literal("keepalive") }),
]);

export type WsClientMsg = z.infer<typeof WsClientMsg>;

export const InactivityCloseReason = z.enum(["inactivity"]);
export type InactivityCloseReason = z.infer<typeof InactivityCloseReason>;
