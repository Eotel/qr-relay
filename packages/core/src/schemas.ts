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

export const JoinRequest = z.object({
  playerId: z.string().min(1),
  name: z.string().min(1).max(40),
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
  z.object({ t: z.literal("end") }),
]);

export type WsClientMsg = z.infer<typeof WsClientMsg>;
