import * as Automerge from "@automerge/automerge";
import { load, save, materialize, type StashDoc } from "./lib";

// delete-vs-edit conflict, TS side.
//   mode=edit  : load base, edit rec-a.title, save out
//   mode=merge : load fileA, merge fileB, materialize
const mode = process.argv[2];

if (mode === "edit") {
  const base = process.argv[3];
  const out = process.argv[4];
  let doc = load(base);
  doc = Automerge.change(doc, (d) => {
    const r = d.records.find((r) => r.id === "rec-a");
    if (r) r.title = "EDITED BY TS";
  });
  save(doc, out);
  console.log("conflict/edit: wrote", out);
} else if (mode === "merge") {
  const a = load(process.argv[3]);
  const b = load(process.argv[4]);
  const merged = Automerge.merge(a, b);
  console.log("conflict/merge (TS) records:", (merged.records ?? []).map((r) => r.id).join(",") || "(none)");
  console.log(materialize(merged));
} else {
  throw new Error("usage: conflict.ts edit|merge ...");
}
