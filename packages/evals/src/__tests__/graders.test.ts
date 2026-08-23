import { describe, it, expect } from "vitest";
import { gradeComprehension, gradeFormatDiscovery, gradeShortLinkRead } from "../graders";

const PAYLOAD = "Rg6F2BqFlzmqMHKGhaZOSsmh0dHBzOi8vZ2l0aHViLmNvbaZHaXRIdWKSuWh0dHBzOi8vc3RhY2tvdmVyZmxvdy5jb22uU3RhY2sgT3ZlcmZsb3eSvWh0dHBzOi8vZGV2ZWxvcGVyLm1vemlsbGEub3JnrE1ETiBXZWIgRG9jcw";

describe("gradeComprehension", () => {
  const expected = {
    count: 3,
    domains: ["github.com", "stackoverflow.com", "developer.mozilla.org"],
  };

  it("passes a correct prose answer", () => {
    const res = gradeComprehension(
      "The stash contains 3 links. Domains: github.com, stackoverflow.com, developer.mozilla.org.",
      expected,
    );
    expect(res.pass).toBe(true);
  });

  it("tolerates www prefixes and different order", () => {
    const res = gradeComprehension(
      "There are 3 links: www.github.com, developer.mozilla.org and StackOverflow.com",
      expected,
    );
    expect(res.pass).toBe(true);
  });

  it("fails a wrong count", () => {
    const res = gradeComprehension(
      "4 links: github.com, stackoverflow.com, developer.mozilla.org, example.com",
      expected,
    );
    expect(res.pass).toBe(false);
    expect(res.reason).toMatch(/wrong counts/);
  });

  it("fails missing domains", () => {
    const res = gradeComprehension("3 links: github.com and stackoverflow.com", expected);
    expect(res.pass).toBe(false);
    expect(res.reason).toMatch(/developer\.mozilla\.org/);
  });

  it("fails when no count statement exists", () => {
    const res = gradeComprehension("github.com, stackoverflow.com, developer.mozilla.org", expected);
    expect(res.pass).toBe(false);
    expect(res.reason).toMatch(/no .*links.* statement/);
  });
});

describe("gradeFormatDiscovery", () => {
  const origin = "http://localhost:4321";

  it("accepts ?format=json URL", () => {
    const res = gradeFormatDiscovery(
      `http://localhost:4321/s?p=${PAYLOAD}&format=json`,
      PAYLOAD,
      origin,
    );
    expect(res.pass).toBe(true);
  });

  it("accepts bare /s?p= (Accept negotiation variant)", () => {
    const res = gradeFormatDiscovery(
      `Use ${origin}/s?p=${PAYLOAD} with Accept: application/json`,
      PAYLOAD,
      origin,
    );
    expect(res.pass).toBe(true);
  });

  it("rejects a URL without the payload", () => {
    const res = gradeFormatDiscovery("http://localhost:4321/s?p=WRONG&format=json", PAYLOAD, origin);
    expect(res.pass).toBe(false);
    expect(res.reason).toMatch(/does not contain the payload/);
  });

  it("rejects prose without any /s URL", () => {
    const res = gradeFormatDiscovery(`The payload ${PAYLOAD} goes to the /s endpoint`, PAYLOAD, origin);
    expect(res.pass).toBe(false);
    expect(res.reason).toMatch(/does not contain the payload/);
  });
});

describe("gradeShortLinkRead", () => {
  const urls = ["https://github.com", "https://stackoverflow.com", "https://developer.mozilla.org"];

  it("passes when all URLs appear", () => {
    const res = gradeShortLinkRead(
      "https://github.com\nhttps://stackoverflow.com\nhttps://developer.mozilla.org",
      urls,
    );
    expect(res.pass).toBe(true);
  });

  it("fails when a URL is missing", () => {
    const res = gradeShortLinkRead("https://github.com and https://stackoverflow.com", urls);
    expect(res.pass).toBe(false);
    expect(res.reason).toMatch(/developer\.mozilla\.org/);
  });
});
