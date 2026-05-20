import { fireEvent, render, screen, within } from "@testing-library/react";
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

  it("preserves order from rankings input (desc default)", () => {
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

  it("sort toggle on SCAN OUT swaps first/last while keeping joinedAt tiebreak stable", () => {
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
    const toggle = screen.getByRole("button", { name: /SCAN OUT.*並び順/ });
    fireEvent.click(toggle);
    const list = screen.getByLabelText("スキャンランキング").querySelectorAll("ol")[0];
    const items = within(list as HTMLElement).getAllByRole("listitem");
    // asc: Bob (0) first, then ties Carol/Alice in joinedAt-asc order (input order).
    expect(items.map((li) => li.textContent)).toEqual([
      expect.stringContaining("Bob"),
      expect.stringContaining("Carol"),
      expect.stringContaining("Alice"),
    ]);
    // toggling back returns to desc
    fireEvent.click(toggle);
    const itemsAfter = within(
      screen.getByLabelText("スキャンランキング").querySelectorAll("ol")[0] as HTMLElement,
    ).getAllByRole("listitem");
    expect(itemsAfter.map((li) => li.textContent)).toEqual([
      expect.stringContaining("Carol"),
      expect.stringContaining("Alice"),
      expect.stringContaining("Bob"),
    ]);
  });

  it("only count=0 rows render the 未参加 badge", () => {
    render(
      <RankingsTile
        rankings={{
          scanOut: [
            { id: "a", name: "Alice", count: 2 },
            { id: "b", name: "Bob", count: 0 },
            { id: "c", name: "Carol", count: 0 },
          ],
          scanIn: [],
        }}
      />,
    );
    const list = screen.getByLabelText("スキャンランキング").querySelectorAll("ol")[0];
    const items = within(list as HTMLElement).getAllByRole("listitem");
    const badged = items.filter((li) => within(li).queryByText("未参加"));
    expect(badged.map((li) => li.textContent)).toEqual([
      expect.stringContaining("Bob"),
      expect.stringContaining("Carol"),
    ]);
  });

  it("renders an encounters subscript on SCAN OUT rows when provided", () => {
    render(
      <RankingsTile
        rankings={{
          scanOut: [
            { id: "a", name: "Alice", count: 5 },
            { id: "b", name: "Bob", count: 1 },
            { id: "c", name: "Carol", count: 0 },
          ],
          scanIn: [{ id: "a", name: "Alice", count: 4 }],
        }}
        encounters={{ a: 3, b: 1, c: 0 }}
      />,
    );
    const out = screen
      .getByLabelText("スキャンランキング")
      .querySelectorAll("ol")[0] as HTMLElement;
    expect(within(out).getByText(/3人/)).toBeInTheDocument();
    expect(within(out).getByText(/1人/)).toBeInTheDocument();
    // zero-encounter rows do NOT render the subscript (avoids noise).
    expect(within(out).queryByText("·0人")).toBeNull();
  });
});
