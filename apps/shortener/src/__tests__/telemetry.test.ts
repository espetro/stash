import { describe, it, expect, beforeEach } from "vitest";
import { createStorage } from "unstorage";
import memoryDriver from "unstorage/drivers/memory";
import worker from "../index";
import type { Env } from "../index";

function fakeAnalyticsEngine() {
  const points: AnalyticsEngineDataPoint[] = [];
  return {
    dataset: {
      writeDataPoint: (event?: AnalyticsEngineDataPoint) => {
        if (event) points.push(event);
      },
    } as AnalyticsEngineDataset,
    points,
  };
}

let mockEnv: Env;

function fetchWorker(url: string, init?: RequestInit): Promise<Response> {
  return worker.fetch(new Request(url, init), mockEnv, {
    passThroughOnException: () => {},
    props: {},
  } as unknown as ExecutionContext);
}

beforeEach(() => {
  mockEnv = { TEST_STORAGE: createStorage({ driver: memoryDriver() }) };
});

describe("Analytics Engine telemetry", () => {
  it("writes a data point for GET /health when the binding is present", async () => {
    const { dataset, points } = fakeAnalyticsEngine();
    mockEnv.STASH_ANALYTICS = dataset;
    const res = await fetchWorker("https://short.example.com/health");
    expect(res.status).toBe(200);
    expect(points).toHaveLength(1);
    expect(points[0].indexes).toEqual(["health"]);
    expect(points[0].doubles).toEqual([200]);
    expect(points[0].blobs?.[0]).toBe("health");
  });

  it("does not throw when the binding is absent", async () => {
    delete mockEnv.STASH_ANALYTICS;
    const res = await fetchWorker("https://short.example.com/health");
    expect(res.status).toBe(200);
  });

  it("writes a beacon data point with event/surface blobs", async () => {
    const { dataset, points } = fakeAnalyticsEngine();
    mockEnv.STASH_ANALYTICS = dataset;
    const res = await fetchWorker("https://short.example.com/beacon", {
      method: "POST",
      body: JSON.stringify({ event: "stash_saved", surface: "extension" }),
    });
    expect(res.status).toBe(204);
    expect(points).toHaveLength(1);
    expect(points[0].blobs).toEqual([
      "beacon",
      "unknown",
      "n/a",
      "n/a",
      "stash_saved",
      "extension",
    ]);
  });
});
