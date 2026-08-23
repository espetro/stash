import { describe, it, expect, vi } from "vitest";
import { createClient, envConfig, BudgetExceededError, MAX_REQUESTS_PER_RUN } from "../harness";

function okFetch(model = "fake/model") {
  return vi.fn(async () =>
    new Response(JSON.stringify({ choices: [{ message: { content: "hi" } }] }), {
      status: 200,
      headers: { "x-or-model": model },
    }),
  ) as unknown as typeof fetch;
}

describe("envConfig", () => {
  it("defaults the model to a known-good :free slug", () => {
    expect(envConfig({ OPENROUTER_API_KEY: "k" }).model).toBe("nvidia/nemotron-3-super-120b-a12b:free");
  });
  it("prefers the env override", () => {
    expect(envConfig({ OPENROUTER_API_KEY: "k", OPENROUTER_MODEL_ID: "x/y:free" }).model).toBe("x/y:free");
  });
});

describe("createClient", () => {
  it("records the served model from x-or-model", async () => {
    const client = createClient(okFetch("vendor/real-model"));
    const res = await client.chat("hi", "sys");
    expect(res.servedModel).toBe("vendor/real-model");
    expect(res.content).toBe("hi");
  });

  it("retries once on 429 then succeeds", async () => {
    let calls = 0;
    const fetchImpl = vi.fn(async () => {
      calls++;
      if (calls === 1) return new Response("rate limited", { status: 429 });
      return new Response(JSON.stringify({ choices: [{ message: { content: "ok" } }] }), {
        status: 200,
        headers: { "x-or-model": "m" },
      });
    }) as unknown as typeof fetch;
    const client = createClient(fetchImpl);
    const res = await client.chat("hi", "sys");
    expect(res.attempts).toBe(2);
    expect(res.content).toBe("ok");
  });

  it("does not retry on 400", async () => {
    const fetchImpl = vi.fn(async () => new Response("bad", { status: 400 })) as unknown as typeof fetch;
    const client = createClient(fetchImpl);
    await expect(client.chat("hi", "sys")).rejects.toThrow(/400/);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("hard-stops at the budget cap", async () => {
    const fetchImpl = okFetch();
    const client = createClient(fetchImpl);
    for (let i = 0; i < MAX_REQUESTS_PER_RUN; i++) await client.chat("hi", "sys");
    await expect(client.chat("one more", "sys")).rejects.toBeInstanceOf(BudgetExceededError);
    expect(fetchImpl).toHaveBeenCalledTimes(MAX_REQUESTS_PER_RUN);
  });

  it("fails fast without an API key", async () => {
    const original = process.env.OPENROUTER_API_KEY;
    delete process.env.OPENROUTER_API_KEY;
    const client = createClient(okFetch());
    await expect(client.chat("hi", "sys")).rejects.toThrow(/OPENROUTER_API_KEY/);
    if (original !== undefined) process.env.OPENROUTER_API_KEY = original;
  });
});
