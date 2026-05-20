import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const getRoomMock = vi.fn<(code: string) => Promise<unknown>>();

vi.mock("../lib/api.js", () => ({
  getRoom: (code: string) => getRoomMock(code),
}));

// Camera permission probe inside JoinScannerOverlay reaches into navigator.mediaDevices.
// Stub the scanner — these tests are about routing/mount behavior, not QR decoding.
// Render a marker div so tests can assert the overlay is (or isn't) in the DOM.
vi.mock("../components/JoinScannerOverlay.js", () => ({
  JoinScannerOverlay: () => <div data-testid="scan-overlay-mounted" />,
}));

function LocationProbe() {
  const loc = useLocation();
  return <div data-testid="loc">{loc.pathname}</div>;
}

async function renderHome() {
  const { Home } = await import("./Home.js");
  return render(
    <MemoryRouter initialEntries={["/"]}>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="*" element={<LocationProbe />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  getRoomMock.mockReset();
  getRoomMock.mockResolvedValue({ room: {}, players: [], state: {}, metrics: [] });
  localStorage.clear();
  // Pre-seed: this device was previously a host of ABC123. Home reads
  // localStorage at mount, so the seed must land before render.
  localStorage.setItem("qr-relay:last-host-code", "ABC123");
  localStorage.setItem("qr-relay:role:ABC123", "host");
});

afterEach(() => {
  vi.resetModules();
  localStorage.clear();
});

describe("Home rejoin-host navigate target", () => {
  it("rejoin CTA navigates to /r/CODE/host so the URL announces the host context", async () => {
    await renderHome();
    const user = userEvent.setup();

    // The recent-host card surfaces a "戻る" button on mount.
    await user.click(screen.getByRole("button", { name: /戻る/ }));

    await waitFor(() => {
      expect(screen.getByTestId("loc")).toHaveTextContent("/r/ABC123/host");
    });
  });

  // Regression: JoinScannerOverlay used to be mounted unconditionally with an
  // `open` prop. Its inner useQrScanner effect ran on first mount when the
  // overlay returned null (no <video>), so videoRef.current was null and the
  // effect bailed early. When the user later flipped `open` to true the
  // <video> element appeared but the effect did NOT re-run (stable deps), so
  // the camera never started — visible symptom was a dark scanner with no
  // error message. Fix: gate the mount on scannerOpen so the <video> exists
  // from the first render.
  it("scan overlay is absent on landing and only mounts after the user opens it", async () => {
    await renderHome();
    expect(screen.queryByTestId("scan-overlay-mounted")).toBeNull();

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /QR コードをスキャン/ }));

    expect(screen.getByTestId("scan-overlay-mounted")).toBeInTheDocument();
  });

  it("join-by-code (client path) stays on /r/CODE without /host (URL = client intent)", async () => {
    await renderHome();
    const user = userEvent.setup();

    await user.type(screen.getByPlaceholderText("ルームコード"), "XYZ789");
    await user.click(screen.getByRole("button", { name: /^参加$/ }));

    await waitFor(() => {
      expect(screen.getByTestId("loc")).toHaveTextContent("/r/XYZ789");
    });
    expect(screen.getByTestId("loc").textContent).not.toMatch(/\/host$/);
  });
});
