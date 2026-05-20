import type { Metric, Phase } from "@qr-relay/core";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Outlet, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const startRoomMock = vi.fn<(code: string) => Promise<void>>();
const pauseRoomMock = vi.fn<(code: string) => Promise<void>>();
const resumeRoomMock = vi.fn<(code: string) => Promise<void>>();
const resetRoomMock = vi.fn<(code: string) => Promise<void>>();
let mockMetrics: Metric[] = [];
let mockPhase: Phase = { kind: "ready" };

vi.mock("../lib/api.js", () => ({
  startRoom: (code: string) => startRoomMock(code),
  pauseRoom: (code: string) => pauseRoomMock(code),
  resumeRoom: (code: string) => resumeRoomMock(code),
  resetRoom: (code: string) => resetRoomMock(code),
}));

vi.mock("../lib/ws.js", () => ({
  useWs: <T,>(selector: (s: unknown) => T): T =>
    selector({
      players: [],
      metrics: mockMetrics,
      phase: mockPhase,
    }),
}));

vi.mock("../components/JoinQrDisplay.js", () => ({
  JoinQrDisplay: ({ code }: { code: string }) => <div data-testid="join-qr">{code}</div>,
  joinUrlFor: (code: string) => `https://qr-relay.test/r/${code}`,
}));

function OutletWithContext() {
  return <Outlet context={{ playerId: "p1", code: "ABC123", role: "host" as const }} />;
}

async function renderHostRoom() {
  const { HostRoom } = await import("./HostRoom.js");
  return render(
    <MemoryRouter initialEntries={["/r/ABC123"]}>
      <Routes>
        <Route path="/r/:code" element={<OutletWithContext />}>
          <Route index element={<HostRoom />} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

describe("HostRoom button wiring", () => {
  beforeEach(() => {
    startRoomMock.mockReset();
    pauseRoomMock.mockReset();
    resumeRoomMock.mockReset();
    resetRoomMock.mockReset();
    startRoomMock.mockResolvedValue(undefined);
    pauseRoomMock.mockResolvedValue(undefined);
    resumeRoomMock.mockResolvedValue(undefined);
    resetRoomMock.mockResolvedValue(undefined);
    mockMetrics = [];
    mockPhase = { kind: "ready" };
  });

  afterEach(() => {
    vi.resetModules();
  });

  it("ready: スタートボタンは startRoom() を呼ぶ", async () => {
    await renderHostRoom();
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: /スタート/ }));

    await waitFor(() => expect(startRoomMock).toHaveBeenCalledWith("ABC123"));
    expect(pauseRoomMock).not.toHaveBeenCalled();
    expect(resetRoomMock).not.toHaveBeenCalled();
  });

  it("ready: リセットは確認なしで即時 resetRoom() を呼ぶ", async () => {
    await renderHostRoom();
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: /リセット/ }));

    await waitFor(() => expect(resetRoomMock).toHaveBeenCalledWith("ABC123"));
  });

  it("running: 主ボタンは pauseRoom() を呼ぶ", async () => {
    mockPhase = { kind: "running", startedAt: 1_000, accumulatedMs: 0 };
    await renderHostRoom();
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: /一時停止/ }));

    await waitFor(() => expect(pauseRoomMock).toHaveBeenCalledWith("ABC123"));
    expect(startRoomMock).not.toHaveBeenCalled();
    expect(resumeRoomMock).not.toHaveBeenCalled();
  });

  it("paused: 主ボタンは resumeRoom() を呼ぶ", async () => {
    mockPhase = { kind: "paused", pausedAt: 2_000, accumulatedMs: 1_000 };
    await renderHostRoom();
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: /再開/ }));

    await waitFor(() => expect(resumeRoomMock).toHaveBeenCalledWith("ABC123"));
  });

  it("running 中のリセットは 2 段階確認", async () => {
    mockPhase = { kind: "running", startedAt: 1_000, accumulatedMs: 0 };
    await renderHostRoom();
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: /^リセット$/ }));

    expect(resetRoomMock).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: /もう一度押して初期化/ })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /もう一度押して初期化/ }));

    await waitFor(() => expect(resetRoomMock).toHaveBeenCalledWith("ABC123"));
  });

  it("startRoom 失敗時はエラーが画面に表示される", async () => {
    startRoomMock.mockRejectedValueOnce(new Error("network down"));
    await renderHostRoom();
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: /スタート/ }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/network down/);
  });

  it("スタート押下中は両ボタンが disabled (double-submit ガード)", async () => {
    const deferred: { resolve: () => void } = { resolve: () => {} };
    startRoomMock.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          deferred.resolve = resolve;
        }),
    );

    await renderHostRoom();
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: /スタート/ }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /起動中/ })).toBeDisabled();
      expect(screen.getByRole("button", { name: /リセット/ })).toBeDisabled();
    });

    deferred.resolve();
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /スタート/ })).not.toBeDisabled(),
    );
  });
});
