import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { onRequest as sHandler } from "../../functions/s";
import { buildOpenApiSpec } from "../lib/openapi-spec";
import { loadPayloadFixtures } from "@stash/shared/fixtures";
import payloadsJson from "@stash/shared/fixtures/payloads.json";

/**
 * W3 contract test: everything llms.txt and the OpenAPI spec promise
 * must actually resolve against the real handlers. Server-core handlers
 * (@stash/server-core) are not importable from the viewer package, so
 * this suite restricts itself to the viewer surface: the /s decode
 * handler plus structural assertions that the spec does not advertise
 * routes the viewer dropped (stale suffix stubs).
 */

const llmsTxt = readFileSync(path.resolve(__dirname, "../../public/llms.txt"), "utf8");
const fixtures = loadPayloadFixtures(payloadsJson);
const sample = fixtures.find((f) => f.name === "three-tabs")!;
const payloadP = sample.fragment.slice(3);

function makeContext(pathAndQuery: string, headers: Record<string, string> = {}) {
  const url = new URL("https://stash.illo.fyi" + pathAndQuery);
  const request = new Request(url, { headers });
  return {
    request,
    next: async () => new Response("<html>SPA shell</html>", { status: 200 }),
  };
}

const CONTENT_TYPES: Record<string, RegExp> = {
  json: /application\/json/,
  md: /text\/markdown/,
  txt: /text\/plain/,
};

/** Combinations llms.txt documents for the viewer /s surface. */
const documentedCombos: Array<{
  format: "json" | "md" | "txt";
  via: "accept" | "param";
}> = [
  { format: "json", via: "accept" },
  { format: "md", via: "accept" },
  { format: "txt", via: "accept" },
  { format: "json", via: "param" },
  { format: "md", via: "param" },
  { format: "txt", via: "param" },
];

function acceptFor(format: "json" | "md" | "txt"): string {
  return { json: "application/json", md: "text/markdown", txt: "text/plain" }[format];
}

describe("llms.txt documented endpoints resolve against real handlers", () => {
  it("documents the /s?p= decode endpoint with ?format= and Accept for all three formats", () => {
    expect(llmsTxt).toMatch(/GET \/s\?p=<payload>/);
    for (const alias of ["json", "md", "txt"]) {
      expect(llmsTxt).toContain(`format=json|md|txt`);
      expect(llmsTxt).toContain(acceptFor(alias as "json" | "md" | "txt"));
    }
  });

  it("no longer advertises the legacy .json/.md suffix shortener routes as canonical", () => {
    // The suffix routes are only mentioned as 301-redirecting legacy forms.
    const suffixMentions = llmsTxt.match(/\/s\/<id>\.(json|md|txt)/g) ?? [];
    for (const mention of llmsTxt.split("\n")) {
      if (/\/s\/<id>\.(json|md|txt)/.test(mention)) {
        expect(mention).toMatch(/301|legacy/i);
      }
    }
    expect(suffixMentions.length).toBeGreaterThan(0);
  });

  for (const { format, via } of documentedCombos) {
    it(`GET /s?p= resolves ${format} via ${via === "accept" ? "Accept header" : "?format="}`, async () => {
      const res =
        via === "accept"
          ? await sHandler(makeContext(`/s?p=${payloadP}`, { Accept: acceptFor(format) }))
          : await sHandler(makeContext(`/s?p=${payloadP}&format=${format}`));
      expect(res.status).toBe(200);
      expect(res.headers.get("Content-Type")).toMatch(CONTENT_TYPES[format]);
      const body = await res.text();
      if (format === "json") {
        const decoded = JSON.parse(body);
        expect(decoded.items).toHaveLength(sample.itemCount);
        expect(decoded.items[0].url).toBe(sample.items[0].url);
      } else {
        expect(body).toContain(sample.items[0].url);
      }
    });
  }

  it("HTML (browser) negotiation serves the SPA shell", async () => {
    const res = await sHandler(
      makeContext(`/s?p=${payloadP}`, { Accept: "text/html,application/xhtml+xml" }),
    );
    expect(await res.text()).toContain("SPA shell");
  });
});

describe("OpenAPI spec stays within handled viewer routes", () => {
  const spec = buildOpenApiSpec() as { paths: Record<string, unknown> };

  it("advertises exactly the paths the surfaces handle", () => {
    // The viewer handles /s; server-core handles /api/stash and /s/{id}.
    // Both are asserted structurally; suffix stubs are forbidden.
    expect(Object.keys(spec.paths).sort()).toEqual(["/api/stash", "/s", "/s/{id}"]);
  });

  it("documents the format query param on /s/{id} (consolidated ?format= API)", () => {
    const params = (spec.paths["/s/{id}"] as any).get.parameters as Array<{
      name: string;
      in: string;
    }>;
    expect(params.some((x) => x.name === "format" && x.in === "query")).toBe(true);
  });

  it("documents the format query param and alias enum on /s", () => {
    const params = (spec.paths["/s"] as any).get.parameters as Array<{
      name: string;
      schema?: { enum?: string[] };
    }>;
    const format = params.find((x) => x.name === "format");
    expect(format?.schema?.enum).toEqual(["json", "md", "txt"]);
  });
});
