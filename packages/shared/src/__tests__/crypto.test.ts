import { describe, it, expect } from "vitest";
import { generateShareKey, encryptForRelay, decryptFromRelay } from "../crypto";

describe("generateShareKey", () => {
  it("returns base64url of 16 random bytes", () => {
    const key = generateShareKey();
    expect(key).toMatch(/^[A-Za-z0-9_-]{22}$/);
  });

  it("is unique across calls", () => {
    const keys = new Set(Array.from({ length: 50 }, () => generateShareKey()));
    expect(keys.size).toBe(50);
  });
});

describe("encryptForRelay / decryptFromRelay", () => {
  it("round-trips a payload string", async () => {
    const key = generateShareKey();
    const payload = "C" + "aGVsbG8";
    const ct = await encryptForRelay(payload, key);
    expect(ct).not.toContain(payload);
    expect(await decryptFromRelay(ct, key)).toBe(payload);
  });

  it("produces different ciphertexts for the same payload (random IV)", async () => {
    const key = generateShareKey();
    const a = await encryptForRelay("Rpayload", key);
    const b = await encryptForRelay("Rpayload", key);
    expect(a).not.toBe(b);
  });

  it("fails authentication when a bit is flipped (tamper)", async () => {
    const key = generateShareKey();
    const ct = await encryptForRelay("Rpayload", key);
    const last = ct[ct.length - 1];
    const flipped = last === "A" ? "B" : "A";
    const tampered = ct.slice(0, -1) + flipped;
    await expect(decryptFromRelay(tampered, key)).rejects.toThrow(/Decryption failed/);
  });

  it("fails with the wrong key", async () => {
    const ct = await encryptForRelay("Rpayload", generateShareKey());
    await expect(decryptFromRelay(ct, generateShareKey())).rejects.toThrow();
  });

  it("rejects a malformed key", async () => {
    await expect(encryptForRelay("Rpayload", "short!")).rejects.toThrow(/Invalid share key/);
  });

  it("rejects truncated ciphertext", async () => {
    const key = generateShareKey();
    const ct = await encryptForRelay("Rpayload", key);
    await expect(decryptFromRelay(ct.slice(0, 5) + "AA", key)).rejects.toThrow(/too short/);
  });
});
