import { describe, expect, it } from "vitest";
import { presetById, presets } from "./presets.js";
import { ScanRule } from "./relay-rule.js";

describe("presets", () => {
  it("each preset has unique id", () => {
    const ids = presets.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("each preset has non-empty name and description", () => {
    for (const p of presets) {
      expect(p.name).not.toBe("");
      expect(p.description).not.toBe("");
    }
  });

  it("each preset rule conforms to ScanRule schema", () => {
    for (const p of presets) {
      const parsed = ScanRule.safeParse(p.rule);
      expect(parsed.success, `${p.id} rule should parse: ${JSON.stringify(parsed)}`).toBe(true);
    }
  });

  it("presetById indexes every preset by id", () => {
    expect(Object.keys(presetById).sort()).toEqual([...presets].map((p) => p.id).sort());
    for (const p of presets) {
      expect(presetById[p.id]).toBe(p);
    }
  });

  it("ships the canonical 5 presets", () => {
    expect(presets.map((p) => p.id).sort()).toEqual(
      ["baton", "collection", "greeting", "infection", "steal"].sort(),
    );
  });
});
