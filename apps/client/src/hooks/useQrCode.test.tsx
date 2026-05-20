import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useQrCode } from "./useQrCode.js";

describe("useQrCode", () => {
  it("成功時に src を data URI に組み立てる", async () => {
    const generator = vi.fn().mockResolvedValue("<svg>ok</svg>");
    const { result } = renderHook(() => useQrCode({ a: 1 }, generator));

    await waitFor(() => {
      expect(result.current.src).not.toBe("");
    });
    expect(result.current.src).toMatch(/^data:image\/svg\+xml;utf8,/);
    expect(result.current.src).toContain(encodeURIComponent("<svg>ok</svg>"));
    expect(result.current.error).toBeNull();
    expect(generator).toHaveBeenCalledWith(JSON.stringify({ a: 1 }));
  });

  it("失敗時に error を set", async () => {
    const generator = vi.fn().mockRejectedValue(new Error("nope"));
    const { result } = renderHook(() => useQrCode("x", generator));
    await waitFor(() => {
      expect(result.current.error).toBe("nope");
    });
    expect(result.current.src).toBe("");
  });

  it("string payload はそのまま渡す", async () => {
    const generator = vi.fn().mockResolvedValue("<svg/>");
    renderHook(() => useQrCode("hello", generator));
    await waitFor(() => expect(generator).toHaveBeenCalled());
    expect(generator).toHaveBeenCalledWith("hello");
  });

  it("payload 変更時にキャンセル済みの結果を無視 (state を上書きしない)", async () => {
    let resolveFirst: ((v: string) => void) | undefined;
    const firstPromise = new Promise<string>((r) => {
      resolveFirst = r;
    });
    const generator = vi
      .fn()
      .mockImplementationOnce(() => firstPromise)
      .mockResolvedValueOnce("<svg>second</svg>");

    const { result, rerender } = renderHook(({ p }: { p: string }) => useQrCode(p, generator), {
      initialProps: { p: "first" },
    });
    rerender({ p: "second" });

    // 後勝ち。最初の resolve は捨てられる
    await act(async () => {
      resolveFirst?.("<svg>first</svg>");
    });
    await waitFor(() => {
      expect(result.current.src).toContain(encodeURIComponent("<svg>second</svg>"));
    });
    expect(result.current.src).not.toContain(encodeURIComponent("<svg>first</svg>"));
  });
});
