import { load, materialize } from "./lib";

const inp = process.argv[2];
if (!inp) throw new Error("usage: materialize.ts <file>");
const doc = load(inp);
console.log(materialize(doc));
