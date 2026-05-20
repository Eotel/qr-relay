import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ScanCountTile } from "./ScanCountTile.js";

describe("ScanCountTile", () => {
  it("renders the label and total count", () => {
    render(<ScanCountTile totalScans={42} />);
    expect(screen.getByText("総スキャン数")).toBeInTheDocument();
    expect(screen.getByText("42")).toBeInTheDocument();
  });

  it("renders 0 explicitly (dormant rooms read as '0', not absent)", () => {
    render(<ScanCountTile totalScans={0} />);
    expect(screen.getByText("0")).toBeInTheDocument();
  });
});
