/**
 * Wire conformance fixtures shared with the daemon's Go suite
 * (daemon/internal/natmsg/sync_test.go, TestSyncFixtures): one NDJSON frame
 * per file under daemon/internal/natmsg/testdata/.
 *
 * The shared fixtures use human-readable correlationIds ("ping-1",
 * "seed-1", "chg-1") outside the ext|daemon sender-mint convention that
 * `parseFrame` enforces — the Go codec's DecodeFrame and the extension's
 * live transport path (native-transport safeDecode) both treat
 * correlationId as an opaque string echoed verbatim, so fixtures are
 * envelope-decoded the same way here and their payloads run through the
 * extension's per-type schemas. Fixtures whose ids do follow the mint
 * convention (sync_push, sync_push_ack) additionally go through
 * `parseFrame` itself.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { OP_PAYLOAD, OP_RESULT_PAYLOAD, parseFrame } from "../transport/frames";
import { SYNC_TOOLS, type ChangeRecord, type SeedPayload } from "./protocol";
import type { StashRecord } from "../stash-store";

const FIXTURE_DIR = join(import.meta.dirname, "../../../../daemon/internal/natmsg/testdata");

interface FixtureEnvelope {
  type: string;
  correlationId: string;
  payload: unknown;
}

function readFixture(name: string): FixtureEnvelope {
  const raw = readFileSync(join(FIXTURE_DIR, name), "utf8");
  return JSON.parse(raw) as FixtureEnvelope;
}

describe("sync wire fixtures (shared with daemon/internal/natmsg)", () => {
  it("sync_ping: op frame carrying stash_sync_ping", () => {
    const env = readFixture("sync_ping.json");
    expect(env.type).toBe("op");
    expect(env.correlationId).toBe("ping-1");
    const payload = OP_PAYLOAD.parse(env.payload);
    expect(payload.tool).toBe(SYNC_TOOLS.ping);
    expect(payload.args).toEqual({});
  });

  it("sync_seed: SeedPayload; unknown record keys survive the parse", () => {
    const env = readFixture("sync_seed.json");
    expect(env.type).toBe("op");
    const payload = OP_PAYLOAD.parse(env.payload);
    expect(payload.tool).toBe(SYNC_TOOLS.seed);
    const seed = payload.args as SeedPayload;
    expect(seed.origin).toBe("profile-1");
    expect(seed.records).toHaveLength(1);
    // Unknown optional fields round-trip untouched (the daemon keeps them in
    // extra_json); the opaque args parse must not strip them either.
    const record = seed.records[0] as StashRecord & Record<string, unknown>;
    expect(record.id).toBe("s1");
    expect(record["extraField"]).toBe("preserved");
  });

  it("sync_change: ChangeRecord args for an update", () => {
    const env = readFixture("sync_change.json");
    expect(env.type).toBe("op");
    const payload = OP_PAYLOAD.parse(env.payload);
    expect(payload.tool).toBe(SYNC_TOOLS.change);
    const change = payload.args as ChangeRecord;
    expect(change.op).toBe("update");
    expect(change.id).toBe("s1");
    expect(change.updatedAt).toBe(1700000000100);
    expect(change.origin).toBe("profile-1");
    expect(change.record?.id).toBe("s1");
  });

  it("sync_push: daemon-origin push with a minted correlationId", () => {
    const frame = parseFrame(readFixture("sync_push.json"));
    expect(frame.type).toBe("op");
    expect(frame.correlationId).toMatch(/^(ext|daemon)-[A-Za-z0-9]{8,}$/);
    const payload = OP_PAYLOAD.parse(frame.payload);
    expect(payload.tool).toBe(SYNC_TOOLS.change);
    const change = payload.args as ChangeRecord;
    expect(change.origin).toBe("daemon");
    expect(change.op).toBe("update");
    expect(change.id).toBe("push1");
  });

  it("sync_push_ack: opResult correlated on result.ack, not correlationId", () => {
    const frame = parseFrame(readFixture("sync_push_ack.json"));
    expect(frame.type).toBe("opResult");
    // The ack's own correlationId is freshly minted, never the push's id.
    expect(frame.correlationId).toMatch(/^(ext|daemon)-[A-Za-z0-9]{8,}$/);
    expect(frame.correlationId).not.toBe("daemon-pushfix1");
    const payload = OP_RESULT_PAYLOAD.parse(frame.payload);
    const result = payload.result as { ack: string };
    expect(result.ack).toBe("daemon-pushfix1");
  });
});
