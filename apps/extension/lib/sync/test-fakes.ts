/**
 * Shared test double for F5 tests. A `NativePort` + `NativeTransport`
 * conforming fake daemon channel implementing the F1 frame schema
 * (newline-delimited JSON, same envelope/correlationId/error conventions).
 */
import {
  decodeFrames,
  encodeFrame,
  makeFrame,
  mintCorrelationId,
  type Frame,
} from "../transport/frames";
import type { NativePort } from "../transport/native-transport";
import { SYNC_TOOLS } from "./protocol";

export class FakeDaemonPort implements NativePort {
  messageListeners = new Set<(message: unknown) => void>();
  disconnectListeners = new Set<() => void>();
  received: Frame[] = [];
  /** When set, intercepts frames and may reply or stay silent. */
  handler: ((frame: Frame, reply: (f: Frame) => void) => void) | null = null;

  postMessage = (message: unknown): void => {
    const { frames } = decodeFrames(typeof message === "string" ? message : String(message));
    for (const frame of frames) {
      this.received.push(frame);
      this.handler?.(frame, (f) => this.deliverToExtension(f));
    }
  };

  deliverToExtension(frame: Frame): void {
    for (const listener of this.messageListeners) listener(encodeFrame(frame));
  }

  disconnect = (): void => {
    for (const listener of [...this.disconnectListeners]) listener();
  };

  onMessage = {
    addListener: (fn: (message: unknown) => void) => this.messageListeners.add(fn),
    removeListener: (fn: (message: unknown) => void) => this.messageListeners.delete(fn),
  };

  onDisconnect = {
    addListener: (fn: () => void) => this.disconnectListeners.add(fn),
    removeListener: (fn: () => void) => this.disconnectListeners.delete(fn),
  };
}

/** A reference fake daemon implementing the F5 contract on the F1 frames. */
export function installFakeDaemon(
  port: FakeDaemonPort,
  opts?: {
    protocolVersion?: string;
    supportedRange?: string;
    /** When false (default true), pings go unanswered so the client flips to offline. */ answerPings?: boolean;
  },
) {
  const protocolVersion = opts?.protocolVersion ?? "1.0.0";
  const supportedRange = opts?.supportedRange ?? ">=1.0.0 <2.0.0";
  const changes: unknown[] = [];
  let seeded: unknown[] | null = null;
  let seedCount = 0;

  port.handler = (frame, reply) => {
    if (frame.type === "hello") {
      reply(
        makeFrame("serverCard", frame.correlationId, {
          protocolVersion,
          supportedRange,
          server: { name: "stash-daemon", version: "0.1.0" },
        }),
      );
      return;
    }
    if (frame.type === "op") {
      const { tool, args } = frame.payload as { tool: string; args: unknown };
      if (tool === SYNC_TOOLS.ping) {
        if (opts?.answerPings !== false) {
          reply(makeFrame("opResult", frame.correlationId, { result: { tool: SYNC_TOOLS.pong } }));
        }
        return;
      }
      if (tool === SYNC_TOOLS.seed) {
        seeded = (args as { records: unknown[] }).records;
        seedCount++;
        reply(makeFrame("opResult", frame.correlationId, { result: { seeded: true } }));
        return;
      }
      if (tool === SYNC_TOOLS.change) {
        changes.push(args);
        reply(makeFrame("opResult", frame.correlationId, { result: { applied: 1 } }));
        return;
      }
      reply(
        makeFrame("error", frame.correlationId, {
          code: "unknown_tool",
          message: `no tool ${tool}`,
        }),
      );
    }
  };

  return {
    changes,
    getSeeded: () => seeded,
    seedCount: () => seedCount,
  };
}
