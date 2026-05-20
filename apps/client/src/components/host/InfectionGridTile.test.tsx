import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { InfectionGridTile } from "./InfectionGridTile.js";

const players = [
  { id: "a", name: "Alice", joinedAt: 0 },
  { id: "b", name: "Bob", joinedAt: 1 },
  { id: "c", name: "Carol", joinedAt: 2 },
];

describe("InfectionGridTile", () => {
  it("renders empty state when no players", () => {
    render(<InfectionGridTile players={[]} state={null} />);
    expect(screen.getByText("参加者を待機中")).toBeInTheDocument();
  });

  it("lights up token holders and dims non-holders", () => {
    render(
      <InfectionGridTile
        players={players}
        state={{
          values: {
            a: { kind: "token", has: true },
            b: { kind: "token", has: false },
            c: { kind: "token", has: true },
          },
        }}
      />,
    );
    const alice = screen.getByText("Alice").closest("li");
    const bob = screen.getByText("Bob").closest("li");
    const carol = screen.getByText("Carol").closest("li");
    expect(alice?.dataset.lit).toBe("true");
    expect(bob?.dataset.lit).toBe("false");
    expect(carol?.dataset.lit).toBe("true");
    expect(screen.getByText("2 / 3")).toBeInTheDocument();
  });

  it("score preset lights cells where amount > 0 and shows amount", () => {
    render(
      <InfectionGridTile
        players={players}
        state={{
          values: {
            a: { kind: "score", amount: 5 },
            b: { kind: "score", amount: 0 },
            c: { kind: "score", amount: 12 },
          },
        }}
      />,
    );
    expect(screen.getByText("5")).toBeInTheDocument();
    expect(screen.getByText("12")).toBeInTheDocument();
    expect(screen.getByText("Alice").closest("li")?.dataset.lit).toBe("true");
    expect(screen.getByText("Bob").closest("li")?.dataset.lit).toBe("false");
  });

  it("sorts players by joinedAt ascending regardless of input order", () => {
    const { container } = render(
      <InfectionGridTile
        players={[
          { id: "c", name: "Carol", joinedAt: 30 },
          { id: "a", name: "Alice", joinedAt: 10 },
          { id: "b", name: "Bob", joinedAt: 20 },
        ]}
        state={null}
      />,
    );
    const items = container.querySelectorAll("ul li");
    expect(items.length).toBe(3);
    expect(items[0]?.textContent).toContain("Alice");
    expect(items[1]?.textContent).toContain("Bob");
    expect(items[2]?.textContent).toContain("Carol");
  });
});
