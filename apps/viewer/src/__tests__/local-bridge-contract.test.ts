/**
 * Type-level contract test for the viewer side of the `/stashes` ↔
 * extension bridge (PR E). Mirrors the extension-side contract test in
 * `apps/extension/__tests__/viewer-wire-contract.test.ts`: the literal
 * request types and the response envelope must match on both ends or
 * the type checks fail here instead of drifting silently.
 */
import { describe, expectTypeOf, it } from "vitest";
import {
  BRIDGE_HANDOFF_TYPE,
  BRIDGE_OPEN_TYPE,
  BRIDGE_PRESENCE_TYPE,
  BRIDGE_PROTOCOL_VERSION,
  BRIDGE_REQUEST_TYPE,
  BRIDGE_RESPONSE_TYPE,
  type BridgeReply,
} from "@/lib/local-bridge";
import type { StashExport } from "@stash/shared/agent-export";

describe("viewer bridge wire contract (type-level)", () => {
  it("request type literals match the extension's v1 contract", () => {
    expectTypeOf<typeof BRIDGE_REQUEST_TYPE>().toEqualTypeOf<"stash:viewer:request">();
    expectTypeOf<typeof BRIDGE_PRESENCE_TYPE>().toEqualTypeOf<"stash:viewer:presence">();
    expectTypeOf<typeof BRIDGE_OPEN_TYPE>().toEqualTypeOf<"stash:viewer:open">();
    expectTypeOf<typeof BRIDGE_HANDOFF_TYPE>().toEqualTypeOf<"stash:viewer:handoff">();
    expectTypeOf<typeof BRIDGE_RESPONSE_TYPE>().toEqualTypeOf<"stash:viewer:response">();
    expectTypeOf<typeof BRIDGE_PROTOCOL_VERSION>().toEqualTypeOf<1>();
  });

  it("BridgeReply carries the ok/error + optional payload envelope", () => {
    expectTypeOf<BridgeReply["ok"]>().toEqualTypeOf<boolean>();
    expectTypeOf<BridgeReply["payload"]>().toEqualTypeOf<unknown | undefined>();
    expectTypeOf<BridgeReply["error"]>().toEqualTypeOf<string | undefined>();
  });

  it("handoff payloads are StashExport-shaped", () => {
    expectTypeOf<StashExport["source"]>().toEqualTypeOf<"extension" | "viewer-local">();
    expectTypeOf<StashExport["version"]>().toEqualTypeOf<1>();
  });
});
