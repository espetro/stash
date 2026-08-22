import { describe, it, expect } from "vitest";
import { createStorage } from "unstorage";
import memoryDriver from "unstorage/drivers/memory";
import { classifyClient, classifyOrigin, ttlBucketFor, isBeaconEvent } from "../src/telemetry";
import { createStashServer, type TelemetryEvent } from "../src/index";
import { getTestBrotli as getBrotliFunctions } from "./brotli";

describe("classifyClient", () => {
  it("classifies POST /mcp as agent", () => {
    const req = new Request("https://s.example.com/mcp", { method: "POST" });
    expect(classifyClient(req)).toBe("agent");
  });

  it("classifies .json/.md suffixed requests as agent", () => {
    expect(classifyClient(new Request("https://s.example.com/s/ABCDEF.json"))).toBe("agent");
    expect(classifyClient(new Request("https://s.example.com/s/ABCDEF.md"))).toBe("agent");
  });

  it("classifies a known agent UA as agent", () => {
    const req = new Request("https://s.example.com/s/ABCDEF", {
      headers: { "User-Agent": "python-httpx/0.27" },
    });
    expect(classifyClient(req)).toBe("agent");
  });

  it("classifies browser UA with Sec-Fetch headers as human", () => {
    const req = new Request("https://s.example.com/s/ABCDEF", {
      headers: {
        "User-Agent": "Mozilla/5.0 (Macintosh) AppleWebKit/537.36",
        "Sec-Fetch-Mode": "navigate",
      },
    });
    expect(classifyClient(req)).toBe("human");
  });

  it("classifies missing UA as unknown", () => {
    const req = new Request("https://s.example.com/s/ABCDEF");
    expect(classifyClient(req)).toBe("unknown");
  });
});

describe("classifyOrigin", () => {
  it("classifies chrome-extension origin", () => {
    const req = new Request("https://s.example.com/api/stash", {
      headers: { Origin: "chrome-extension://abcdefg" },
    });
    expect(classifyOrigin(req)).toBe("extension");
  });

  it("classifies https origin as web", () => {
    const req = new Request("https://s.example.com/api/stash", {
      headers: { Origin: "https://stash.illo.fyi" },
    });
    expect(classifyOrigin(req)).toBe("web");
  });

  it("classifies missing Origin/Referer as n/a", () => {
    const req = new Request("https://s.example.com/api/stash");
    expect(classifyOrigin(req)).toBe("n/a");
  });
});

describe("ttlBucketFor", () => {
  it("passes through valid ttls", () => {
    expect(ttlBucketFor("7d")).toBe("7d");
  });

  it("falls back to n/a for anything else", () => {
    expect(ttlBucketFor(undefined)).toBe("n/a");
    expect(ttlBucketFor("bogus")).toBe("n/a");
  });
});

describe("isBeaconEvent", () => {
  it("accepts allowlisted events", () => {
    expect(isBeaconEvent("popup_open")).toBe(true);
    expect(isBeaconEvent("stash_saved")).toBe(true);
  });

  it("rejects anything else", () => {
    expect(isBeaconEvent("not_a_real_event")).toBe(false);
    expect(isBeaconEvent(123)).toBe(false);
  });
});

describe("POST /beacon", () => {
  const events: TelemetryEvent[] = [];
  const server = createStashServer({
    storage: createStorage({ driver: memoryDriver() }),
    origin: "https://short.example.com",
    getBrotli: getBrotliFunctions,
    telemetry: { record: (e) => events.push(e) },
  });

  it("accepts an allowlisted event and records it", async () => {
    events.length = 0;
    const res = await server.handle(
      new Request("https://short.example.com/beacon", {
        method: "POST",
        body: JSON.stringify({ event: "popup_open", surface: "extension" }),
      }),
    );
    expect(res.status).toBe(204);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      route: "beacon",
      beaconEvent: "popup_open",
      surface: "extension",
      status: 204,
    });
  });

  it("rejects an unknown event", async () => {
    const res = await server.handle(
      new Request("https://short.example.com/beacon", {
        method: "POST",
        body: JSON.stringify({ event: "totally_made_up", surface: "web" }),
      }),
    );
    expect(res.status).toBe(400);
  });

  it("rejects an unknown surface", async () => {
    const res = await server.handle(
      new Request("https://short.example.com/beacon", {
        method: "POST",
        body: JSON.stringify({ event: "popup_open", surface: "mobile" }),
      }),
    );
    expect(res.status).toBe(400);
  });

  it("supports CORS preflight", async () => {
    const res = await server.handle(
      new Request("https://short.example.com/beacon", { method: "OPTIONS" }),
    );
    expect(res.status).toBe(204);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("*");
  });
});

describe("telemetry recording across routes", () => {
  it("records POST /api/stash with the ttl bucket", async () => {
    const events: TelemetryEvent[] = [];
    const server = createStashServer({
      storage: createStorage({ driver: memoryDriver() }),
      origin: "https://short.example.com",
      getBrotli: getBrotliFunctions,
      telemetry: { record: (e) => events.push(e) },
    });
    const brotli = await getBrotliFunctions();
    const { createPayload, encodePayloadToUrl } = await import("@stash/codec");
    const payload = await encodePayloadToUrl(
      createPayload([{ url: "https://github.com", title: "GitHub" }], 24, "T"),
      brotli,
    );
    const res = await server.handle(
      new Request("https://short.example.com/api/stash", {
        method: "POST",
        body: JSON.stringify({ payload, ttl: "7d" }),
      }),
    );
    expect(res.status).toBe(201);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ route: "api_stash", ttlBucket: "7d", status: 201 });
  });

  it("records GET /health", async () => {
    const events: TelemetryEvent[] = [];
    const server = createStashServer({
      storage: createStorage({ driver: memoryDriver() }),
      origin: "https://short.example.com",
      getBrotli: getBrotliFunctions,
      telemetry: { record: (e) => events.push(e) },
    });
    const res = await server.handle(new Request("https://short.example.com/health"));
    expect(res.status).toBe(200);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ route: "health", status: 200 });
  });

  it("does not record when no telemetry sink is configured", async () => {
    const server = createStashServer({
      storage: createStorage({ driver: memoryDriver() }),
      origin: "https://short.example.com",
      getBrotli: getBrotliFunctions,
    });
    const res = await server.handle(new Request("https://short.example.com/health"));
    expect(res.status).toBe(200);
  });
});
