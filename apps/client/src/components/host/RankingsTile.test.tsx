import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { RankingsTile } from "./RankingsTile.js";

describe("RankingsTile", () => {
  it("renders both columns with rank, name and count", () => {
    render(
      <RankingsTile
        rankings={{
          scanOut: [
            { id: "a", name: "Alice", count: 3 },
            { id: "b", name: "Bob", count: 1 },
          ],
          scanIn: [{ id: "b", name: "Bob", count: 2 }],
        }}
      />,
    );
    expect(screen.getByText("SCAN OUT")).toBeInTheDocument();
    expect(screen.getByText("SCAN IN")).toBeInTheDocument();
    expect(screen.getByText("Alice")).toBeInTheDocument();
    expect(screen.getAllByText("Bob").length).toBeGreaterThanOrEqual(2);
  });

  it("shows empty-state copy when no players", () => {
    render(<RankingsTile rankings={{ scanOut: [], scanIn: [] }} />);
    expect(screen.getAllByText("参加者なし").length).toBe(2);
  });

  it("preserves order from rankings input (sorted by caller)", () => {
    render(
      <RankingsTile
        rankings={{
          scanOut: [
            { id: "c", name: "Carol", count: 5 },
            { id: "a", name: "Alice", count: 5 },
            { id: "b", name: "Bob", count: 0 },
          ],
          scanIn: [],
        }}
      />,
    );
    const list = screen.getByLabelText("スキャンランキング").querySelectorAll("ol")[0];
    expect(list).toBeTruthy();
    const items = within(list as HTMLElement).getAllByRole("listitem");
    expect(items.map((li) => li.textContent)).toEqual([
      expect.stringContaining("Carol"),
      expect.stringContaining("Alice"),
      expect.stringContaining("Bob"),
    ]);
  });
});
