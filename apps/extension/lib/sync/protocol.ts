/**
 * Sync protocol primitives (F5.W1/W2/W3/W5).
 *
 * The wire format is F1's frame schema (`../transport/frames`) used verbatim:
 * change records and seed payloads ride inside `op` frames (`tool` namespaced
 * under `stash_sync_*`, `args` opaque) so we never fork FRAME_TYPES, the
 * envelope, error shape, or correlation-id conventions. F6 replaces the
 * payload contents (Automerge deltas), not the framing.
 */
import { PROTOCOL_VERSION, SUPPORTED_RANGE } from "../transport/frames";
import type { StashRecord } from "../stash-store";

/** op `tool` names reserved for the sync channel. */
export const SYNC_TOOLS = {
  change: "stash_sync_change",
  seed: "stash_sync_seed",
  ping: "stash_sync_ping",
  pong: "stash_sync_pong",
} as const;

/** Outbox cap. Overflow drops the OLDEST record with a logged warning. */
export const OUTBOX_MAX = 500;
/** Storage key for the persistent outbox (browser.storage.local). */
export const OUTBOX_KEY = "sync-outbox";
/** Storage key for the persisted peer identity (browser.storage.local). */
export const PROFILE_ID_KEY = "sync-profile-id";
/** Storage key for sync status metadata (browser.storage.local). */
export const SYNC_STATUS_KEY = "sync-status";
/** Missed pong past this delay (ms) flips the state machine to `offline`. */
export const PONG_TIMEOUT_MS = 10_000;
/** Correlated op timeout (ms): a pending op older than this is a NACK. */
export const OP_TIMEOUT_MS = 15_000;

/** Whole-record change op, naively LWW (F6 replaces with Automerge deltas). */
export interface ChangeRecord {
  op: "create" | "update" | "delete";
  id: string;
  /** Full record for create/update; forward unknown optional fields untouched. */
  record?: StashRecord;
  updatedAt: number;
  /** Writer identity: the extension's persisted profileId. */
  origin: string;
}

/** Seed payload: one-way full-library snapshot, idempotent by id (spec §11.3). */
export interface SeedPayload {
  records: StashRecord[];
  origin: string;
}

export type SyncState = "disconnected" | "hello_sent" | "paired" | "refused_version" | "offline";

export interface SyncStatusMeta {
  state: SyncState;
  daemonId?: string;
  daemonName?: string;
  /** ms epoch of the last healthy pong/traffic from the daemon. */
  lastSeenAt?: number;
  protocolVersion?: string;
  /** Set when pairing was refused due to an incompatible protocol version. */
  refused?: { ours: string; theirs: string };
}

/**
 * Evaluate a semver range expression against a version. Supports the
 * space-separated comparator subset the F1 range contract uses
 * (">=1.0.0 <2.0.0"), plus bare versions treated as exact matches.
 */
export function satisfiesRange(version: string, range: string): boolean {
  const parse = (v: string): [number, number, number] => {
    const [maj = "", min = "0", pat = "0"] = v.split(".");
    const n = (s: string) => {
      const parsed = Number.parseInt(s, 10);
      return Number.isNaN(parsed) ? 0 : parsed;
    };
    return [n(maj), n(min), n(pat)];
  };
  const cmp = (a: [number, number, number], b: [number, number, number]) => {
    for (let i = 0; i < 3; i++) {
      if (a[i] !== b[i]) return a[i] < b[i] ? -1 : 1;
    }
    return 0;
  };
  const v = parse(version);
  const comparators = range.trim().split(/\s+/).filter(Boolean);
  if (comparators.length === 0) return false;
  return comparators.every((c) => {
    const op = c.match(/^(>=|<=|>|<|=|\^|~)?/)?.[1];
    const target = parse(c.replace(/^(>=|<=|>|<|=|\^|~)/, ""));
    if (op === "^") {
      return cmp(v, target) >= 0 && v[0] === target[0];
    }
    if (op === "~") {
      return cmp(v, target) >= 0 && v[0] === target[0] && v[1] === target[1];
    }
    switch (op) {
      case ">=":
        return cmp(v, target) >= 0;
      case "<=":
        return cmp(v, target) <= 0;
      case ">":
        return cmp(v, target) > 0;
      case "<":
        return cmp(v, target) < 0;
      case "=":
      case undefined:
        return cmp(v, target) === 0;
      default:
        return false;
    }
  });
}

/**
 * Both halves of the F1 range negotiation: our build must accept the
 * daemon's protocolVersion, and the daemon must accept ours.
 */
export function versionCompatible(
  ours: string,
  ourRange: string,
  theirs: string,
  theirRange: string,
): boolean {
  return satisfiesRange(theirs, ourRange) && satisfiesRange(ours, theirRange);
}

export const OUR_PROTOCOL_VERSION = PROTOCOL_VERSION;
export const OUR_SUPPORTED_RANGE = SUPPORTED_RANGE;
