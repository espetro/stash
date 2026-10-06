/**
 * Type-level contract tests for the `/stashes` ↔ extension bridge (PR E).
 *
 * These never run any logic: they pin the wire shapes at the type level
 * so contract drift between the content script, the background relay,
 * and the viewer-side `local-bridge.ts` fails `vitest`/`tscheck` instead
 * of surfacing as a silent protocol mismatch at runtime.
 */
import { describe, expectTypeOf, it } from "vitest";
import type {
  ViewerRequest,
  ViewerRequestType,
  ViewerResponse,
} from "../entrypoints/stashes-bridge.content";
import type { OpenLibraryHandoff } from "../lib/open-library";
import type { StashExport, StashExportRecord } from "@stash/shared/agent-export";

describe("viewer bridge wire contract (type-level)", () => {
  it("covers exactly the four v1 request types", () => {
    expectTypeOf<ViewerRequestType>().toEqualTypeOf<
      "stash:viewer:request" | "stash:viewer:presence" | "stash:viewer:open" | "stash:viewer:handoff"
    >();
  });

  it("requests are version-1 and requestId-correlated", () => {
    expectTypeOf<ViewerRequest["version"]>().toEqualTypeOf<1>();
    expectTypeOf<ViewerRequest["requestId"]>().toEqualTypeOf<string>();
    expectTypeOf<ViewerRequest["payload"]>().toEqualTypeOf<unknown | undefined>();
  });

  it("responses mirror the request envelope with ok/error status", () => {
    expectTypeOf<ViewerResponse["type"]>().toEqualTypeOf<"stash:viewer:response">();
    expectTypeOf<ViewerResponse["version"]>().toEqualTypeOf<1>();
    expectTypeOf<ViewerResponse["requestId"]>().toEqualTypeOf<string>();
    expectTypeOf<ViewerResponse["status"]>().toEqualTypeOf<"ok" | "error">();
    expectTypeOf<ViewerResponse["error"]>().toEqualTypeOf<string | undefined>();
  });

  it("the handoff payload parked for the Library page matches StashExport records", () => {
    expectTypeOf<OpenLibraryHandoff["records"]>().toEqualTypeOf<StashExportRecord[]>();
    expectTypeOf<OpenLibraryHandoff["source"]>().toEqualTypeOf<string>();
    // StashExport.stashes is the same record type the handoff accepts.
    expectTypeOf<StashExport["stashes"]>().toEqualTypeOf<StashExportRecord[]>();
  });
});
