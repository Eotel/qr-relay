import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Button } from "./button.js";

describe("Button", () => {
  it("デフォルトは variant=primary, size=cta のクラスを含む", () => {
    render(<Button>OK</Button>);
    const btn = screen.getByRole("button", { name: "OK" });
    expect(btn.className).toMatch(/bg-primary/);
    expect(btn.className).toMatch(/w-full/);
  });

  it("variant=outline でアウトラインスタイルが当たる", () => {
    render(<Button variant="outline">x</Button>);
    expect(screen.getByRole("button").className).toMatch(/border-2/);
  });

  it("onClick ハンドラが発火する", async () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>click</Button>);
    screen.getByRole("button").click();
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("disabled で disabled 属性がつく", () => {
    render(<Button disabled>x</Button>);
    expect(screen.getByRole("button")).toBeDisabled();
  });

  it("asChild で子要素のタグを使う (button にラップしない)", () => {
    render(
      <Button asChild>
        <a href="/x">link</a>
      </Button>,
    );
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.getByRole("link", { name: "link" })).toBeInTheDocument();
  });
});
