/**
 * Persisted peer identity and materialization guard (F5.W1/W2/W3).
 *
 * `profileId` is generated once per browser profile and persisted under
 * PROFILE_ID_KEY. Losing the key means a new peer (per the F5/F6 contract);
 * it is NEVER rotated on re-pair. This becomes F6's CRDT peer identity.
 */
import { StorageItem } from "webext-storage";
import { PROFILE_ID_KEY } from "./protocol";

const profileIdItem = new StorageItem<string>(PROFILE_ID_KEY, { area: "local" });

function randomId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `pid-${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
}

/** Read the persisted profileId, generating and persisting one if absent. */
export async function getProfileId(): Promise<string> {
  const existing = await profileIdItem.get().catch(() => undefined);
  if (existing) return existing;
  const id = randomId();
  await profileIdItem.set(id);
  return id;
}

/** True only for tests / forced re-identity; treat loss of the key as new peer. */
export async function resetProfileId(): Promise<void> {
  await profileIdItem.remove();
}

/**
 * Re-entrancy flag held while a daemon materialization is mid-write, so the
 * stash-store write path can distinguish daemon-origin traffic from user
 * writes even when they land in the same tick (single serialized writer).
 */
export const materializationGuard = { active: false };
