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
});
