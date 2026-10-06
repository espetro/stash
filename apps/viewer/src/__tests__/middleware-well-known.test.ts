import { describe, expect, it } from "vitest";
import { onRequest } from "../../functions/_middleware";

const request = new Request("https://stash.example/.well-known/mcp-server-card");

describe("well-known middleware", () => {
  it("passes through a real file response", async () => {
    const file = new Response('{"name":"Stash"}', {
      headers: { "Content-Type": "application/json" },
    });

    const response = await onRequest({ request, next: async () => file });

    expect(response).toBe(file);
    expect(response.status).toBe(200);
  });

  it("replaces the SPA HTML fallback with the JSON 404", async () => {
    const response = await onRequest({
      request,
      next: async () =>
        new Response("<html>SPA fallback</html>", {
          headers: { "Content-Type": "text/html; charset=utf-8" },
        }),
    });

    expect(response.status).toBe(404);
    expect(response.headers.get("Content-Type")).toBe("application/json");
    expect(await response.json()).toEqual({ error: "not_found" });
  });

  it("replaces an upstream 404 with the JSON 404", async () => {
    const response = await onRequest({
      request,
      next: async () => new Response("not found", { status: 404 }),
    });

    expect(response.status).toBe(404);
    expect(response.headers.get("Content-Type")).toBe("application/json");
    expect(await response.json()).toEqual({ error: "not_found" });
  });
});
