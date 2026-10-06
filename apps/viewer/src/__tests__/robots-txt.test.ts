import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * robots.txt must allow fetch-only agents (Claude Code, ChatGPT browsing,
 * curl) to read /s pages. Indexing intent is carried separately via the
 * X-Robots-Tag: noindex response header on the /s Pages Function.
 */
const robotsPath = path.resolve(__dirname, "../../public/robots.txt");
const robots = readFileSync(robotsPath, "utf8");

describe("public/robots.txt", () => {
  it("does not disallow /s", () => {
    expect(robots).not.toMatch(/^Disallow:\s*\/s\s*$/m);
  });

  it("still disallows /api/", () => {
    expect(robots).toMatch(/^Disallow:\s*\/api\/\s*$/m);
  });
});
