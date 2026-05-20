import { describe, expect, it, vi } from "vitest";
import { createApiClient } from "./api-client.js";

function jsonResponse(body: unknown, init: { status?: number } = {}): Response {
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: { "Content-Type": "application/json" },
  });
}

describe("createApiClient", () => {
  it("listHandlersAndPresets: GET /api/handlers と parse 結果を返す", async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(
      jsonResponse({
        handlers: [{ id: "relay", name: "Relay" }],
        presets: [{ id: "p1", name: "P1", rule: {}, description: "" }],
      }),
    );
    const client = createApiClient(fetchImpl);

    const result = await client.listHandlersAndPresets();

    expect(fetchImpl).toHaveBeenCalledWith("/api/handlers");
    expect(result.handlers).toEqual([{ id: "relay", name: "Relay" }]);
    expect(result.presets[0]?.id).toBe("p1");
  });

  it("listHandlersAndPresets: HTTP エラーで例外", async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(new Response("nope", { status: 500 }));
    const client = createApiClient(fetchImpl);
    await expect(client.listHandlersAndPresets()).rejects.toThrow(/500/);
  });

  it("createRoom: POST /api/rooms に handlerId と handlerConfig を送る", async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(jsonResponse({ code: "ABC123" }));
    const client = createApiClient(fetchImpl);

    const code = await client.createRoom("relay", { duration: 60 });

    expect(code).toBe("ABC123");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const firstCall = fetchImpl.mock.calls[0];
    if (!firstCall) throw new Error("expected fetch call");
    const [url, init] = firstCall;
    expect(url).toBe("/api/rooms");
    expect(init?.method).toBe("POST");
    expect(JSON.parse(init?.body as string)).toEqual({
      handlerId: "relay",
      handlerConfig: { duration: 60 },
    });
    expect(init?.headers).toMatchObject({ "Content-Type": "application/json" });
  });

  it("createRoom: 失敗時はレスポンス本文を含む例外", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(new Response("invalid config", { status: 400 }));
    const client = createApiClient(fetchImpl);
    await expect(client.createRoom("relay", {})).rejects.toThrow(/invalid config/);
  });

  it("getRoom: GET /api/rooms/:code を叩いて snapshot を返す", async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(
      jsonResponse({
        room: { code: "ABC" },
        players: [{ id: "p1", name: "n", joinedAt: 0 }],
        state: null,
        metrics: [],
      }),
    );
    const client = createApiClient(fetchImpl);
    const snap = await client.getRoom("ABC");
    expect(fetchImpl).toHaveBeenCalledWith("/api/rooms/ABC");
    expect(snap.players[0]?.name).toBe("n");
  });

  it("getRoom: 404 で例外", async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(new Response("nope", { status: 404 }));
    const client = createApiClient(fetchImpl);
    await expect(client.getRoom("ZZZZZZ")).rejects.toThrow(/404/);
  });

  it("getRoom: code を URL エンコードする", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ room: { code: "A B" }, players: [], state: null, metrics: [] }));
    const client = createApiClient(fetchImpl);
    await client.getRoom("A B");
    expect(fetchImpl).toHaveBeenCalledWith("/api/rooms/A%20B");
  });

  it("joinRoom: /join に POST してから /state を GET し、合算 snapshot を返す", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ room: { code: "ABC" }, players: [] }))
      .mockResolvedValueOnce(
        jsonResponse({
          room: { code: "ABC", handlerId: "relay" },
          players: [{ id: "p1", name: "n", joinedAt: 0 }],
          state: { foo: 1 },
          metrics: [],
        }),
      );
    const client = createApiClient(fetchImpl);

    const snap = await client.joinRoom("ABC", "p1", "Alice", "client");

    expect(fetchImpl).toHaveBeenNthCalledWith(
      1,
      "/api/rooms/ABC/join",
      expect.objectContaining({ method: "POST" }),
    );
    expect(fetchImpl).toHaveBeenNthCalledWith(2, "/api/rooms/ABC");
    expect(snap.room.code).toBe("ABC");
    expect(snap.players).toHaveLength(1);
    const joinCall = fetchImpl.mock.calls[0];
    if (!joinCall) throw new Error("expected join call");
    const [, init] = joinCall;
    expect(JSON.parse(init?.body as string)).toEqual({
      playerId: "p1",
      name: "Alice",
      role: "client",
    });
  });

  it("joinRoom: role=host を body に含める", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ room: { code: "ABC" }, players: [] }))
      .mockResolvedValueOnce(
        jsonResponse({ room: { code: "ABC" }, players: [], state: null, metrics: [] }),
      );
    const client = createApiClient(fetchImpl);
    await client.joinRoom("ABC", "h1", "Host", "host");
    const joinCall = fetchImpl.mock.calls[0];
    if (!joinCall) throw new Error("expected join call");
    const [, init] = joinCall;
    expect(JSON.parse(init?.body as string)).toEqual({
      playerId: "h1",
      name: "Host",
      role: "host",
    });
  });

  it("joinRoom: code を URL エンコードする", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ room: { code: "A B" }, players: [] }))
      .mockResolvedValueOnce(
        jsonResponse({ room: { code: "A B" }, players: [], state: null, metrics: [] }),
      );
    const client = createApiClient(fetchImpl);
    await client.joinRoom("A B", "p1", "n", "client");
    expect(fetchImpl.mock.calls[0]?.[0]).toBe("/api/rooms/A%20B/join");
    expect(fetchImpl.mock.calls[1]?.[0]).toBe("/api/rooms/A%20B");
  });

  it("startRoom: POST /api/rooms/:code/start", async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(new Response(null, { status: 200 }));
    const client = createApiClient(fetchImpl);
    await client.startRoom("ABC");
    expect(fetchImpl).toHaveBeenCalledWith(
      "/api/rooms/ABC/start",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("startRoom: 失敗時は例外", async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(new Response(null, { status: 500 }));
    const client = createApiClient(fetchImpl);
    await expect(client.startRoom("ABC")).rejects.toThrow(/500/);
  });
});
