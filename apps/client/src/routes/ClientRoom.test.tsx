import type { Metric, Phase } from "@qr-relay/core";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Outlet, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PlayerLite } from "../lib/ws-store.js";

let mockPlayers: PlayerLite[] = [];
let mockMetrics: Metric[] = [];
let mockPhase: Phase = { kind: "running", startedAt: 1_000, accumulatedMs: 0 };

vi.mock("../lib/ws.js", () => ({
  useWs: <T,>(selector: (s: unknown) => T): T =>
    selector({
      players: mockPlayers,
      metrics: mockMetrics,
      phase: mockPhase,
      send: () => {},
    }),
}));

// QrDisplay and QrScannerView reach for DOM APIs not present in jsdom (canvas,
// getUserMedia). Stub them out — this test is about layout, not media.
vi.mock("../components/QrDisplay.js", () => ({
  QrDisplay: () => <div data-testid="qr-display" />,
}));
vi.mock("../components/QrScanner.js", () => ({
  QrScannerView: () => <div data-testid="qr-scanner" />,
}));
vi.mock("../components/JoinQrDisplay.js", () => ({
  JoinQrDisplay: ({ code }: { code: string }) => <div data-testid="join-qr">{code}</div>,
  joinUrlFor: (code: string) => `https://qr-relay.test/r/${code}`,
}));

function OutletWithContext() {
  return (
    <Outlet
      context={{
        playerId: "p1",
        code: "ABC123",
        role: "client" as const,
        playerName: "Me",
        onRename: () => {},
        clientView: "split" as const,
        setClientView: () => {},
      }}
    />
  );
}

async function renderClientRoom() {
  const { ClientRoom } = await import("./ClientRoom.js");
  return render(
    <MemoryRouter initialEntries={["/r/ABC123"]}>
      <Routes>
        <Route path="/r/:code" element={<OutletWithContext />}>
          <Route index element={<ClientRoom />} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

describe("ClientRoom viewport lock", () => {
  beforeEach(() => {
    mockPlayers = [{ id: "p1", name: "Me", joinedAt: 1 }];
    mockMetrics = [];
    mockPhase = { kind: "running", startedAt: 1_000, accumulatedMs: 0 };
  });

  afterEach(() => {
    vi.resetModules();
  });

  it("does not render an in-flow score disclosure — score lives on /scoreboard", async () => {
    // metrics present → in the old layout this would expand the <details>
    // and steal vertical space from the play area. The new contract: no
    // score panel here; players read score on the /scoreboard tab.
    mockMetrics = [
      { id: "score", label: "Score", kind: "leaderboard", values: { p1: 3 } },
    ] as unknown as Metric[];
    await renderClientRoom();
    // The old <summary> rendered the literal string "自分のスコア".
    expect(screen.queryByText("自分のスコア")).toBeNull();
  });

  it("renders the settings FAB with a gear-affordance aria-label", async () => {
    await renderClientRoom();
    // Honest affordance: gear icon + "ルーム設定" label, not a share glyph.
    // The button-name match guards against a regression where someone renames
    // it back to share-only semantics.
    expect(screen.getByRole("button", { name: "ルーム設定" })).toBeInTheDocument();
  });
});

describe("RoomSettingsOverlay information order", () => {
  beforeEach(() => {
    mockPlayers = [{ id: "p1", name: "Me", joinedAt: 1 }];
    mockMetrics = [];
    mockPhase = { kind: "running", startedAt: 1_000, accumulatedMs: 0 };
  });

  afterEach(() => {
    vi.resetModules();
  });

  it("opens the overlay with nickname input above the share QR", async () => {
    await renderClientRoom();
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "ルーム設定" }));

    // The dialog heading anchors the overlay; the test then walks the DOM to
    // confirm the order is: heading → nickname input → join QR. If a future
    // refactor flips them back to QR-on-top, this fails before review.
    const dialog = screen.getByRole("dialog", { name: "ルーム設定" });
    const nicknameInput = dialog.querySelector('input[placeholder="ニックネーム"]');
    const joinQr = dialog.querySelector('[data-testid="join-qr"]');
    expect(nicknameInput).not.toBeNull();
    expect(joinQr).not.toBeNull();
    // compareDocumentPosition returns DOCUMENT_POSITION_FOLLOWING (4) when
    // the argument node follows the receiver in document order.
    const FOLLOWING = Node.DOCUMENT_POSITION_FOLLOWING;
    // biome-ignore lint/style/noNonNullAssertion: we asserted both are non-null above
    expect(nicknameInput!.compareDocumentPosition(joinQr!) & FOLLOWING).toBe(FOLLOWING);
  });
});
