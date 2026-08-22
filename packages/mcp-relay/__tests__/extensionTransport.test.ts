/**
 * Tests for the `STASH_RELAY_PORT` env factory and the explicit error
 * path when the extension endpoint isn't available.
 */
import { describe, expect, it } from "vitest";
import {
  extensionTransportFromEnv,
  ExtensionTransport,
  NeverConnectsTransport,
} from "../src/extensionTransport";

describe("extensionTransportFromEnv", () => {
  it("returns a NeverConnectsTransport when STASH_RELAY_PORT is missing", async () => {
    const tx = extensionTransportFromEnv({});
    expect(tx).toBeInstanceOf(NeverConnectsTransport);
    await expect(tx.start()).rejects.toThrow(/STASH_RELAY_PORT/);
  });

  it("returns a NeverConnectsTransport when STASH_RELAY_PORT is invalid", async () => {
    const tx = extensionTransportFromEnv({ STASH_RELAY_PORT: "not-a-number" });
    expect(tx).toBeInstanceOf(NeverConnectsTransport);
    await expect(tx.start()).rejects.toThrow(/STASH_RELAY_PORT/);
  });

  it("returns a real ExtensionTransport for a numeric port", () => {
    const tx = extensionTransportFromEnv({ STASH_RELAY_PORT: "4317" });
    expect(tx).toBeInstanceOf(ExtensionTransport);
    expect((tx as ExtensionTransport).port).toBe(4317);
    expect((tx as ExtensionTransport).host).toBe("127.0.0.1");
  });
});
