import * as Automerge from "@automerge/automerge";
import { readFileSync, writeFileSync } from "node:fs";

// Mirror of apps/extension/lib/stash-store.ts StashRecord (trimmed for spike).
export interface StashItem {
  url: string;
  title: string;
}
export interface StashRecord {
  id: string;
  title: string;
  tags: string[];
  note: string;
  items: StashItem[];
  createdAt: number;
  updatedAt: number;
}
export interface StashDoc {
  records: StashRecord[];
}

export function load(path: string): Automerge.Doc<StashDoc> {
  return Automerge.load<StashDoc>(new Uint8Array(readFileSync(path)));
}
export function save(doc: Automerge.Doc<StashDoc>, path: string): void {
  writeFileSync(path, Buffer.from(Automerge.save(doc)));
}

// Deterministic materialization: sort keys, stable record order as stored.
export function materialize(doc: Automerge.Doc<StashDoc>): string {
  const norm = (doc.records ?? []).map((r) => ({
    id: r.id,
    title: r.title,
    tags: [...(r.tags ?? [])],
    note: r.note,
    items: (r.items ?? []).map((i) => ({ url: i.url, title: i.title })),
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  }));
  return JSON.stringify(norm, null, 2);
}
