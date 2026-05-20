/**
 * Minimal `DurableObjectNamespace`-shaped fake for unit-testing the Hono
 * routes in `apps/server/src/index.ts` on Node + vitest. Records every
 * `idFromName(name).get(id).fetch(...)` invocation and delegates the actual
 * `Response` to an injectable handler so each test can stage its own DO
 * behavior (success / 400 / collision retry / passthrough).
 */

export type FakeFetchHandler = (
  input: Request | URL | string,
  init?: RequestInit,
) => Response | Promise<Response>;

export type FakeRoomCall = {
  /** name passed to `idFromName` for this stub */
  name: string;
  url: string;
  method: string;
  /** request body as string, or null for GET/HEAD / no body */
  bodyText: string | null;
  /** lower-cased header name -> value */
  headers: Record<string, string>;
};

export type FakeRoomNamespace = {
  /** Cast to `DurableObjectNamespace` for use as `Env.ROOM`. */
  namespace: DurableObjectNamespace;
  /** All recorded fetch calls, in call order. */
  calls: FakeRoomCall[];
  /** Replace the fetch handler for the next call(s). */
  setFetch(handler: FakeFetchHandler): void;
  /** Stage a queue of handlers; each `fetch` consumes one, FIFO. After the
   * queue is exhausted the fallback handler is used. */
  queueFetch(...handlers: FakeFetchHandler[]): void;
  /** Reset both the recorded calls and any queued handlers. */
  reset(): void;
};

const NOOP_HANDLER: FakeFetchHandler = () =>
  new Response("fake-room: no handler configured", { status: 500 });

function captureBody(
  input: Request | URL | string,
  init?: RequestInit,
): {
  url: string;
  method: string;
  headers: Record<string, string>;
  bodyText: string | null;
} {
  const headers: Record<string, string> = {};
  let url: string;
  let method = "GET";
  let bodyText: string | null = null;

  if (input instanceof Request) {
    url = input.url;
    method = input.method;
    input.headers.forEach((value, key) => {
      headers[key] = value;
    });
    if (init?.method) method = init.method;
    if (init?.headers) {
      new Headers(init.headers).forEach((value, key) => {
        headers[key] = value;
      });
    }
  } else {
    url = typeof input === "string" ? input : input.toString();
    method = init?.method ?? "GET";
    if (init?.headers) {
      new Headers(init.headers).forEach((value, key) => {
        headers[key] = value;
      });
    }
  }

  const body = init?.body;
  if (body !== undefined && body !== null) {
    bodyText = typeof body === "string" ? body : String(body);
  }

  return { url, method, headers, bodyText };
}

export function makeFakeRoomNamespace(initial?: FakeFetchHandler): FakeRoomNamespace {
  const calls: FakeRoomCall[] = [];
  let fallback: FakeFetchHandler = initial ?? NOOP_HANDLER;
  const queue: FakeFetchHandler[] = [];

  const makeId = (name: string): DurableObjectId =>
    ({
      name,
      toString() {
        return `id:${name}`;
      },
      equals(other: DurableObjectId) {
        return other?.name === name;
      },
    }) as unknown as DurableObjectId;

  const makeStub = (id: DurableObjectId) => ({
    id,
    name: id.name,
    async fetch(input: Request | URL | string, init?: RequestInit) {
      const recorded = captureBody(input, init);
      calls.push({
        name: id.name ?? "",
        url: recorded.url,
        method: recorded.method,
        bodyText: recorded.bodyText,
        headers: recorded.headers,
      });
      const handler = queue.shift() ?? fallback;
      return handler(input, init);
    },
  });

  const namespace = {
    idFromName(name: string) {
      return makeId(name);
    },
    idFromString(s: string) {
      return makeId(s);
    },
    newUniqueId() {
      return makeId("__unique__");
    },
    get(id: DurableObjectId) {
      return makeStub(id);
    },
    getByName(name: string) {
      return makeStub(makeId(name));
    },
    jurisdiction() {
      return namespace;
    },
  } as unknown as DurableObjectNamespace;

  return {
    namespace,
    calls,
    setFetch(handler) {
      fallback = handler;
    },
    queueFetch(...handlers) {
      queue.push(...handlers);
    },
    reset() {
      calls.length = 0;
      queue.length = 0;
      fallback = NOOP_HANDLER;
    },
  };
}

/** Build a JSON response with the given body/status — convenience for tests. */
export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
