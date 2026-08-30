/**
 * F5 sync client: the extension's peer side of the daemon channel.
 *
 * Owns the sync state machine (`disconnected` / `hello_sent` / `paired` /
 * `refused_version` / `offline`) — the single source of truth all other
 * streams read. Wraps F1's NativeTransport verbatim; the wire format is
 * F1's frame schema (frames.ts) with sync traffic inside `op` frames.
 *
 * Responsibilities (per plan):
 * - W1 pairing handshake: hello → serverCard, protocolVersion range check
 *   both directions, idempotent re-handshake on every reconnect.
 * - W2 outbox drain: flush in order when paired; NACK/timeout retries later.
 * - W3 materialize: daemon `op` frames (tool `stash_sync_change`) apply into
 *   the materialized view via stash-store's materialization path (no echo)
 *   and emit a popup invalidation message.
 * - W4 health: correlated ping/pong; missed pong → `offline` + persisted
 *   lastSeenAt.
 * - W5 one-way seed: full-library snapshot sent right after pairing, before
 *   outbox traffic; idempotent daemon-side, never trims the local store.
 */
import type { Frame } from "../transport/frames";
import { HELLO_PAYLOAD, SERVER_CARD_PAYLOAD } from "../transport/frames";
import {
  NativeTransport,
  type NativePort,
  type TransportStatus,
} from "../transport/native-transport";
import { materializeStashes, listStashes, type StashRecord } from "../stash-store";
import { drainOutbox, outboxSize } from "./outbox";
import { getProfileId } from "./profile";
import {
  OUR_PROTOCOL_VERSION,
  OUR_SUPPORTED_RANGE,
  OP_TIMEOUT_MS,
  PONG_TIMEOUT_MS,
  SYNC_STATUS_KEY,
  SYNC_TOOLS,
  versionCompatible,
  type ChangeRecord,
  type SeedPayload,
  type SyncState,
  type SyncStatusMeta,
} from "./protocol";

export const POPUP_INVALIDATE_MESSAGE = "stash:sync-materialized";

export interface SyncClientOptions {
  hostName: string;
  connect?: (name: string) => NativePort;
  /** Injected clock for tests. */
  now?: () => number;
  /** Popup invalidation hook (defaults to browser.runtime.sendMessage). */
  invalidatePopups?: () => void;
}

interface PendingOp {
  resolve: (ok: boolean, payload?: unknown) => void;
  timer: ReturnType<typeof setTimeout>;
}

function defaultInvalidate(): void {
  try {
    void browser.runtime.sendMessage({ type: POPUP_INVALIDATE_MESSAGE }).catch(() => {
      // No popup open; nothing to invalidate.
    });
  } catch {
    // Context shutting down.
  }
}

export class SyncClient {
  private transport: NativeTransport;
  private state: SyncState = "disconnected";
  private meta: SyncStatusMeta = { state: "disconnected" };
  private pending = new Map<string, PendingOp>();
  private pongTimer: ReturnType<typeof setTimeout> | null = null;
  private seedDone = false;
  private readonly now: () => number;
  private readonly invalidatePopups: () => void;

  constructor(private readonly options: SyncClientOptions) {
    this.now = options.now ?? Date.now;
    this.invalidatePopups = options.invalidatePopups ?? defaultInvalidate;
    this.transport = new NativeTransport({
      hostName: options.hostName,
      connect: options.connect,
      onFrame: (frame) => void this.handleFrame(frame),
      onStatus: (status) => void this.handleTransportStatus(status),
    });
  }

  getState(): SyncState {
    return this.state;
  }

  getStatus(): SyncStatusMeta {
    return this.meta;
  }

  /** Load persisted status metadata (survives SW restarts; W4 last-seen). */
  async restoreStatus(): Promise<void> {
    try {
      const raw = await browser.storage.local.get(SYNC_STATUS_KEY);
      const stored = raw?.[SYNC_STATUS_KEY] as SyncStatusMeta | undefined;
      if (stored && this.state === "disconnected") {
        // A persisted state survives the SW restart only as history: on a
        // fresh worker we are disconnected until a handshake completes.
        this.meta = { ...stored, state: "disconnected" };
      }
    } catch {
      // Storage unavailable (tests); non-fatal.
    }
  }

  /** Begin: connect + hello. Idempotent across SW wake-ups. */
  start(): void {
    // The transport's onStatus(connected) callback drives sendHello, including
    // on every reconnect — a single handshake entry point, never duplicated.
    this.transport.connect();
  }

  dispose(): void {
    this.clearPongTimer();
    for (const [, p] of this.pending) {
      clearTimeout(p.timer);
      p.resolve(false);
    }
    this.pending.clear();
    this.transport.dispose();
    this.setState("disconnected");
  }

  // ---------- W5: one-way seed ----------

  /**
   * Send the full local library as a seed frame. One-way (extension →
   * daemon), idempotent by record id, never mutates/empties the local store.
   * Runs once per pair before any outbox traffic.
   */
  async sendSeed(): Promise<boolean> {
    if (this.state !== "paired") return false;
    const records = await listStashes();
    const origin = await getProfileId();
    const payload: SeedPayload = { records, origin };
    const ok = await this.op(SYNC_TOOLS.seed, payload);
    if (ok) {
      this.seedDone = true;
      this.setMeta({ ...this.meta });
    } else {
      console.warn(
        "[sync] seed failed; daemon may hold partial rows. Run 'stash-daemon doctor'. Will retry on next pair.",
      );
    }
    return ok;
  }

  // ---------- W2: outbox ----------

  /** Drain pending changes; only safe (and only called) while paired. */
  async flushOutbox(): Promise<number> {
    if (this.state !== "paired") return 0;
    const { sent } = await drainOutbox((change) => this.sendChange(change));
    return sent;
  }

  private sendChange(change: ChangeRecord): Promise<boolean> {
    return this.op(SYNC_TOOLS.change, change);
  }

  // ---------- internals ----------

  private sendHello(): void {
    if (this.transport.getStatus() !== "connected") return;
    if (this.state === "hello_sent" || this.state === "paired") return;
    void (async () => {
      this.setState("hello_sent");
      const frame = this.transport.minted("hello", {
        protocolVersion: OUR_PROTOCOL_VERSION,
        supportedRange: OUR_SUPPORTED_RANGE,
        extension: { name: this.browserLabel(), version: this.extensionVersion() },
      });
      this.awaitOp(frame.correlationId);
      this.transport.send(frame);
    })();
  }

  private browserLabel(): string {
    try {
      const ua = typeof navigator !== "undefined" ? navigator.userAgent : "";
      const name = ua.includes("Firefox") ? "Firefox" : ua.includes("Edg/") ? "Edge" : "Chrome";
      return name;
    } catch {
      return "Browser";
    }
  }

  private extensionVersion(): string {
    try {
      return browser.runtime.getManifest().version;
    } catch {
      return "0.0.0";
    }
  }

  private async handleFrame(frame: Frame): Promise<void> {
    // Correlated replies resolve pending ops; daemon pushes have their own ids.
    const pending = this.pending.get(frame.correlationId);
    if (pending) {
      clearTimeout(pending.timer);
      this.pending.delete(frame.correlationId);
    }

    switch (frame.type) {
      case "serverCard": {
        const parsed = SERVER_CARD_PAYLOAD.safeParse(frame.payload);
        if (!parsed.success) {
          console.warn("[sync] malformed serverCard; ignoring");
          return;
        }
        const { protocolVersion, supportedRange, server } = parsed.data;
        if (
          !versionCompatible(
            OUR_PROTOCOL_VERSION,
            OUR_SUPPORTED_RANGE,
            protocolVersion,
            supportedRange,
          )
        ) {
          this.setMeta({
            state: "refused_version",
            refused: { ours: OUR_PROTOCOL_VERSION, theirs: protocolVersion },
            protocolVersion,
          });
          this.persistMeta();
          this.setState("refused_version");
          console.warn(
            `[sync] protocol version mismatch (ours ${OUR_PROTOCOL_VERSION}, theirs ${protocolVersion}); not syncing. Update one side. Local reads/writes unaffected.`,
          );
          return;
        }
        this.setMeta({
          state: "paired",
          daemonId: frame.correlationId,
          daemonName: server.name,
          protocolVersion,
          lastSeenAt: this.now(),
        });
        this.persistMeta();
        this.setState("paired");
        this.armPongTimeout();
        // W5: seed BEFORE normal sync traffic, then drain the W2 backlog.
        if (!this.seedDone) await this.sendSeed();
        await this.flushOutbox();
        return;
      }
      case "opResult": {
        if (pending) pending.resolve(true, frame.payload);
        this.noteDaemonTraffic();
        return;
      }
      case "error": {
        if (pending) pending.resolve(false, frame.payload);
        if (!pending) this.noteDaemonTraffic();
        return;
      }
      case "op": {
        // Daemon → extension push (W3 materialize / W4 pong).
        const payload = frame.payload as { tool?: string; args?: unknown };
        if (payload?.tool === SYNC_TOOLS.pong) {
          this.noteDaemonTraffic();
          this.armPongTimeout();
          if (pending) pending.resolve(true);
          return;
        }
        if (payload?.tool === SYNC_TOOLS.change) {
          await this.materialize(payload.args as ChangeRecord);
          // Ack the push so the daemon knows it landed.
          this.transport.send(
            this.transport.minted("opResult", { result: { ack: frame.correlationId } }),
          );
          return;
        }
        // Unknown tool: NACK per the F1 error convention (payload = ERROR_PAYLOAD).
        this.transport.send(
          this.transport.minted("error", {
            code: "unknown_tool",
            message: `Unknown sync tool: ${payload?.tool}`,
          }),
        );
        return;
      }
      case "hello":
        // We never receive hello.
        return;
    }
  }

  /** W3: apply a daemon-pushed change into the materialized view. */
  private async materialize(change: ChangeRecord): Promise<void> {
    if (!change || typeof change.id !== "string") {
      console.warn("[sync] malformed change frame; ignoring");
      return;
    }
    await materializeStashes((stashes) => {
      if (change.op === "delete") {
        return stashes.filter((s) => s.id !== change.id);
      }
      if (!change.record) {
        console.warn("[sync] upsert change without record; ignoring");
        return stashes;
      }
      const index = stashes.findIndex((s) => s.id === change.id);
      const next = [...stashes];
      if (index === -1) next.push(change.record!);
      else next[index] = change.record!;
      return next;
    });
    this.invalidatePopups();
  }

  private noteDaemonTraffic(): void {
    this.setMeta({ ...this.meta, lastSeenAt: this.now() });
    this.persistMeta();
    this.armPongTimeout();
  }

  private armPongTimeout(): void {
    this.clearPongTimer();
    this.pongTimer = setTimeout(() => void this.ping(), PONG_TIMEOUT_MS);
  }

  private clearPongTimer(): void {
    if (this.pongTimer) {
      clearTimeout(this.pongTimer);
      this.pongTimer = null;
    }
  }

  /** W4 health probe: correlated ping; missed pong flips to `offline`. */
  private async ping(): Promise<void> {
    if (this.state !== "paired") return;
    const ok = await this.op(SYNC_TOOLS.ping, {});
    if (!ok && this.state === "paired") {
      const lastSeenAt = this.meta.lastSeenAt;
      this.setState("offline");
      this.setMeta({ ...this.meta, state: "offline", lastSeenAt });
      this.persistMeta();
      console.warn(
        "[sync] daemon missed pong; marked offline. Run 'stash-daemon doctor' if this persists.",
      );
    }
  }

  /** Correlated op send with timeout-based NACK semantics. */
  private op(tool: string, args: unknown): Promise<boolean> {
    if (this.transport.getStatus() !== "connected") return Promise.resolve(false);
    const frame = this.transport.minted("op", { tool, args });
    const done = this.awaitOp(frame.correlationId);
    try {
      this.transport.send(frame);
    } catch {
      this.resolveOp(frame.correlationId, false);
    }
    return done;
  }

  private awaitOp(correlationId: string): Promise<boolean> {
    return new Promise<boolean>((resolve) => {
      const timer = setTimeout(() => {
        this.pending.delete(correlationId);
        resolve(false);
      }, OP_TIMEOUT_MS);
      this.pending.set(correlationId, { resolve: (ok) => resolve(ok), timer });
    });
  }

  private resolveOp(correlationId: string, ok: boolean): void {
    const pending = this.pending.get(correlationId);
    if (!pending) return;
    clearTimeout(pending.timer);
    this.pending.delete(correlationId);
    pending.resolve(ok);
  }

  private async handleTransportStatus(status: TransportStatus): Promise<void> {
    if (status === "connected") {
      // Idempotent re-handshake on every port (re)connect (MV3 + daemon restarts).
      this.sendHello();
      return;
    }
    if (status === "disconnected" && (this.state === "paired" || this.state === "hello_sent")) {
      this.clearPongTimer();
      this.setState("offline");
      this.setMeta({ ...this.meta, state: "offline" });
      this.persistMeta();
    }
  }

  private setState(state: SyncState): void {
    this.state = state;
    this.meta = { ...this.meta, state };
  }

  private setMeta(meta: SyncStatusMeta): void {
    this.meta = meta;
  }

  private persistMeta(): void {
    void browser.storage.local.set({ [SYNC_STATUS_KEY]: this.meta }).catch(() => {
      // Storage hiccup; status is advisory.
    });
  }

  /** Pending outbox size for the W4 status surface. */
  backlogSize(): Promise<number> {
    return outboxSize();
  }
}
