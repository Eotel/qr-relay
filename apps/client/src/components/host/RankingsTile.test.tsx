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

  it("default metric is 総数: shows count from rankings input", () => {
    render(
      <RankingsTile
        rankings={{
          scanOut: [
            { id: "a", name: "Alice", count: 50 },
            { id: "b", name: "Bob", count: 20 },
          ],
          scanIn: [],
        }}
        encountersOut={{ a: 30, b: 10 }}
      />,
    );
    const out = screen
      .getByLabelText("スキャンランキング")
      .querySelectorAll("ol")[0] as HTMLElement;
    expect(within(out).getByText("50")).toBeInTheDocument();
    expect(within(out).getByText("20")).toBeInTheDocument();
    // No subscript markup; the toggle is the only way to surface unique.
    expect(within(out).queryByText(/·\d+人/)).toBeNull();
    // Unique values (30 and 10) should not appear when default metric is 総数.
    expect(within(out).queryByText("30")).toBeNull();
    expect(within(out).queryByText("10")).toBeNull();
  });

  it("ユニーク toggle: SCAN OUT shows encountersOut and re-sorts by it", () => {
    render(
      <RankingsTile
        rankings={{
          // Bob has more total but Alice has more unique partners.
          scanOut: [
            { id: "b", name: "Bob", count: 10 },
            { id: "a", name: "Alice", count: 3 },
          ],
          scanIn: [],
        }}
        encountersOut={{ a: 3, b: 1 }}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "ユニーク" }));
    const out = screen
      .getByLabelText("スキャンランキング")
      .querySelectorAll("ol")[0] as HTMLElement;
    const items = within(out).getAllByRole("listitem");
    // Alice should now lead because her unique-partner count is higher.
    expect(items[0]?.textContent).toEqual(expect.stringContaining("Alice"));
    expect(items[1]?.textContent).toEqual(expect.stringContaining("Bob"));
    expect(within(out).getByText("3")).toBeInTheDocument();
    expect(within(out).queryByText("10")).toBeNull();
  });

  it("ユニーク toggle: SCAN IN uses encountersIn (independent from scanOut)", () => {
    render(
      <RankingsTile
        rankings={{
          scanOut: [],
          scanIn: [
            { id: "b", name: "Bob", count: 8 },
            { id: "a", name: "Alice", count: 2 },
          ],
        }}
        encountersIn={{ a: 2, b: 1 }}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "ユニーク" }));
    const inList = screen
      .getByLabelText("スキャンランキング")
      .querySelectorAll("ol")[1] as HTMLElement;
    const items = within(inList).getAllByRole("listitem");
    expect(items[0]?.textContent).toEqual(expect.stringContaining("Alice"));
    expect(items[1]?.textContent).toEqual(expect.stringContaining("Bob"));
  });

  it("toggle back to 総数 restores the original counts and order", () => {
    render(
      <RankingsTile
        rankings={{
          scanOut: [
            { id: "b", name: "Bob", count: 10 },
            { id: "a", name: "Alice", count: 3 },
          ],
          scanIn: [],
        }}
        encountersOut={{ a: 3, b: 1 }}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "ユニーク" }));
    fireEvent.click(screen.getByRole("button", { name: "総数" }));
    const out = screen
      .getByLabelText("スキャンランキング")
      .querySelectorAll("ol")[0] as HTMLElement;
    const items = within(out).getAllByRole("listitem");
    expect(items[0]?.textContent).toEqual(expect.stringContaining("Bob"));
    expect(within(out).getByText("10")).toBeInTheDocument();
  });
});
