import { describe, expect, it } from "vitest";
import { negotiateFormat, isValidFormatParam, FORMAT_ALIASES, NEGOTIATION_CASES } from "../negotiation";

describe("negotiateFormat (NEGOTIATION_CASES)", () => {
  it("table is non-trivial", () => {
    expect(NEGOTIATION_CASES.length).toBeGreaterThan(10);
  });

  for (const { accept, format, expected } of NEGOTIATION_CASES) {
    it(`accept=${JSON.stringify(accept)} format=${JSON.stringify(format)} -> ${expected}`, () => {
      expect(negotiateFormat(accept, format)).toBe(expected);
    });
  }
});

describe("isValidFormatParam", () => {
  it("accepts canonical values and aliases", () => {
    for (const key of Object.keys(FORMAT_ALIASES)) {
      expect(isValidFormatParam(key)).toBe(true);
    }
  });

  it("rejects unknown values", () => {
    expect(isValidFormatParam("yaml")).toBe(false);
    expect(isValidFormatParam("")).toBe(false);
  });
});

describe("negotiateFormat edge inputs", () => {
  it("handles null/undefined/empty params", () => {
    expect(negotiateFormat(null, null)).toBeNull();
    expect(negotiateFormat(undefined, undefined)).toBeNull();
    expect(negotiateFormat("application/json", "")).toBe("json");
    expect(negotiateFormat(null, "")).toBeNull();
  });

  it("is case-insensitive on Accept", () => {
    expect(negotiateFormat("APPLICATION/JSON", null)).toBe("json");
    expect(negotiateFormat("Text/Markdown", null)).toBe("md");
  });
});
