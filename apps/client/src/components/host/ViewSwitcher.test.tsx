import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { type HostViewMode, ViewSwitcher } from "./ViewSwitcher.js";

describe("ViewSwitcher", () => {
  it("renders all five modes as tabs", () => {
    render(<ViewSwitcher mode="overview" onChange={() => undefined} />);
    expect(screen.getAllByRole("tab")).toHaveLength(5);
  });

  it("marks the active mode with aria-selected", () => {
    render(<ViewSwitcher mode="rankings" onChange={() => undefined} />);
    const tabs = screen.getAllByRole("tab");
    const selected = tabs.filter((t) => t.getAttribute("aria-selected") === "true");
    expect(selected).toHaveLength(1);
    expect(selected[0]).toHaveTextContent("ランキング");
  });

  it("calls onChange when a different tab is clicked", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<ViewSwitcher mode="overview" onChange={onChange} />);
    await user.click(screen.getByRole("tab", { name: /経路/ }));
    expect(onChange).toHaveBeenCalledWith<[HostViewMode]>("token-path");
  });
});
