import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const listHandlersAndPresetsMock = vi.fn();
const createRoomMock = vi.fn<(handlerId: string, rule: unknown) => Promise<string>>();
const joinRoomMock =
  vi.fn<(code: string, id: string, name: string, role: string) => Promise<unknown>>();

vi.mock("../lib/api.js", () => ({
  listHandlersAndPresets: () => listHandlersAndPresetsMock(),
  createRoom: (handlerId: string, rule: unknown) => createRoomMock(handlerId, rule),
  joinRoom: (code: string, id: string, name: string, role: string) =>
    joinRoomMock(code, id, name, role),
}));

function LocationProbe() {
  const loc = useLocation();
  return <div data-testid="loc">{loc.pathname}</div>;
}

async function renderNewRoom() {
  const { NewRoom } = await import("./NewRoom.js");
  return render(
    <MemoryRouter initialEntries={["/new"]}>
      <Routes>
        <Route path="/new" element={<NewRoom />} />
        <Route path="*" element={<LocationProbe />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  listHandlersAndPresetsMock.mockReset();
  createRoomMock.mockReset();
  joinRoomMock.mockReset();
  listHandlersAndPresetsMock.mockResolvedValue({
    handlers: [],
    presets: [{ id: "preset-a", name: "プリセットA", description: "desc", rule: { kind: "test" } }],
  });
  createRoomMock.mockResolvedValue("ABC123");
  joinRoomMock.mockResolvedValue({});
  localStorage.clear();
});

afterEach(() => {
  vi.resetModules();
  localStorage.clear();
});

describe("NewRoom onCreate navigate target", () => {
  it("navigates to /r/CODE/host so the host's URL bar visibly differs from a client's", async () => {
    await renderNewRoom();
    const user = userEvent.setup();

    // wait for preset list to settle before clicking the CTA
    await screen.findByRole("button", { name: /プリセットA/ });
    await user.click(screen.getByRole("button", { name: /このプリセットで作成|作成中/ }));

    await waitFor(() => {
      expect(screen.getByTestId("loc")).toHaveTextContent("/r/ABC123/host");
    });
  });

  it("persists the host role for the new room before navigating (host-claim race guard)", async () => {
    await renderNewRoom();
    const user = userEvent.setup();

    await screen.findByRole("button", { name: /プリセットA/ });
    await user.click(screen.getByRole("button", { name: /このプリセットで作成|作成中/ }));

    await waitFor(() => {
      expect(localStorage.getItem("qr-relay:role:ABC123")).toBe("host");
    });
  });
});
