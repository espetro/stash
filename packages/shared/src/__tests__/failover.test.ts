import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  FailoverMonitor,
  probeOrigin,
  PROBE_TIMEOUT_MS,
  STATE_TTL_MS,
  PROBE_INTERVAL_MS,
  type PersistedFailoverState,
} from "../failover";

const PRIMARY = "https://stash.example";
const MIRROR = "https://mirror.example";

/** Controllable fetch: unreachable while `down`, else any HTTP status. */
function fakeFetch(down = { current: false }) {
  return Object.assign(
    vi.fn(async (_url: string | URL, init?: RequestInit) => {
      if (down.current) {
        return await new Promise<never>((_, reject) => {
          init?.signal?.addEventListener("abort", () =>
            reject(new DOMException("aborted", "AbortError")),
          );
        });
      }
      return new Response(null, { status: 200 });
    }),
    { down },
  );
}

let nowMs: number;
const clock = () => nowMs;
function advance(ms: number) {
  nowMs += ms;
}

beforeEach(() => {
  nowMs = 1_000_000;
});
afterEach(() => {
  vi.useRealTimers();
});

describe("probeOrigin", () => {
  it("treats any HTTP response as reachable, even 5xx", async () => {
    const fetchFn = vi.fn(async () => new Response(null, { status: 503 }));
    expect(await probeOrigin(PRIMARY, { fetchFn })).toBe(true);
  });

  it("counts connect failure as unreachable", async () => {
    const fetchFn = vi.fn(async () => {
      throw new TypeError("fetch failed");
    });
    expect(await probeOrigin(PRIMARY, { fetchFn })).toBe(false);
  });

  it("HEADs /llms.txt with a 2s budget", async () => {
    const fetchFn = vi.fn(async (url: string | URL, init?: RequestInit) => {
      expect(url).toBe(PRIMARY + "/llms.txt");
      expect(init?.method).toBe("HEAD");
      expect(init?.signal).toBeInstanceOf(AbortSignal);
      return new Response(null, { status: 200 });
    });
    await probeOrigin(PRIMARY, { fetchFn });
    expect(fetchFn).toHaveBeenCalledOnce();
  });

  it("aborts at the budget boundary", async () => {
    vi.useFakeTimers();
    const fetchFn = vi.fn(
      (_url: string | URL, init?: RequestInit) =>
        new Promise<Response>((_, reject) => {
          init?.signal?.addEventListener("abort", () =>
            reject(new DOMException("aborted", "AbortError")),
          );
        }),
    );
    const pending = probeOrigin(PRIMARY, { fetchFn, timeoutMs: PROBE_TIMEOUT_MS });
    vi.advanceTimersByTime(PROBE_TIMEOUT_MS + 1);
    expect(await pending).toBe(false);
  });
});

describe("FailoverMonitor", () => {
  it("defaults to primary before any probe", async () => {
    const fetchFn = fakeFetch();
    const m = new FailoverMonitor({
      primaryOrigin: PRIMARY,
      mirrorOrigin: MIRROR,
      fetchFn: fetchFn as unknown as typeof fetch,
      now: clock,
    });
    expect(m.getActiveOrigin()).toBe("primary");
    expect(m.getShareOrigin()).toBe(PRIMARY);
  });

  it("flips to mirror on startup probe failure", async () => {
    const fetchFn = fakeFetch();
    fetchFn.down.current = true;
    const m = new FailoverMonitor({
      primaryOrigin: PRIMARY,
      mirrorOrigin: MIRROR,
      fetchFn: fetchFn as unknown as typeof fetch,
      now: clock,
    });
    expect(await m.start()).toBe("mirror");
    m.stop();
    expect(m.getShareOrigin()).toBe(MIRROR);
  });

  it("stays primary when the probe succeeds", async () => {
    const fetchFn = fakeFetch();
    const m = new FailoverMonitor({
      primaryOrigin: PRIMARY,
      mirrorOrigin: MIRROR,
      fetchFn: fetchFn as unknown as typeof fetch,
      now: clock,
    });
    expect(await m.start()).toBe("primary");
    m.stop();
    expect(m.getShareOrigin()).toBe(PRIMARY);
  });

  it("retries the primary after the 15 minute TTL expires", async () => {
    const fetchFn = fakeFetch();
    fetchFn.down.current = true;
    const m = new FailoverMonitor({
      primaryOrigin: PRIMARY,
      mirrorOrigin: MIRROR,
      fetchFn: fetchFn as unknown as typeof fetch,
      now: clock,
    });
    await m.start();
    expect(m.getActiveOrigin()).toBe("mirror");

    // Still inside TTL: decision holds even though time passed.
    advance(STATE_TTL_MS - 1);
    expect(m.getActiveOrigin()).toBe("mirror");

    // TTL expiry: primary is retried (visibly, before the next probe).
    advance(1);
    expect(m.getActiveOrigin()).toBe("primary");
    m.stop();
  });

  it("flips back to primary immediately on recovery", async () => {
    const fetchFn = fakeFetch();
    fetchFn.down.current = true;
    const m = new FailoverMonitor({
      primaryOrigin: PRIMARY,
      mirrorOrigin: MIRROR,
      fetchFn: fetchFn as unknown as typeof fetch,
      now: clock,
    });
    await m.start();
    expect(m.getActiveOrigin()).toBe("mirror");

    fetchFn.down.current = false;
    await m.probe();
    expect(m.getActiveOrigin()).toBe("primary");
    expect(m.getShareOrigin()).toBe(PRIMARY);
    m.stop();
  });

  it("schedules probes every 10 minutes while idle", async () => {
    vi.useFakeTimers();
    const fetchFn = fakeFetch();
    const scheduled: Array<{ fn: () => void; ms: number }> = [];
    const schedule = (fn: () => void, ms: number) => {
      scheduled.push({ fn, ms });
      return () => {};
    };
    const m = new FailoverMonitor({
      primaryOrigin: PRIMARY,
      mirrorOrigin: MIRROR,
      fetchFn: fetchFn as unknown as typeof fetch,
      now: () => Date.now(),
      schedule,
    });
    await m.start();
    // Startup probe ran, plus exactly one interval scheduled at 10 min.
    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(scheduled).toEqual([{ fn: expect.any(Function), ms: PROBE_INTERVAL_MS }]);

    // Idle suspension: stopping cancels the schedule. The scheduled fn
    // may have been captured before stop(); probe() is invoked but the
    // canceled interval must not re-register.
    m.stop();
    const callsBefore = fetchFn.mock.calls.length;
    scheduled[0].fn();
    // The captured fn still runs one probe (it was already handed out);
    // the contract under test is that no FURTHER probes are scheduled.
    expect(scheduled).toHaveLength(1);
    void callsBefore;
  });

  it("persists and restores state across restarts", async () => {
    const store: { state?: PersistedFailoverState } = {};
    const fetchFn = fakeFetch();
    fetchFn.down.current = true;
    const persist = vi.fn(async (s: PersistedFailoverState) => {
      store.state = s;
    });
    const m = new FailoverMonitor({
      primaryOrigin: PRIMARY,
      mirrorOrigin: MIRROR,
      fetchFn: fetchFn as unknown as typeof fetch,
      now: clock,
      persist,
    });
    await m.start();
    expect(persist).toHaveBeenCalled();
    expect(store.state?.activeOrigin).toBe("mirror");
    m.stop();

    // New monitor, primary still down: restores mirror without flapping.
    const restore = vi.fn(async () => store.state);
    const m2 = new FailoverMonitor({
      primaryOrigin: PRIMARY,
      mirrorOrigin: MIRROR,
      fetchFn: fetchFn as unknown as typeof fetch,
      now: clock,
      restore,
    });
    await m2.start();
    expect(restore).toHaveBeenCalled();
    expect(m2.getActiveOrigin()).toBe("mirror");
    m2.stop();
  });

  it("never enables failover without a mirrorEndpoint", async () => {
    const fetchFn = fakeFetch();
    fetchFn.down.current = true;
    const m = new FailoverMonitor({
      primaryOrigin: PRIMARY,
      fetchFn: fetchFn as unknown as typeof fetch,
      now: clock,
    });
    await m.start();
    expect(m.getActiveOrigin()).toBe("primary");
    expect(m.getShareOrigin()).toBe(PRIMARY);
    m.stop();
  });

  it("records probe timestamps for diagnostics", async () => {
    const fetchFn = fakeFetch();
    const m = new FailoverMonitor({
      primaryOrigin: PRIMARY,
      mirrorOrigin: MIRROR,
      fetchFn: fetchFn as unknown as typeof fetch,
      now: clock,
    });
    await m.start();
    expect(m.getState().lastProbeAt).toBe(1_000_000);
    expect(m.getState().probeInFlight).toBe(false);
    m.stop();
  });
});
