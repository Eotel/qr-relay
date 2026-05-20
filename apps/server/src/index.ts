import { listHandlers, requireHandler } from "@qr-relay/core";
import { Hono } from "hono";
import { cors } from "hono/cors";
import "@qr-relay/handlers";
import { presets } from "@qr-relay/handlers";
import { generateRoomCode, normalizeRoomCode } from "./code.js";

export { RoomDurableObject } from "./room.js";

type Env = {
  ROOM: DurableObjectNamespace;
};

const app = new Hono<{ Bindings: Env }>();

app.use("*", cors());

app.get("/api/health", (c) => c.json({ ok: true }));

app.get("/api/handlers", (c) =>
  c.json({
    handlers: listHandlers().map((h) => ({
      id: h.id,
      name: h.name,
      description: h.description,
    })),
    presets,
  }),
);

app.post("/api/rooms", async (c) => {
  const body = await c.req.json().catch(() => null);
  if (!body || typeof body !== "object") return c.json({ error: "bad request" }, 400);
  const { handlerId, handlerConfig } = body as { handlerId?: string; handlerConfig?: unknown };
  if (!handlerId) return c.json({ error: "handlerId required" }, 400);
  try {
    requireHandler(handlerId);
  } catch {
    return c.json({ error: `unknown handler: ${handlerId}` }, 400);
  }

  // try several codes in case of collision (very rare with 32^6 space)
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = generateRoomCode();
    const id = c.env.ROOM.idFromName(`room:${code}`);
    const stub = c.env.ROOM.get(id);
    const res = await stub.fetch("https://ro/init", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code, handlerId, handlerConfig }),
    });
    if (res.ok) {
      return c.json({ code });
    }
    // 400 from validation should not retry
    if (res.status === 400) {
      const errBody = await res.json();
      return c.json(errBody as Record<string, unknown>, 400);
    }
  }
  return c.json({ error: "could not allocate room code" }, 500);
});

app.post("/api/rooms/:code/join", async (c) => {
  const code = normalizeRoomCode(c.req.param("code"));
  const body = (await c.req.json().catch(() => null)) as {
    playerId?: string;
    name?: string;
    role?: "host" | "client";
  } | null;
  if (!body?.playerId || !body.name) return c.json({ error: "bad request" }, 400);
  const role: "host" | "client" = body.role === "host" ? "host" : "client";
  const id = c.env.ROOM.idFromName(`room:${code}`);
  const stub = c.env.ROOM.get(id);
  const res = await stub.fetch("https://ro/join", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ playerId: body.playerId, name: body.name, role }),
  });
  return new Response(await res.text(), {
    status: res.status,
    headers: { "Content-Type": "application/json" },
  });
});

app.get("/api/rooms/:code", async (c) => {
  const code = normalizeRoomCode(c.req.param("code"));
  const id = c.env.ROOM.idFromName(`room:${code}`);
  const stub = c.env.ROOM.get(id);
  const res = await stub.fetch("https://ro/state");
  return new Response(await res.text(), {
    status: res.status,
    headers: { "Content-Type": "application/json" },
  });
});

for (const action of ["start", "pause", "resume", "reset"] as const) {
  app.post(`/api/rooms/:code/${action}`, async (c) => {
    const code = normalizeRoomCode(c.req.param("code"));
    const id = c.env.ROOM.idFromName(`room:${code}`);
    const stub = c.env.ROOM.get(id);
    const res = await stub.fetch(`https://ro/${action}`, { method: "POST" });
    return new Response(await res.text(), {
      status: res.status,
      headers: { "Content-Type": "application/json" },
    });
  });
}

app.get("/ws/:code", async (c) => {
  if (c.req.header("upgrade")?.toLowerCase() !== "websocket") {
    return c.text("expected websocket", 426);
  }
  const code = normalizeRoomCode(c.req.param("code"));
  const pid = c.req.query("pid");
  if (!pid) return c.text("pid required", 400);
  const id = c.env.ROOM.idFromName(`room:${code}`);
  const stub = c.env.ROOM.get(id);
  return stub.fetch(
    new Request(`https://ro/ws?pid=${encodeURIComponent(pid)}`, {
      headers: c.req.raw.headers,
    }),
  );
});

export default app;
