import "@qr-relay/handlers";
import { describe, expect, it } from "vitest";
import app from "./index.js";
import { jsonResponse, makeFakeRoomNamespace } from "./test-helpers/fake-room-namespace.js";

function setup(initialFetch?: Parameters<ReturnType<typeof makeFakeRoomNamespace>["setFetch"]>[0]) {
  const fake = makeFakeRoomNamespace(initialFetch);
  return { fake, env: { ROOM: fake.namespace } };
}

describe("GET /api/health", () => {
  it("returns 200 + { ok: true }", async () => {
    const { env } = setup();
    const res = await app.request("/api/health", undefined, env);
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ ok: true });
  });
});

describe("GET /api/handlers", () => {
  it("returns the registered handlers + presets envelope", async () => {
    const { env } = setup();
    const res = await app.request("/api/handlers", undefined, env);
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      handlers: { id: string; name: string; description: string }[];
      presets: { id: string; name: string }[];
    };
    expect(Array.isArray(body.handlers)).toBe(true);
    expect(body.handlers.length).toBeGreaterThanOrEqual(1);
    expect(body.handlers.some((h) => h.id === "relay")).toBe(true);
    expect(Array.isArray(body.presets)).toBe(true);
    expect(body.presets.length).toBeGreaterThanOrEqual(1);
    for (const preset of body.presets) {
      expect(typeof preset.id).toBe("string");
      expect(typeof preset.name).toBe("string");
    }
  });
});

describe("POST /api/rooms", () => {
  it("returns { code } and posts /init to the DO when the first attempt succeeds", async () => {
    const { fake, env } = setup(() => jsonResponse({ ok: true }));
    const res = await app.request(
      "/api/rooms",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ handlerId: "relay", handlerConfig: { tag: "x" } }),
      },
      env,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { code: string };
    expect(body.code).toMatch(/^[A-HJ-NP-Z2-9]{6}$/);
    expect(fake.calls).toHaveLength(1);
    const [call] = fake.calls;
    expect(call?.url).toBe("https://ro/init");
    expect(call?.method).toBe("POST");
    expect(call?.name).toBe(`room:${body.code}`);
    const sent = JSON.parse(call?.bodyText ?? "{}") as {
      code: string;
      handlerId: string;
      handlerConfig: { tag: string };
    };
    expect(sent.code).toBe(body.code);
    expect(sent.handlerId).toBe("relay");
    expect(sent.handlerConfig).toEqual({ tag: "x" });
  });

  it("400 'bad request' when body is not JSON", async () => {
    const { env } = setup();
    const res = await app.request(
      "/api/rooms",
      { method: "POST", body: "not-json", headers: { "Content-Type": "text/plain" } },
      env,
    );
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ error: "bad request" });
  });

  it("400 'handlerId required' when handlerId is missing", async () => {
    const { env } = setup();
    const res = await app.request(
      "/api/rooms",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      },
      env,
    );
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ error: "handlerId required" });
  });

  it("400 'unknown handler' for an unregistered handlerId", async () => {
    const { fake, env } = setup();
    const res = await app.request(
      "/api/rooms",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ handlerId: "definitely-not-real" }),
      },
      env,
    );
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({
      error: "unknown handler: definitely-not-real",
    });
    expect(fake.calls).toHaveLength(0);
  });

  it("passes a DO 400 through verbatim and does NOT retry", async () => {
    const { fake, env } = setup(() =>
      jsonResponse({ error: "invalid handler config", issues: ["bad.field"] }, 400),
    );
    const res = await app.request(
      "/api/rooms",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ handlerId: "relay" }),
      },
      env,
    );
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({
      error: "invalid handler config",
      issues: ["bad.field"],
    });
    expect(fake.calls).toHaveLength(1);
  });

  it("retries up to 5 attempts and 500s when every attempt is non-ok / non-400", async () => {
    const { fake, env } = setup(() => new Response("conflict", { status: 409 }));
    const res = await app.request(
      "/api/rooms",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ handlerId: "relay" }),
      },
      env,
    );
    expect(res.status).toBe(500);
    await expect(res.json()).resolves.toEqual({ error: "could not allocate room code" });
    expect(fake.calls).toHaveLength(5);
    // each retry uses a fresh code, so the DO names should not all collide
    const distinctNames = new Set(fake.calls.map((c) => c.name));
    expect(distinctNames.size).toBeGreaterThan(1);
  });
});

describe("POST /api/rooms/:code/join", () => {
  it("400 when playerId is missing", async () => {
    const { fake, env } = setup();
    const res = await app.request(
      "/api/rooms/ABC123/join",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Alice" }),
      },
      env,
    );
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ error: "bad request" });
    expect(fake.calls).toHaveLength(0);
  });

  it("400 when name is missing", async () => {
    const { fake, env } = setup();
    const res = await app.request(
      "/api/rooms/ABC123/join",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ playerId: "p1" }),
      },
      env,
    );
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ error: "bad request" });
    expect(fake.calls).toHaveLength(0);
  });

  it("normalizes a non-'host' role to 'client' in the forwarded body and upper-cases the code", async () => {
    const { fake, env } = setup(() => jsonResponse({ ok: true, role: "client" }));
    const res = await app.request(
      "/api/rooms/abc123/join",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ playerId: "p1", name: "Alice", role: "spectator" }),
      },
      env,
    );
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ ok: true, role: "client" });
    const [call] = fake.calls;
    expect(call?.url).toBe("https://ro/join");
    expect(call?.method).toBe("POST");
    expect(call?.name).toBe("room:ABC123");
    const sent = JSON.parse(call?.bodyText ?? "{}");
    expect(sent).toEqual({ playerId: "p1", name: "Alice", role: "client" });
  });

  it("keeps role='host' when explicitly host", async () => {
    const { fake, env } = setup(() => jsonResponse({ ok: true }));
    const res = await app.request(
      "/api/rooms/ABC123/join",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ playerId: "h1", name: "Host", role: "host" }),
      },
      env,
    );
    expect(res.status).toBe(200);
    const sent = JSON.parse(fake.calls[0]?.bodyText ?? "{}");
    expect(sent.role).toBe("host");
  });

  it("forwards the DO status and body verbatim on error", async () => {
    const { env } = setup(() => jsonResponse({ error: "room not found" }, 404));
    const res = await app.request(
      "/api/rooms/ZZZZZZ/join",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ playerId: "p1", name: "A" }),
      },
      env,
    );
    expect(res.status).toBe(404);
    await expect(res.json()).resolves.toEqual({ error: "room not found" });
  });
});

describe("GET /api/rooms/:code", () => {
  it("forwards the DO /state response", async () => {
    const { fake, env } = setup(() =>
      jsonResponse({ phase: "ready", players: [], handlerId: "relay" }),
    );
    const res = await app.request("/api/rooms/abc123", undefined, env);
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      phase: "ready",
      players: [],
      handlerId: "relay",
    });
    const [call] = fake.calls;
    expect(call?.url).toBe("https://ro/state");
    expect(call?.method).toBe("GET");
    expect(call?.name).toBe("room:ABC123");
  });
});

describe("POST /api/rooms/:code/{start,pause,resume,reset}", () => {
  for (const action of ["start", "pause", "resume", "reset"] as const) {
    it(`dispatches '${action}' to the DO and passes the response through`, async () => {
      const { fake, env } = setup(() => jsonResponse({ ok: true, action }));
      const res = await app.request(
        `/api/rooms/abc123/${action}`,
        { method: "POST" },
        env,
      );
      expect(res.status).toBe(200);
      await expect(res.json()).resolves.toEqual({ ok: true, action });
      expect(fake.calls).toHaveLength(1);
      const [call] = fake.calls;
      expect(call?.url).toBe(`https://ro/${action}`);
      expect(call?.method).toBe("POST");
      expect(call?.name).toBe("room:ABC123");
    });
  }

  it("forwards the DO status code when the action fails", async () => {
    const { env } = setup(() => jsonResponse({ error: "phase: not running" }, 409));
    const res = await app.request("/api/rooms/ABC123/pause", { method: "POST" }, env);
    expect(res.status).toBe(409);
    await expect(res.json()).resolves.toEqual({ error: "phase: not running" });
  });
});

describe("GET /ws/:code", () => {
  it("426 when the Upgrade header is missing", async () => {
    const { fake, env } = setup();
    const res = await app.request("/ws/ABC123?pid=p1", undefined, env);
    expect(res.status).toBe(426);
    await expect(res.text()).resolves.toContain("expected websocket");
    expect(fake.calls).toHaveLength(0);
  });

  it("400 when Upgrade is set but pid query is missing", async () => {
    const { fake, env } = setup();
    const res = await app.request(
      "/ws/ABC123",
      { headers: { Upgrade: "websocket" } },
      env,
    );
    expect(res.status).toBe(400);
    await expect(res.text()).resolves.toContain("pid required");
    expect(fake.calls).toHaveLength(0);
  });
});
