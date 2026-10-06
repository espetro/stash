import * as Automerge from "@automerge/automerge";
import { load, save, materialize, type StashDoc } from "./lib";

// Step 3: TS loads Go's output, deletes record 2 (rec-b), adds record 4 (rec-d), serializes.
const inp = process.argv[2] ?? "../data/state2.bin";
const out = process.argv[3] ?? "../data/state3.bin";

let doc = load(inp);
console.log("step3: loaded", inp, "records:", doc.records.map((r) => r.id).join(","));

doc = Automerge.change(doc, (d) => {
  const idx = d.records.findIndex((r) => r.id === "rec-b");
  if (idx >= 0) d.records.deleteAt(idx);
  d.records.push({
    id: "rec-d",
    title: "Weekend links",
    tags: ["personal"],
    note: "",
    items: [{ url: "https://d.example/z", title: "Recipe Z" }],
    createdAt: 4000,
    updatedAt: 4000,
  });
});

save(doc, out);
console.log("step3: wrote", out, "records:", doc.records.map((r) => r.id).join(","));
console.log("--- step3 materialized ---");
console.log(materialize(doc));
