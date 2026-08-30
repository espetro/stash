/**
 * Daemon MCP steps (plan W2): the spawned stash-daemon binary as an
 * MCP tool surface over stdio, driven by a headless client
 * (helpers/mcp-daemon.ts). Assertions mirror the extension steps in
 * agent-flow-steps.ts against the canonical EXTENSION_SEED so parity
 * between the two surfaces is copyable.
 */

import { step } from "../lib/step-registry";
import { getActiveState } from "../lib/scenario-state";
import {
  connectDaemonRpc,
  EXPECTED_TOOLS,
  seedDaemonLibrary,
  type DaemonRpc,
} from "../helpers/mcp-daemon";
import { EXTENSION_SEED } from "../helpers/mcp-seed";

function setDaemon<T>(key: string, value: T): void {
  getActiveState().variables[key] = value;
}

function getDaemon<T>(key: string): T {
  const value = getActiveState().variables[key];
  if (value === undefined) {
    throw new Error(`No "${key}" in scenario state; connect to the daemon first.`);
  }
  return value as T;
}

function getRpc(): DaemonRpc {
  return getDaemon<DaemonRpc>("daemonRpc");
}

step("The stash daemon is running in serve mode", async () => {
  const rpc = await connectDaemonRpc();
  setDaemon("daemonRpc", rpc);
});

step("The agent connects to the daemon stdio MCP surface", async () => {
  // Explicit connect step: the launch step above already initializes the
  // handshake, this documents intent and asserts liveness via ping-less
  // tools/list in later steps.
  const rpc = getRpc();
  await rpc.listTools();
});

step("The MCP tool list should contain all <count> daemon stash tools", async (countStr) => {
  const tools = await getRpc().listTools();
  const expected = parseInt(countStr, 10);
  if (tools.length !== expected) {
    throw new Error(`Expected ${expected} tools, got ${tools.length}: ${tools.join(", ")}`);
  }
  for (const name of EXPECTED_TOOLS) {
    if (!tools.includes(name)) {
      throw new Error(`Tool "${name}" missing from daemon tools/list.`);
    }
  }
});

step("The MCP daemon tool set should match the frozen 8-tool registry", async () => {
  const tools = await getRpc().listTools();
  const sorted = [...tools].sort();
  const expected = [...EXPECTED_TOOLS].sort();
  if (JSON.stringify(sorted) !== JSON.stringify(expected)) {
    throw new Error(`Tool registry drifted. Got: ${tools.join(", ")}`);
  }
});

step("stash_snapshot_tabs on the daemon should report no_browser_attached", async () => {
  const result = await getRpc().callToolRaw("stash_snapshot_tabs");
  if (!result.isError) {
    throw new Error("stash_snapshot_tabs unexpectedly succeeded without a paired browser.");
  }
  const err = result.error as { code?: string } | undefined;
  if (err?.code !== "no_browser_attached") {
    throw new Error(`Expected error code "no_browser_attached", got ${JSON.stringify(err)}`);
  }
});

step("The agent seeds the daemon library with the canonical seed", async () => {
  const created = await seedDaemonLibrary(getRpc());
  if (created.length !== EXTENSION_SEED.length) {
    throw new Error(`Expected ${EXTENSION_SEED.length} seeded stashes, got ${created.length}.`);
  }
  for (const [i, stash] of created.entries()) {
    if ((stash.items?.length ?? 0) !== EXTENSION_SEED[i].items.length) {
      throw new Error(
        `Seed "${stash.title}" has ${stash.items?.length} items, expected ${EXTENSION_SEED[i].items.length}.`,
      );
    }
  }
  setDaemon(
    "daemonSeededIds",
    created.map((s) => s.id),
  );
});

step("stash_list on the daemon should return the seeded stashes", async () => {
  const result = (await getRpc().callTool("stash_list")) as {
    stashes?: { id: string }[];
  };
  const seeded = getDaemon<string[]>("daemonSeededIds");
  const listed = result.stashes ?? [];
  for (const id of seeded) {
    if (!listed.some((s) => s.id === id)) {
      throw new Error(`Seeded stash ${id} missing from daemon stash_list.`);
    }
  }
});

step(
  "stash_get on the daemon should return a seeded stash with <count> items and title <title>",
  async (countStr, title) => {
    const seeded = getDaemon<string[]>("daemonSeededIds");
    const expected = parseInt(countStr, 10);
    let found: { items?: unknown[]; title?: string } | null = null;
    for (const id of seeded) {
      const stash = (await getRpc().callTool("stash_get", { id })) as {
        items?: unknown[];
        title?: string;
      };
      if (stash.title === title) {
        found = stash;
        break;
      }
    }
    if (!found) {
      throw new Error(`No seeded stash with title "${title}".`);
    }
    if (found.items?.length !== expected) {
      throw new Error(
        `stash_get "${title}": expected ${expected} items, got ${found.items?.length}.`,
      );
    }
  },
);

step(
  "stash_search on the daemon for <query> should return the matching seeded stash",
  async (query) => {
    const result = (await getRpc().callTool("stash_search", { query })) as {
      stashes?: { id: string; title?: string }[];
    };
    const seeded = getDaemon<string[]>("daemonSeededIds");
    const match = (result.stashes ?? []).find((s) => seeded.includes(s.id));
    if (!match) {
      throw new Error(`stash_search "${query}" returned no seeded stash.`);
    }
    if (!match.title?.toLowerCase().includes(query.toLowerCase())) {
      throw new Error(`stash_search "${query}" matched "${match.title}".`);
    }
  },
);

step("stash_update on the daemon should change the stash title", async () => {
  const rpc = getRpc();
  const seeded = getDaemon<string[]>("daemonSeededIds");
  const target = seeded[0];
  const newTitle = "Daemon-updated title";
  const updated = (await rpc.callTool("stash_update", { id: target, title: newTitle })) as {
    title?: string;
  };
  if (updated.title !== newTitle) {
    throw new Error(`stash_update returned title "${updated.title}".`);
  }
  const reread = (await rpc.callTool("stash_get", { id: target })) as { title?: string };
  if (reread.title !== newTitle) {
    throw new Error(`stash_get after update returned "${reread.title}".`);
  }
});

step("stash_delete on the daemon should remove the stash", async () => {
  const rpc = getRpc();
  const seeded = getDaemon<string[]>("daemonSeededIds");
  const target = seeded[seeded.length - 1];
  const result = (await rpc.callTool("stash_delete", { id: target })) as { deleted?: boolean };
  if (!result.deleted) {
    throw new Error("stash_delete did not report deleted: true.");
  }
  const err = await rpc.callToolRaw("stash_get", { id: target });
  if (err.error?.code !== "not_found") {
    throw new Error(`stash_get after delete: expected not_found, got ${JSON.stringify(err)}`);
  }
  setDaemon(
    "daemonSeededIds",
    seeded.filter((id) => id !== target),
  );
});

step("stash_get on the daemon with an unknown id should return not_found", async () => {
  const err = await getRpc().callToolRaw("stash_get", { id: "does-not-exist" });
  if (err.error?.code !== "not_found") {
    throw new Error(`Expected not_found, got ${JSON.stringify(err)}`);
  }
});

step("stash_update on the daemon with an unknown id should return not_found", async () => {
  const err = await getRpc().callToolRaw("stash_update", { id: "does-not-exist", title: "x" });
  if (err.error?.code !== "not_found") {
    throw new Error(`Expected not_found, got ${JSON.stringify(err)}`);
  }
});

step("stash_delete on the daemon with an unknown id should return not_found", async () => {
  const err = await getRpc().callToolRaw("stash_delete", { id: "does-not-exist" });
  if (err.error?.code !== "not_found") {
    throw new Error(`Expected not_found, got ${JSON.stringify(err)}`);
  }
});

step(
  "stash_decode on the daemon with a malformed payload should return a decode error",
  async () => {
    const err = await getRpc().callToolRaw("stash_decode", { payload: "not-a-payload!!!" });
    if (
      !err.isError ||
      (err.error?.code !== "decode_error" && err.error?.code !== "invalid_params")
    ) {
      throw new Error(`Expected decode_error/invalid_params, got ${JSON.stringify(err)}`);
    }
  },
);
