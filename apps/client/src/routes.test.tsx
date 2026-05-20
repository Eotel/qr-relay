import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { isValidElement } from "react";
import { matchRoutes } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { RoomLayoutLazy, RoomLazy, ScoreboardLazy, appRouteObjects } from "./routes.js";

const here = dirname(fileURLToPath(import.meta.url));

function elementType(node: unknown): unknown {
  return isValidElement(node) ? node.type : undefined;
}

describe("appRouteObjects", () => {
  it("nests Room as the index child of RoomLayout for /r/:code", () => {
    const matches = matchRoutes(appRouteObjects, "/r/ABC123");
    expect(matches).not.toBeNull();
    const chain = matches ?? [];
    expect(chain).toHaveLength(2);
    expect(elementType(chain[0]?.route.element)).toBe(RoomLayoutLazy);
    expect(elementType(chain[1]?.route.element)).toBe(RoomLazy);
    expect(chain[1]?.route.index).toBe(true);
  });

  it("nests Scoreboard under RoomLayout for /r/:code/scoreboard", () => {
    const matches = matchRoutes(appRouteObjects, "/r/ABC123/scoreboard");
    expect(matches).not.toBeNull();
    const chain = matches ?? [];
    expect(chain).toHaveLength(2);
    expect(elementType(chain[0]?.route.element)).toBe(RoomLayoutLazy);
    expect(elementType(chain[1]?.route.element)).toBe(ScoreboardLazy);
  });
});

describe("outlet context coupling", () => {
  // Room/Scoreboard explicitly destructure `playerId` from useOutletContext().
  // If they ever stop nesting under RoomLayout, runtime crashes — so we
  // hard-couple the structural test above to the actual context usage here.
  const sources: Array<readonly [string, string]> = [
    ["Room.tsx", join(here, "routes", "Room.tsx")],
    ["Scoreboard.tsx", join(here, "routes", "Scoreboard.tsx")],
  ];

  for (const [label, path] of sources) {
    it(`${label} uses useOutletContext<RoomOutletContext>`, () => {
      const src = readFileSync(path, "utf8");
      expect(src).toMatch(/useOutletContext<RoomOutletContext>/);
    });
  }
});
