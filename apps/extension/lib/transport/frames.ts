/**
 * Native-messaging frame schema (F1.W4). THE shared contract.
 *
 * Consumers (cite this plan, never fork): F2 daemon, F4 snapshot_tabs,
 * F5 sync client, F6 CRDT deltas.
 *
 * Rules encoded here:
 * 1. ONE envelope in both directions (reverse channel included):
 *    { type, correlationId, payload }.
 * 2. ONE error shape: { code, message, details? }.
 * 3. Correlation ids are minted by the SENDER and echoed verbatim in the
 *    response. Format: `${origin}-${ulid/uuid}`, origin in {"ext","daemon"}.
 *    Uniqueness scope: per sender, per process lifetime.
 * 4. protocolVersion + supportedRange carried in hello/serverCard.
 *
 * Tool names (the frozen 8 in lib/mcp/server.ts) pass through opaquely in
 * payloads; this module never enumerates or validates them.
 */

import { z } from "zod";

export const PROTOCOL_VERSION = "1.0.0";
export const SUPPORTED_RANGE = ">=1.0.0 <2.0.0";

/** Message type discriminators for the single envelope. */
export const FRAME_TYPES = ["hello", "serverCard", "op", "opResult", "error"] as const;

export const CORRELATION_ID = z
  .string()
  .regex(
    /^(ext|daemon)-[A-Za-z0-9]{8,}$/,
    "correlationId must be `<origin>-<ulid/uuid>` with origin ext|daemon",
  );

export const PROTOCOL_VERSION_STRING = z
  .string()
  .regex(/^\d+\.\d+\.\d+$/, "protocolVersion must be semver");

export const SUPPORTED_RANGE_STRING = z
  .string()
  .min(3, "supportedRange must be a non-empty semver range expression");

/** The ONE error shape. */
export const ERROR_PAYLOAD = z.object({
  code: z.string().min(1),
  message: z.string(),
  details: z.unknown().optional(),
});

/** hello: extension → daemon, opening the handshake. */
export const HELLO_PAYLOAD = z.object({
  protocolVersion: PROTOCOL_VERSION_STRING,
  supportedRange: SUPPORTED_RANGE_STRING,
  extension: z.object({
    name: z.string().min(1),
    version: z.string(),
  }),
});

/** serverCard: daemon → extension, answering hello. */
export const SERVER_CARD_PAYLOAD = z.object({
  protocolVersion: PROTOCOL_VERSION_STRING,
  supportedRange: SUPPORTED_RANGE_STRING,
  server: z.object({
    name: z.string().min(1),
    version: z.string(),
  }),
});

/** op: extension → daemon tool invocation; tool name passes through opaquely. */
export const OP_PAYLOAD = z.object({
  tool: z.string().min(1),
  args: z.unknown(),
});

/** opResult: daemon → extension success result. */
export const OP_RESULT_PAYLOAD = z.object({
  result: z.unknown(),
});

const payloadSchemas = {
  hello: HELLO_PAYLOAD,
  serverCard: SERVER_CARD_PAYLOAD,
  op: OP_PAYLOAD,
  opResult: OP_RESULT_PAYLOAD,
  error: ERROR_PAYLOAD,
} as const;

export type FrameType = (typeof FRAME_TYPES)[number];
export type FramePayload<T extends FrameType = FrameType> = z.infer<(typeof payloadSchemas)[T]>;

/** The ONE envelope, both directions. */
export interface Frame<T extends FrameType = FrameType> {
  type: T;
  correlationId: string;
  payload: FramePayload<T>;
}

export const FRAME = z.object({
  type: z.enum(FRAME_TYPES),
  correlationId: CORRELATION_ID,
  payload: z.unknown(),
}) as z.ZodType<Frame>;

/**
 * Parse and fully validate a frame: envelope plus a payload schema matched
 * by the type discriminator.
 */
export function parseFrame(raw: unknown): Frame {
  const envelope = FRAME.parse(raw);
  const payload = payloadSchemas[envelope.type].parse(envelope.payload);
  return { ...envelope, payload } as Frame;
}

/** Mint a correlation id per convention (sender mints, echo verbatim). */
export function mintCorrelationId(
  origin: "ext" | "daemon",
  random: () => string = () => Math.random().toString(36).slice(2, 10),
): string {
  return `${origin}-${random()}`;
}

/** Convenience constructors. */
export function makeFrame<T extends FrameType>(
  type: T,
  correlationId: string,
  payload: FramePayload<T>,
): Frame<T> {
  return { type, correlationId, payload };
}

export function makeErrorFrame(
  correlationId: string,
  code: string,
  message: string,
  details?: unknown,
): Frame<"error"> {
  return makeFrame("error", correlationId, {
    code,
    message,
    ...(details !== undefined ? { details } : {}),
  });
}

/** Newline-delimited JSON framing (native messaging safe wrapper handles length prefixing upstream). */
export function encodeFrame(frame: Frame): string {
  return `${JSON.stringify(frame)}\n`;
}

export function decodeFrames(chunk: string): { frames: Frame[]; rest: string } {
  const lines = chunk.split("\n");
  const rest = lines.pop() ?? "";
  const frames: Frame[] = [];
  for (const line of lines) {
    if (line.trim().length === 0) continue;
    frames.push(parseFrame(JSON.parse(line)));
  }
  return { frames, rest };
}
