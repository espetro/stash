import { describe, expect, it } from "vitest";
import {
  PROTOCOL_VERSION,
  SUPPORTED_RANGE,
  decodeFrames,
  encodeFrame,
  makeErrorFrame,
  makeFrame,
  mintCorrelationId,
  parseFrame,
} from "./frames";

const HELLO = {
  type: "hello",
  correlationId: "ext-abc12345",
  payload: {
    protocolVersion: "1.0.0",
    supportedRange: ">=1.0.0 <2.0.0",
    extension: { name: "Stash", version: "0.9.0" },
  },
} as const;

const SERVER_CARD = {
  type: "serverCard",
  correlationId: "ext-abc12345", // echoed verbatim
  payload: {
    protocolVersion: "1.0.0",
    supportedRange: ">=1.0.0 <2.0.0",
    server: { name: "stashd", version: "0.1.0" },
  },
} as const;

describe("protocol constants", () => {
  it("pins protocolVersion and supported range", () => {
    expect(PROTOCOL_VERSION).toBe("1.0.0");
    expect(SUPPORTED_RANGE).toBe(">=1.0.0 <2.0.0");
  });
});

describe("one envelope, both directions", () => {
  it("parses hello (ext→daemon) and serverCard (daemon→ext) with the same envelope", () => {
    expect(parseFrame(HELLO).type).toBe("hello");
    expect(parseFrame(SERVER_CARD).type).toBe("serverCard");
  });
  it("rejects envelopes with unknown type", () => {
    expect(() => parseFrame({ ...HELLO, type: "bogus" })).toThrow();
  });
  it("rejects bad correlation ids (sender origin convention)", () => {
    expect(() => parseFrame({ ...HELLO, correlationId: "abc123" })).toThrow();
    expect(() => parseFrame({ ...HELLO, correlationId: "other-abc12345" })).toThrow();
  });
  it("rejects non-semver protocolVersion in hello payload", () => {
    expect(() =>
      parseFrame({
        ...HELLO,
        payload: { ...HELLO.payload, protocolVersion: "one" },
      }),
    ).toThrow();
  });
  it("does not validate tool names (frozen list passes opaquely)", () => {
    const frame = makeFrame("op", "ext-t00000001", {
      tool: "stash_snapshot_tabs",
      args: {},
    });
    expect(parseFrame(JSON.parse(encodeFrame(frame))).payload).toEqual(frame.payload);
  });
});

describe("one error shape", () => {
  it("code + message + optional details", () => {
    const f = makeErrorFrame("daemon-err00001", "OP_FAILED", "boom", { retry: true });
    expect(parseFrame(f)).toEqual(f);
    expect(
      (parseFrame(makeErrorFrame("daemon-err00001", "C", "m")).payload as { details?: unknown })
        .details,
    ).toBeUndefined();
  });
  it("rejects error payloads without code", () => {
    expect(() =>
      parseFrame({ type: "error", correlationId: "ext-y0000001", payload: { message: "no code" } }),
    ).toThrow();
  });
});

describe("correlation ids", () => {
  it("mints ext/daemon prefixed ids matching the schema", () => {
    expect(mintCorrelationId("ext")).toMatch(/^ext-[A-Za-z0-9]{8,}$/);
    expect(mintCorrelationId("daemon")).toMatch(/^daemon-[A-Za-z0-9]{8,}$/);
  });
});

describe("newline-delimited framing", () => {
  it("round-trips and keeps partial tail as rest", () => {
    const wire = encodeFrame(HELLO) + encodeFrame(SERVER_CARD) + '{"partial"';
    const { frames, rest } = decodeFrames(wire);
    expect(frames.map((f) => f.type)).toEqual(["hello", "serverCard"]);
    expect(rest).toBe('{"partial"');
  });
  it("echoes correlationId verbatim in parsed responses", () => {
    expect(parseFrame(SERVER_CARD).correlationId).toBe(HELLO.correlationId);
  });
  it("rejects malformed payload in a well-formed envelope", () => {
    const bad = {
      type: "hello",
      correlationId: "ext-z0000001",
      payload: { protocolVersion: "1.0.0" }, // missing fields
    };
    expect(() => decodeFrames(JSON.stringify(bad) + "\n")).toThrow();
  });
});
