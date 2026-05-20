import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { TokenPathTile } from "./TokenPathTile.js";

describe("TokenPathTile", () => {
  it("renders empty state when chain has no steps", () => {
    render(<TokenPathTile chain={[]} />);
    expect(screen.getByText("まだスキャンはありません")).toBeInTheDocument();
  });

  it("renders each step with scanner and scanned names", () => {
    render(
      <TokenPathTile
        chain={[
          { scannerId: "a", scannerName: "Alice", scannedId: "b", scannedName: "Bob", ts: 1 },
          { scannerId: "b", scannerName: "Bob", scannedId: "c", scannedName: "Carol", ts: 2 },
        ]}
      />,
    );
    expect(screen.getByText("Alice")).toBeInTheDocument();
    expect(screen.getAllByText("Bob").length).toBe(2);
    expect(screen.getByText("Carol")).toBeInTheDocument();
    expect(screen.getByText("2 steps")).toBeInTheDocument();
  });

  it("truncates older steps when over visibleSteps", () => {
    const chain = Array.from({ length: 25 }, (_, i) => ({
      scannerId: `s${i}`,
      scannerName: `S${i}`,
      scannedId: `t${i}`,
      scannedName: `T${i}`,
      ts: i,
    }));
    render(<TokenPathTile chain={chain} visibleSteps={5} />);
    expect(screen.getByText(/過去 20 件は省略/)).toBeInTheDocument();
    expect(screen.queryByText("S0")).not.toBeInTheDocument();
    expect(screen.getByText("S24")).toBeInTheDocument();
  });
});
