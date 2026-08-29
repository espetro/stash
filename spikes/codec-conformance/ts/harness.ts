/**
 * Throwaway spike harness. Proves BIDIRECTIONAL SEMANTIC round-trip between the
 * real TS codec (packages/codec, brotli-wasm) and the Go port (../go, andybalholm/brotli).
 *
 * Isolated from the pnpm workspace on purpose (see ../../README.md); imports the
 * codec source by relative path rather than the "@stash/codec" specifier.
 */
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

import {
  decodeShareUrl,
  decodeEncodedPayload,
  encodeTabsToShareUrl,
  findMaxTabsWithinBudget,
  type BrotliFunctions,
  type TabInfo,
} from "../../../packages/codec/src/index.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const goDir = path.resolve(here, "../go");
const fixturesPath = path.resolve(
  here,
  "../../../packages/e2e/fixtures/payloads.json",
);

// brotli-wasm: CJS entry is the sync Node build (same trick as generate.ts).
const nodeRequire = createRequire(import.meta.url);
const nodeBrotli = nodeRequire("brotli-wasm") as BrotliFunctions;
const brotli: BrotliFunctions = {
  compress: (d, o) => nodeBrotli.compress(d, o),
  decompress: (d) => nodeBrotli.decompress(d),
};

// --- Go bridge --------------------------------------------------------------
function goRun(sub: string, stdin: string): string {
  return execFileSync("go", ["run", ".", sub], {
    cwd: goDir,
    input: stdin,
    encoding: "utf8",
    env: { ...process.env, GOFLAGS: "-mod=mod" },
    maxBuffer: 64 * 1024 * 1024,
  });
}
function goDecode(fragment: string) {
  const out = goRun("decode", fragment).trim();
  return JSON.parse(out) as {
    version: number;
    expiry: number;
    items: string[][];
    title?: string;
    tags: string[];
    note?: string;
  };
}
function goEncode(req: unknown): string {
  return goRun("encode", JSON.stringify(req)).trim();
}
function goBudget(req: unknown): number {
  return parseInt(goRun("budget", JSON.stringify(req)).trim(), 10);
}

// --- helpers --------------------------------------------------------------
type Fixture = {
  name: string;
  fragment: string;
  itemCount: number;
  items: { url: string; title: string }[];
  title?: string;
  tags?: string[];
  note?: string;
};

const eq = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const norm = (items: unknown[][]) =>
  items.map((it) => [it[0], it[1], ...(it[2] ? [it[2]] : [])]);

const fixtures: Fixture[] = JSON.parse(fs.readFileSync(fixturesPath, "utf8"));

type Row = {
  name: string;
  goDecodeVsTs: string;
  reverseGoEncodeTsDecode: string;
  note: string;
};
const rows: Row[] = [];

for (const fx of fixtures) {
  const bare = fx.fragment.replace(/^#[pq]=/, "");
  const row: Row = {
    name: fx.name,
    goDecodeVsTs: "-",
    reverseGoEncodeTsDecode: "-",
    note: "",
  };

  if (bare.length === 0) {
    row.goDecodeVsTs = "n/a";
    row.reverseGoEncodeTsDecode = "n/a";
    row.note = "empty fragment — codec refuses by design (both sides)";
    rows.push(row);
    continue;
  }

  // --- forward: Go decode vs TS decode of the same wire input ---
  let tsDec: Awaited<ReturnType<typeof decodeShareUrl>>;
  try {
    tsDec = await decodeShareUrl(fx.fragment, brotli);
  } catch (e) {
    row.goDecodeVsTs = "TS-THREW";
    row.note = String(e);
    rows.push(row);
    continue;
  }

  let goDec;
  try {
    goDec = goDecode(fx.fragment);
  } catch (e) {
    row.goDecodeVsTs = "GO-THREW";
    row.note = String(e).split("\n")[0];
    rows.push(row);
    continue;
  }

  const fwdItems = eq(norm(tsDec.items), norm(goDec.items));
  const fwdMeta =
    tsDec.version === goDec.version &&
    tsDec.expiry === goDec.expiry &&
    (tsDec.title ?? "") === (goDec.title ?? "") &&
    eq(tsDec.tags ?? [], goDec.tags ?? []) &&
    (tsDec.note ?? "") === (goDec.note ?? "");
  row.goDecodeVsTs = fwdItems && fwdMeta ? "PASS" : "FAIL";
  if (!fwdItems) row.note += "items differ; ";
  if (!fwdMeta) row.note += "meta differs; ";

  // --- reverse: rebuild tabs from TS decode, Go-encode, TS-decode, compare ---
  const tabs: TabInfo[] = tsDec.items.map((it) => ({
    url: it[0],
    title: it[1],
    kind: (it[2] as "note" | undefined) ?? undefined,
  }));
  const transport = fx.fragment.startsWith("#q=") ? "qr" : "url";
  try {
    const goEncoded = goEncode({
      tabs,
      expiryHours: 24,
      title: tsDec.title ?? "",
      tags: tsDec.tags ?? [],
      note: tsDec.note ?? "",
      transport,
    });
    const back = await decodeEncodedPayload(goEncoded, brotli);
    const revItems = eq(norm(back.items), norm(tsDec.items));
    const revMeta =
      back.version === tsDec.version &&
      (back.title ?? "") === (tsDec.title ?? "") &&
      eq(back.tags ?? [], tsDec.tags ?? []) &&
      (back.note ?? "") === (tsDec.note ?? "");
    row.reverseGoEncodeTsDecode = revItems && revMeta ? "PASS" : "FAIL";
    if (!revItems) row.note += "reverse items differ; ";
    if (!revMeta) row.note += "reverse meta differs; ";
  } catch (e) {
    row.reverseGoEncodeTsDecode = "THREW";
    row.note += String(e).split("\n")[0];
  }

  rows.push(row);
}

// --- v4/v5 coverage gap check ---
const versionsSeen = new Set<number>();
for (const fx of fixtures) {
  const bare = fx.fragment.replace(/^#[pq]=/, "");
  if (!bare) continue;
  try {
    versionsSeen.add((await decodeShareUrl(fx.fragment, brotli)).version);
  } catch {
    /* ignore */
  }
}

// --- budget-boundary delta ---
// High-entropy tokens so brotli's ratio (and thus the compressed-length
// boundary) actually bites; a mulberry32 PRNG keeps it deterministic.
// Swept across seeds because the delta depends on where the boundary lands
// relative to per-tab granularity.
function mkTabs(seed: number, count: number): TabInfo[] {
  let s = seed >>> 0;
  const rnd = () => {
    s |= 0;
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const tok = (n: number) =>
    Array.from(
      { length: n },
      () => "abcdefghijklmnopqrstuvwxyz0123456789"[Math.floor(rnd() * 36)],
    ).join("");
  return Array.from({ length: count }, (_, i) => ({
    url: `https://${tok(12)}.example.${tok(3)}/${tok(16)}/${i}?ref=${tok(10)}`,
    title: `${tok(8)} ${tok(9)} ${tok(7)} tab ${i} ${tok(6)}`,
  }));
}

const boundaryRuns: { seed: number; tsMax: number; goMax: number }[] = [];
for (let seed = 1; seed <= 12; seed++) {
  const tabs = mkTabs(seed * 0x9e3779b9, 400);
  const tsMaxS = await findMaxTabsWithinBudget(tabs, brotli, "https://stash.illo.fyi", 24);
  const goMaxS = goBudget({
    tabs,
    budgetChars: 8000,
    viewerOrigin: "https://stash.illo.fyi",
    expiryHours: 24,
  });
  boundaryRuns.push({ seed, tsMax: tsMaxS, goMax: goMaxS });
}
const tsMax = boundaryRuns[0].tsMax;
const goMax = boundaryRuns[0].goMax;
const maxAbsDelta = Math.max(...boundaryRuns.map((r) => Math.abs(r.goMax - r.tsMax)));

// encoded-length gap at a fixed tab count (seed 1, N = min of the two maxes)
const seed1Tabs = mkTabs(1 * 0x9e3779b9, 400);
const fixedN = Math.min(tsMax, goMax);
const tsFixed = await encodeTabsToShareUrl(
  seed1Tabs.slice(0, fixedN),
  brotli,
  24,
  "https://stash.illo.fyi",
);
const goFixedEnc = goEncode({
  tabs: seed1Tabs.slice(0, fixedN),
  expiryHours: 24,
  transport: "url",
});
const goFixedUrlLen = `https://stash.illo.fyi/s/#p=${goFixedEnc}`.length;

// --- report ---
console.log("\n=== BIDIRECTIONAL ROUND-TRIP (13 fixtures) ===");
console.log(
  "| fixture | Go decode == TS decode | reverse: Go encode -> TS decode | note |",
);
console.log("|---|---|---|---|");
for (const r of rows) {
  console.log(
    `| ${r.name} | ${r.goDecodeVsTs} | ${r.reverseGoEncodeTsDecode} | ${r.note.trim() || "-"} |`,
  );
}

console.log("\n=== v4/v5 COVERAGE GAP ===");
console.log("payload versions present across all fixtures:", [...versionsSeen]);
console.log(
  versionsSeen.has(4) || versionsSeen.has(5)
    ? "v4/v5 fixtures EXIST"
    : "ZERO v4/v5 fixtures — confirmed gap",
);

console.log("\n=== BUDGET-BOUNDARY DELTA (BUDGET_CHARS=8000, origin=stash.illo.fyi) ===");
console.log("per-seed [seed: tsMax vs goMax (delta)]:");
for (const r of boundaryRuns) {
  console.log(`  seed ${r.seed}: TS=${r.tsMax} Go=${r.goMax} (Go-TS = ${r.goMax - r.tsMax})`);
}
console.log(`max |tab-count delta| across ${boundaryRuns.length} seeds: ${maxAbsDelta}`);
console.log(
  `at fixed N=${fixedN} (seed 1): TS url len=${tsFixed.url.length}, Go url len=${goFixedUrlLen}, byte delta=${goFixedUrlLen - tsFixed.url.length}`,
);

const anyFail = rows.some(
  (r) =>
    r.goDecodeVsTs === "FAIL" ||
    r.goDecodeVsTs === "GO-THREW" ||
    r.reverseGoEncodeTsDecode === "FAIL" ||
    r.reverseGoEncodeTsDecode === "THREW",
);
console.log(`\nOVERALL: ${anyFail ? "SOME FAILURES (see table)" : "ALL PASS"}`);
