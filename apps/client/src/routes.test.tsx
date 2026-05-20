import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { isValidElement } from "react";
import { matchRoutes } from "react-router-dom";
import { describe, expect, it } from "vitest";
import {
  RoomClosedLazy,
  RoomLayoutLazy,
  RoomRootLazy,
  ScoreboardLazy,
  appRouteObjects,
} from "./routes.js";

const here = dirname(fileURLToPath(import.meta.url));

function elementType(node: unknown): unknown {
  return isValidElement(node) ? node.type : undefined;
}

describe("appRouteObjects", () => {
  it("nests RoomRoot as the index child of RoomLayout for /r/:code", () => {
    const matches = matchRoutes(appRouteObjects, "/r/ABC123");
    expect(matches).not.toBeNull();
    const chain = matches ?? [];
    expect(chain).toHaveLength(2);
    expect(elementType(chain[0]?.route.element)).toBe(RoomLayoutLazy);
    expect(elementType(chain[1]?.route.element)).toBe(RoomRootLazy);
    expect(chain[1]?.route.index).toBe(true);
  });

  it("nests RoomRoot under RoomLayout for /r/:code/host (host-intent URL)", () => {
    const matches = matchRoutes(appRouteObjects, "/r/ABC123/host");
    expect(matches).not.toBeNull();
    const chain = matches ?? [];
    expect(chain).toHaveLength(2);
    expect(elementType(chain[0]?.route.element)).toBe(RoomLayoutLazy);
    expect(elementType(chain[1]?.route.element)).toBe(RoomRootLazy);
  });

  it("nests Scoreboard under RoomLayout for /r/:code/scoreboard", () => {
    const matches = matchRoutes(appRouteObjects, "/r/ABC123/scoreboard");
    expect(matches).not.toBeNull();
    const chain = matches ?? [];
    expect(chain).toHaveLength(2);
    expect(elementType(chain[0]?.route.element)).toBe(RoomLayoutLazy);
    expect(elementType(chain[1]?.route.element)).toBe(ScoreboardLazy);
  });

  it("matches /r/:code/closed to RoomClosed without RoomLayout in chain", () => {
    const matches = matchRoutes(appRouteObjects, "/r/ABC123/closed");
    expect(matches).not.toBeNull();
    const chain = matches ?? [];
    // closed is a top-level route, NOT nested under RoomLayout — otherwise
    // RoomLayout would try to (re-)join a room that has just been destroyed.
    expect(chain).toHaveLength(1);
    expect(elementType(chain[0]?.route.element)).toBe(RoomClosedLazy);
  });
});

describe("outlet context coupling", () => {
  // HostRoom / ClientRoom / Scoreboard explicitly destructure RoomOutletContext
  // from useOutletContext(). If they ever stop nesting under RoomLayout, runtime
  // crashes — so we hard-couple the structural test above to actual context usage.
  const sources: Array<readonly [string, string]> = [
    ["RoomRoot.tsx", join(here, "routes", "RoomRoot.tsx")],
    ["HostRoom.tsx", join(here, "routes", "HostRoom.tsx")],
    ["ClientRoom.tsx", join(here, "routes", "ClientRoom.tsx")],
    ["Scoreboard.tsx", join(here, "routes", "Scoreboard.tsx")],
  ];

  for (const [label, path] of sources) {
    it(`${label} uses useOutletContext<RoomOutletContext>`, () => {
      const src = readFileSync(path, "utf8");
      expect(src).toMatch(/useOutletContext<RoomOutletContext>/);
    });
  }
});
