import * as Automerge from "@automerge/automerge";
import { save, type StashDoc } from "./lib";

// Step 1: TS creates a doc, adds 2 records, serializes.
let doc = Automerge.init<StashDoc>();
doc = Automerge.change(doc, (d) => {
  d.records = [
    {
      id: "rec-a",
      title: "Morning reading",
      tags: ["news"],
      note: "",
      items: [{ url: "https://a.example/1", title: "Article 1" }],
      createdAt: 1000,
      updatedAt: 1000,
    },
    {
      id: "rec-b",
      title: "Work tabs",
      tags: ["work", "wip"],
      note: "sprint 42",
      items: [
        { url: "https://b.example/x", title: "Ticket X" },
        { url: "https://b.example/y", title: "Ticket Y" },
      ],
      createdAt: 2000,
      updatedAt: 2000,
    },
  ];
});

const out = process.argv[2] ?? "../data/state1.bin";
save(doc, out);
console.log("step1: wrote", out, "records:", doc.records.map((r) => r.id).join(","));
