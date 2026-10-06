/**
 * Persistent outbox of local writes bound for the daemon (F5.W2).
 *
 * Appended after every successful user write to `stash-store`; drained in
 * order while paired. Materialized (daemon-origin) writes never enter this
 * path — `stash-store` guards them with `suppressOutbox`. Survives MV3
 * worker restarts via browser.storage.local; overflow drops the oldest
 * record with a logged warning, never silently.
 */
import { StorageItem } from "webext-storage";
import type { StashRecord } from "../stash-store";
import { OUTBOX_KEY, OUTBOX_MAX, type ChangeRecord } from "./protocol";

const outboxItem = new StorageItem<ChangeRecord[]>(OUTBOX_KEY, {
  area: "local",
  // NOTE: no `defaultValue` — StorageItem.get() returns the default object
  // itself (not a copy), and callers mutate the array; a shared default would
  // leak state across tests/worker lifecycles.
});

async function read(): Promise<ChangeRecord[]> {
  try {
    return (await outboxItem.get()) ?? [];
  } catch {
    return [];
  }
}

/** Append one change; oldest-dropped overflow with a loud warning. */
export async function enqueueChange(
  change: Omit<ChangeRecord, "origin"> & { origin: string },
): Promise<void> {
  const box = await read();
  box.push(change);
  if (box.length > OUTBOX_MAX) {
    const dropped = box.splice(0, box.length - OUTBOX_MAX);
    console.warn(
      `[sync] outbox overflow: dropped ${dropped.length} oldest change(s); daemon has been unreachable for a while. Run 'stash-daemon doctor'.`,
    );
  }
  await outboxItem.set(box);
}

/** User-write recorders, called by stash-store after the local write lands. */
export function recordCreate(record: StashRecord, origin: string): Promise<void> {
  return enqueueChange({
    op: "create",
    id: record.id,
    record,
    updatedAt: record.updatedAt,
    origin,
  });
}

export function recordUpdate(record: StashRecord, origin: string): Promise<void> {
  return enqueueChange({
    op: "update",
    id: record.id,
    record,
    updatedAt: record.updatedAt,
    origin,
  });
}

export function recordDelete(id: string, origin: string): Promise<void> {
  return enqueueChange({ op: "delete", id, updatedAt: Date.now(), origin });
}

export async function getOutbox(): Promise<ChangeRecord[]> {
  return read();
}

export function outboxSize(): Promise<number> {
  return read().then((b) => b.length);
}

/**
 * Drain: flush up to `count` records through `send` in order. A record is
 * removed only after its send resolved true; on failure (send threw or the
 * daemon NACKed) the record stays and draining stops — retried next tick.
 */
export async function drainOutbox(
  send: (change: ChangeRecord) => Promise<boolean>,
  count = Number.POSITIVE_INFINITY,
): Promise<{ sent: number; remaining: number }> {
  const box = await read();
  let sent = 0;
  while (sent < count && box.length > 0) {
    const change = box[0];
    let ok: boolean;
    try {
      ok = await send(change);
    } catch {
      ok = false;
    }
    if (!ok) break;
    box.shift();
    sent++;
    await outboxItem.set(box);
  }
  return { sent, remaining: box.length };
}
