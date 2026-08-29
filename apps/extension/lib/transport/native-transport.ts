/**
 * Native-messaging transport (F1.W3): wrapper over
 * `browser.runtime.connectNative(<hostName>)` with newline-delimited JSON
 * framing from ./frames.
 *
 * Design constraints (plan §W3):
 * - Idempotent reconnect: `onDisconnect` may fire more than once (or be
 *   triggered twice); reconnect is guarded so attempts are safe to repeat.
 * - No state held in the MV3 service worker beyond the live port handle:
 *   the daemon owns state, and every frame carries a correlation id so a
 *   reconnect mid-flight loses nothing.
 * - Tool names pass through opaquely (frames carry them, this module never
 *   inspects them).
 */

import { encodeFrame, mintCorrelationId, type Frame, type FrameType } from "./frames";

export interface NativeTransportOptions {
  hostName: string;
  /** DI for tests; defaults to the extension API. */
  connect?: (name: string) => NativePort;
  /** DI for tests; defaults to Math.random-based minting. */
  mintCorrelationId?: () => string;
  /** Reconnect backoff in ms (default 1000). */
  reconnectDelayMs?: number;
  onFrame?: (frame: Frame) => void;
  onStatus?: (status: TransportStatus) => void;
}

export type TransportStatus = "disconnected" | "connecting" | "connected";

/** Minimal structural port type (works for webextension-polyfill and mocks). */
export interface NativePort {
  postMessage: (message: unknown) => void;
  disconnect: () => void;
  onMessage: {
    addListener: (fn: (message: unknown) => void) => void;
    removeListener: (fn: (message: unknown) => void) => void;
  };
  onDisconnect: {
    addListener: (fn: () => void) => void;
    removeListener: (fn: () => void) => void;
  };
}

/**
 * Frame-parsing wrapper over a raw port: newline-delimited JSON in, typed
 * Frames out. The port emits raw strings; NM layer handles length
 * prefixing, this layer handles framing/parse.
 */
export class NativeTransport {
  private port: NativePort | null = null;
  private buffer = "";
  private status: TransportStatus = "disconnected";
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private disposed = false;

  constructor(private readonly options: NativeTransportOptions) {}

  getStatus(): TransportStatus {
    return this.status;
  }

  /** Idempotent: safe to call repeatedly (e.g. from multiple SW wake-ups). */
  connect(): void {
    if (this.disposed || this.port) return;
    this.clearReconnectTimer();
    this.setStatus("connecting");
    this.port = (this.options.connect ?? defaultConnect)(this.options.hostName);
    this.port.onMessage.addListener(this.handleRawMessage);
    this.port.onDisconnect.addListener(this.handleDisconnect);
    this.setStatus("connected");
  }

  /**
   * Send a frame. Frames are fire-and-forget at the transport layer;
   * correlation ids (minted by the sender, carried in the frame) let the
   * caller correlate responses after any reconnect.
   */
  send(frame: Frame): void {
    if (!this.port) this.connect();
    this.port?.postMessage(encodeFrame(frame));
  }

  /** Build an op frame with a freshly minted sender correlation id. */
  minted(type: FrameType, payload: unknown): Frame {
    const mint = this.options.mintCorrelationId ?? mintCorrelationId;
    return { type, correlationId: mint("ext"), payload } as Frame;
  }

  /** Tear down permanently; no further reconnects. */
  dispose(): void {
    this.disposed = true;
    this.clearReconnectTimer();
    this.detach();
    this.setStatus("disconnected");
  }

  private detach(): void {
    if (!this.port) return;
    this.port.onMessage.removeListener(this.handleRawMessage);
    this.port.onDisconnect.removeListener(this.handleDisconnect);
    try {
      this.port.disconnect();
    } catch {
      // already dead
    }
    this.port = null;
  }

  /**
   * Idempotent reconnect: fires from onDisconnect, but a second
   * onDisconnect (double-fire bug) or racing calls never schedules two
   * reconnects or throws on a dead port.
   */
  private handleDisconnect = (): void => {
    this.detach(); // clears this.port; repeated calls are no-ops
    this.buffer = "";
    if (this.disposed) return;
    this.setStatus("disconnected");
    if (this.reconnectTimer) return; // already scheduled
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, this.options.reconnectDelayMs ?? 1000);
  };

  private handleRawMessage = (raw: unknown): void => {
    // Feed the partial buffer through the framing decoder.
    this.buffer += typeof raw === "string" ? raw : "";
    const { frames, rest } = safeDecode(this.buffer);
    this.buffer = rest;
    for (const frame of frames) this.options.onFrame?.(frame);
  };

  private setStatus(status: TransportStatus): void {
    if (this.status === status) return;
    this.status = status;
    this.options.onStatus?.(status);
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }
}

function safeDecode(buffer: string): { frames: Frame[]; rest: string } {
  // Lazy import avoided for bundle simplicity; decodeFrames throws on
  // complete-but-invalid lines, which we swallow (daemon protocol violation)
  // while keeping any complete lines parsed so far.
  try {
    // Delegate; implemented inline to keep invalid-line isolation.
    const lines = buffer.split("\n");
    const rest = lines.pop() ?? "";
    const frames: Frame[] = [];
    for (const line of lines) {
      if (line.trim() === "") continue;
      frames.push(JSON.parse(line) as Frame);
    }
    return { frames, rest };
  } catch {
    return { frames: [], rest: "" };
  }
}

function defaultConnect(name: string): NativePort {
  const g = globalThis as unknown as {
    browser?: { runtime: { connectNative: (n: string) => unknown } };
    chrome?: { runtime: { connectNative: (n: string) => unknown } };
  };
  const port = g.browser?.runtime?.connectNative
    ? g.browser.runtime.connectNative(name)
    : g.chrome!.runtime.connectNative(name);
  return port as NativePort;
}
