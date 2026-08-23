import { describe, it, expect } from "vitest";
import { buildOpenApiSpec } from "../lib/openapi-spec";

/**
 * Structural smoke test for the OpenAPI 3 spec emitted by
 * GET /api/openapi.json. Kept dependency-free — full schema validation
 * lives in the doc tooling that ships with the viewer.
 */
describe("buildOpenApiSpec", () => {
  const spec = buildOpenApiSpec() as Record<string, unknown> & {
    paths: Record<string, unknown>;
    info: Record<string, unknown>;
    servers: unknown[];
  };

  it("declares OpenAPI 3.1.0", () => {
    expect(spec.openapi).toBe("3.1.0");
  });

  it("has info, servers, and paths blocks", () => {
    expect(spec.info).toBeDefined();
    expect((spec.info as any).title).toBeTruthy();
    expect((spec.info as any).version).toBeTruthy();
    expect(Array.isArray(spec.servers)).toBe(true);
    expect(spec.servers.length).toBeGreaterThan(0);
    expect(typeof spec.paths).toBe("object");
    expect(Object.keys(spec.paths).length).toBeGreaterThan(0);
  });

  it("exposes the canonical decoder path /s without legacy /json and /md paths", () => {
    expect(spec.paths["/s"]).toBeDefined();
    expect(spec.paths["/json"]).toBeUndefined();
    expect(spec.paths["/md"]).toBeUndefined();

    const route = spec.paths["/s"] as any;
    const params = route.get?.parameters as { name: string; in: string }[];
    const p = params?.find((x) => x.name === "p" && x.in === "query");
    const format = params?.find((x) => x.name === "format" && x.in === "query");
    expect(p).toBeDefined();
    expect(format).toBeDefined();
  });

  it("exposes the shortener /s/{id}[.json|.md] path family", () => {
    expect(spec.paths["/s/{id}"]).toBeDefined();
    expect(spec.paths["/s/{id}.json"]).toBeDefined();
    expect(spec.paths["/s/{id}.md"]).toBeDefined();
  });

  it("exposes /api/stash for short-link creation", () => {
    const route = spec.paths["/api/stash"] as { post?: unknown };
    expect(route.post).toBeDefined();
  });

  it("reuses StashCreated, DecodedPayload, and ErrorResponse schemas", () => {
    const components = (spec as any).components?.schemas ?? {};
    expect(components.DecodedPayload).toBeDefined();
    expect(components.StashCreated).toBeDefined();
    expect(components.ErrorResponse).toBeDefined();
  });
});
