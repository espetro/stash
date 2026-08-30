/**
 * FailoverMonitor (F13 W3): primary-origin health probing and activeOrigin
 * selection, shared by the extension background and any other TS consumer.
 *
 * Semantics (spec §9a.4):
 * - Probe: HEAD /llms.txt against the primary with a 2 second overall
 *   budget. ANY HTTP response counts as reachable (even 5xx): the failure
 *   mode is IP null-routing, not application error. Connect/TLS/timeout
 *   failures mark the primary unreachable.
 * - Schedule: probe on start() and every PROBE_INTERVAL_MS while running.
 *   Never per request — no latency tax on normal operation.
 * - State: activeOrigin "primary" | "mirror" cached with a
 *   STATE_TTL_MS lifetime. A failed probe flips to mirror; the primary is
 *   retried at the next scheduled probe after the TTL expires, and a
 *   successful probe flips back to primary immediately.
 * - Persistence: pass `persist`/`restore` callbacks to survive restarts
 *   (extension: browser.storage.local; daemon: its state store) so a
 *   restart mid-outage does not flap back to primary.
 *
 * Dependency-free: uses only WHATWG fetch/AbortController and injectable
 * timers, so the same module runs in workers, deno, and node >= 18.
 */

export type ActiveOrigin = "primary" | "mirror";

/** Probe /llms.txt with this overall budget. */
export const PROBE_TIMEOUT_MS = 2_000;
/** Scheduled probe cadence while the monitor is running. */
export const PROBE_INTERVAL_MS = 10 * 60_000;
/** How long a "mirror" decision is trusted before retrying the primary. */
export const STATE_TTL_MS = 15 * 60_000;

export interface FailoverMonitorOptions {
  /** Primary base origin, e.g. "https://stash.illo.fyi". */
  primaryOrigin: string;
  /** Mirror base origin (daemon TOML mirrorEndpoint). Empty/unset means
   *  failover is disabled: activeOrigin stays "primary". */
  mirrorOrigin?: string;
  /** Probe path; /llms.txt per spec. */
  probePath?: string;
  /** Injectable clock (ms epoch) for tests. */
  now?: () => number;
  /** Injectable scheduler; defaults to setInterval. Return a canceler. */
  schedule?: (fn: () => void, ms: number) => () => void;
  /** Injectable fetch for tests. */
  fetchFn?: typeof fetch;
  /** Persist the state record after each probe. */
  persist?: (state: PersistedFailoverState) => void | Promise<void>;
  /** Load the persisted state before the first decision. */
  restore?: () => PersistedFailoverState | undefined | Promise<PersistedFailoverState | undefined>;
}

export interface PersistedFailoverState {
  activeOrigin: ActiveOrigin;
  /** Epoch ms of the last completed probe. */
  lastProbeAt: number;
  /** Epoch ms when the current decision expires (mirror TTL). */
  decisionExpiresAt: number;
}

/** True when fetch() resolved with ANY status inside the budget. */
export async function probeOrigin(
  origin: string,
  opts: { probePath?: string; timeoutMs?: number; fetchFn?: typeof fetch } = {},
): Promise<boolean> {
  const { probePath = "/llms.txt", timeoutMs = PROBE_TIMEOUT_MS, fetchFn = fetch } = opts;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetchFn(new URL(probePath, origin).toString(), {
      method: "HEAD",
      signal: controller.signal,
      // Never let response bodies or caches add latency to a probe.
      cache: "no-store",
      redirect: "follow",
    });
    void res.body?.cancel().catch(() => {});
    return true; // any HTTP response means the network path works
  } catch {
    return false; // connect failure, TLS failure, or budget exceeded
  } finally {
    clearTimeout(timer);
  }
}

export class FailoverMonitor {
  private readonly opts: Required<
    Pick<FailoverMonitorOptions, "primaryOrigin" | "probePath">
  > & FailoverMonitorOptions;
  private activeOrigin: ActiveOrigin = "primary";
  private lastProbeAt = 0;
  private decisionExpiresAt = 0;
  private cancelSchedule: (() => void) | null = null;
  private probing = false;

  constructor(options: FailoverMonitorOptions) {
    this.opts = { probePath: "/llms.txt", ...options };
  }

  /** Probe immediately, then every PROBE_INTERVAL_MS until stop(). */
  async start(): Promise<ActiveOrigin> {
    if (this.opts.restore) {
      const restored = await this.opts.restore();
      if (restored) {
        this.activeOrigin = restored.activeOrigin;
        this.lastProbeAt = restored.lastProbeAt;
        this.decisionExpiresAt = restored.decisionExpiresAt;
      }
    }
    await this.probe();
    const cancel = this.opts.schedule?.call(null, () => {
      void this.probe();
    }, PROBE_INTERVAL_MS) ?? this.defaultSchedule();
    this.cancelSchedule = cancel;
    return this.activeOrigin;
  }

  stop(): void {
    this.cancelSchedule?.();
    this.cancelSchedule = null;
  }

  /** Current origin share-link emitters should use. */
  getActiveOrigin(): ActiveOrigin {
    if (this.opts.mirrorOrigin == null || this.opts.mirrorOrigin === "") return "primary";
    const now = this.opts.now?.() ?? Date.now();
    // Expired mirror decision: retry the primary until a probe says otherwise.
    if (this.activeOrigin === "mirror" && now >= this.decisionExpiresAt) {
      return "primary";
    }
    return this.activeOrigin;
  }

  /** Base origin for share-link emission; never blocks on a probe. */
  getShareOrigin(): string {
    return this.getActiveOrigin() === "mirror"
      ? this.opts.mirrorOrigin ?? this.opts.primaryOrigin
      : this.opts.primaryOrigin;
  }

  /** Diagnostics snapshot (F12 observability rides along in consumers). */
  getState(): PersistedFailoverState & { probeInFlight: boolean } {
    return {
      activeOrigin: this.getActiveOrigin(),
      lastProbeAt: this.lastProbeAt,
      decisionExpiresAt: this.decisionExpiresAt,
      probeInFlight: this.probing,
    };
  }

  /** Run one probe round and update the decision. */
  async probe(): Promise<ActiveOrigin> {
    if (this.probing) return this.activeOrigin; // never overlap probes
    if (!this.opts.mirrorOrigin) return this.activeOrigin; // failover disabled
    this.probing = true;
    try {
      const reachable = await probeOrigin(this.opts.primaryOrigin, {
        probePath: this.opts.probePath,
        fetchFn: this.opts.fetchFn,
      });
      const now = this.opts.now?.() ?? Date.now();
      this.lastProbeAt = now;
      const previous = this.activeOrigin;
      if (reachable) {
        this.activeOrigin = "primary";
        this.decisionExpiresAt = 0;
      } else {
        this.activeOrigin = "mirror";
        this.decisionExpiresAt = now + STATE_TTL_MS;
      }
      if (previous !== this.activeOrigin || this.opts.persist) {
        await this.opts.persist?.(this.snapshot());
      }
      return this.activeOrigin;
    } finally {
      this.probing = false;
    }
  }

  private snapshot(): PersistedFailoverState {
    return {
      activeOrigin: this.activeOrigin,
      lastProbeAt: this.lastProbeAt,
      decisionExpiresAt: this.decisionExpiresAt,
    };
  }

  private defaultSchedule(): () => void {
    const t = setInterval(() => {
      void this.probe();
    }, PROBE_INTERVAL_MS);
    // Unref when available (node/bun) so the monitor never holds the loop.
    (t as unknown as { unref?: () => void }).unref?.();
    return () => clearInterval(t);
  }
}
