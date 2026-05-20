import type { Phase } from "@qr-relay/core";
import { presetById } from "@qr-relay/handlers";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RoomInfo } from "../../lib/api-client.js";

const updateRoomConfigMock =
  vi.fn<(code: string, playerId: string, patch: unknown) => Promise<void>>();

let mockPhase: Phase = { kind: "ready" };
let mockRoom: RoomInfo | null = null;
let mockPlayers: { id: string; name: string; joinedAt: number }[] = [];

vi.mock("../../lib/api.js", () => ({
  updateRoomConfig: (code: string, playerId: string, patch: unknown) =>
    updateRoomConfigMock(code, playerId, patch),
}));

vi.mock("../../lib/ws.js", () => ({
  useWs: <T,>(selector: (s: unknown) => T): T =>
    selector({
      phase: mockPhase,
      room: mockRoom,
      players: mockPlayers,
    }),
}));

async function renderEditor(playerId: string | null = "h1") {
  const { ReadyConfigEditor } = await import("./ReadyConfigEditor.js");
  return render(<ReadyConfigEditor code="ABC123" playerId={playerId} />);
}

function makeRoom(presetId: string): RoomInfo {
  const rule = presetById[presetId]?.rule;
  if (!rule) throw new Error(`unknown preset ${presetId}`);
  return {
    code: "ABC123",
    handlerId: "relay",
    handlerConfig: rule,
    createdAt: 0,
    hostId: "h1",
    phase: { kind: "ready" },
  };
}

describe("ReadyConfigEditor", () => {
  beforeEach(() => {
    updateRoomConfigMock.mockReset();
    updateRoomConfigMock.mockResolvedValue(undefined);
    mockPhase = { kind: "ready" };
    mockRoom = null;
    mockPlayers = [];
  });

  afterEach(() => {
    vi.resetModules();
  });

  it("ready 以外では何もレンダリングしない", async () => {
    mockPhase = { kind: "running", startedAt: 0, accumulatedMs: 0 };
    mockRoom = makeRoom("baton");
    mockPlayers = [{ id: "p1", name: "P1", joinedAt: 0 }];
    const { container } = await renderEditor();
    expect(container.firstChild).toBeNull();
  });

  it("room が未取得なら何もレンダリングしない", async () => {
    mockRoom = null;
    const { container } = await renderEditor();
    expect(container.firstChild).toBeNull();
  });

  it("baton (initial.holders='one'): holder select を出し選択で updateRoomConfig({initial:{holders:[id]}})", async () => {
    mockRoom = makeRoom("baton");
    mockPlayers = [
      { id: "p1", name: "P1", joinedAt: 0 },
      { id: "p2", name: "P2", joinedAt: 0 },
      { id: "p3", name: "P3", joinedAt: 0 },
    ];
    await renderEditor();
    const select = screen.getByLabelText(/最初の保持者/) as HTMLSelectElement;
    expect(select).toBeInTheDocument();
    // 4 options: (auto) + 3 players
    expect(select.querySelectorAll("option")).toHaveLength(4);

    const user = userEvent.setup();
    await user.selectOptions(select, "p2");

    await waitFor(() =>
      expect(updateRoomConfigMock).toHaveBeenCalledWith("ABC123", "h1", {
        initial: { holders: ["p2"] },
      }),
    );
  });

  it("(自動) を選ぶと holders: 'one' に戻す", async () => {
    const base = makeRoom("baton");
    mockRoom = {
      ...base,
      handlerConfig: {
        ...(base.handlerConfig as Record<string, unknown>),
        initial: { holders: ["p2"] },
      },
    };
    mockPlayers = [
      { id: "p1", name: "P1", joinedAt: 0 },
      { id: "p2", name: "P2", joinedAt: 0 },
    ];
    await renderEditor();
    const select = screen.getByLabelText(/最初の保持者/) as HTMLSelectElement;
    expect(select.value).toBe("p2");

    const user = userEvent.setup();
    await user.selectOptions(select, "__auto__");

    await waitFor(() =>
      expect(updateRoomConfigMock).toHaveBeenCalledWith("ABC123", "h1", {
        initial: { holders: "one" },
      }),
    );
  });

  it("steal (score + holders='all'): 初期点数 input を出し blur で updateRoomConfig", async () => {
    mockRoom = makeRoom("steal");
    mockPlayers = [{ id: "p1", name: "P1", joinedAt: 0 }];
    await renderEditor();

    const input = screen.getByLabelText(/初期点数/) as HTMLInputElement;
    expect(input).toBeInTheDocument();
    expect(input.value).toBe("10");

    const user = userEvent.setup();
    await user.clear(input);
    await user.type(input, "5");
    input.blur();

    await waitFor(() =>
      expect(updateRoomConfigMock).toHaveBeenCalledWith("ABC123", "h1", {
        initial: { amount: 5 },
      }),
    );
  });

  it("collection (holders='none'): 何もレンダリングしない (編集対象なし)", async () => {
    mockRoom = makeRoom("collection");
    mockPlayers = [{ id: "p1", name: "P1", joinedAt: 0 }];
    const { container } = await renderEditor();
    expect(container.firstChild).toBeNull();
  });

  it("relay 以外の handler では何もレンダリングしない", async () => {
    mockRoom = {
      code: "ABC123",
      handlerId: "other",
      handlerConfig: {},
      createdAt: 0,
      hostId: null,
      phase: { kind: "ready" },
    };
    const { container } = await renderEditor();
    expect(container.firstChild).toBeNull();
  });

  it("playerId が null なら何もレンダリングしない", async () => {
    mockRoom = makeRoom("baton");
    mockPlayers = [{ id: "p1", name: "P1", joinedAt: 0 }];
    const { container } = await renderEditor(null);
    expect(container.firstChild).toBeNull();
  });

  it("amount input は controlled で broadcast 後に同期される (defaultValue ではなく value)", async () => {
    mockRoom = makeRoom("steal");
    mockPlayers = [{ id: "p1", name: "P1", joinedAt: 0 }];
    const { rerender } = await renderEditor("h1");
    let input = screen.getByLabelText(/初期点数/) as HTMLInputElement;
    expect(input.value).toBe("10");

    // Simulate a `{ t: "room" }` broadcast: store update arrives, parent
    // re-renders with the new rule.
    const baseRule = makeRoom("steal").handlerConfig as { initial: { amount?: number } };
    mockRoom = {
      ...makeRoom("steal"),
      handlerConfig: { ...baseRule, initial: { ...baseRule.initial, amount: 3 } },
    };
    const { ReadyConfigEditor } = await import("./ReadyConfigEditor.js");
    rerender(<ReadyConfigEditor code="ABC123" playerId="h1" />);

    input = screen.getByLabelText(/初期点数/) as HTMLInputElement;
    expect(input.value).toBe("3");
  });

  it("blur 時の値が現在値と同じなら無駄な updateRoomConfig を打たない", async () => {
    mockRoom = makeRoom("steal");
    mockPlayers = [{ id: "p1", name: "P1", joinedAt: 0 }];
    await renderEditor("h1");
    const input = screen.getByLabelText(/初期点数/) as HTMLInputElement;
    input.focus();
    input.blur();
    expect(updateRoomConfigMock).not.toHaveBeenCalled();
  });

  it("API エラーで alert を表示する", async () => {
    updateRoomConfigMock.mockRejectedValueOnce(new Error("boom"));
    mockRoom = makeRoom("steal");
    mockPlayers = [{ id: "p1", name: "P1", joinedAt: 0 }];
    await renderEditor();
    const input = screen.getByLabelText(/初期点数/) as HTMLInputElement;
    const user = userEvent.setup();
    await user.clear(input);
    await user.type(input, "7");
    input.blur();
    expect(await screen.findByRole("alert")).toHaveTextContent(/boom/);
  });
});
