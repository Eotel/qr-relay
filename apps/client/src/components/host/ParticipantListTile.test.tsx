import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ParticipantListTile } from "./ParticipantListTile.js";

describe("ParticipantListTile", () => {
  it("renders empty state when no players", () => {
    render(<ParticipantListTile players={[]} />);
    expect(screen.getByText("参加者を待機中")).toBeInTheDocument();
  });

  it("sorts players by joinedAt ascending and shows numbered rank", () => {
    render(
      <ParticipantListTile
        players={[
          { id: "c", name: "Carol", joinedAt: 30 },
          { id: "a", name: "Alice", joinedAt: 10 },
          { id: "b", name: "Bob", joinedAt: 20 },
        ]}
      />,
    );
    const list = screen.getByLabelText("参加者一覧").querySelector("ol");
    expect(list).toBeTruthy();
    const items = within(list as HTMLElement).getAllByRole("listitem");
    expect(items.map((li) => li.textContent)).toEqual([
      expect.stringContaining("Alice"),
      expect.stringContaining("Bob"),
      expect.stringContaining("Carol"),
    ]);
  });

  it("shows count chip", () => {
    render(
      <ParticipantListTile
        players={[
          { id: "a", name: "A", joinedAt: 0 },
          { id: "b", name: "B", joinedAt: 1 },
        ]}
      />,
    );
    expect(screen.getByText(/2 人/)).toBeInTheDocument();
  });

  it("shows join time relative to the first participant", () => {
    const base = 1_700_000_000_000;
    render(
      <ParticipantListTile
        players={[
          { id: "a", name: "Alice", joinedAt: base },
          { id: "b", name: "Bob", joinedAt: base + 12_000 },
          { id: "c", name: "Carol", joinedAt: base + 94_000 },
          { id: "d", name: "Dave", joinedAt: base + 3_725_000 },
        ]}
      />,
    );
    const list = screen.getByLabelText("参加者一覧").querySelector("ol");
    const items = within(list as HTMLElement).getAllByRole("listitem");
    expect(items[0]?.textContent).toContain("+00:00");
    expect(items[1]?.textContent).toContain("+00:12");
    expect(items[2]?.textContent).toContain("+01:34");
    expect(items[3]?.textContent).toContain("+01:02:05");
  });
});
