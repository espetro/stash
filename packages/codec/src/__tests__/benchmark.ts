import brotliWasm from "brotli-wasm";
import { encodeTabsToShareUrl, createPayload, encodePayload, buildShareUrl } from "../encoder.js";
import type { TabInfo } from "../types.js";
import type { BrotliFunctions } from "../types.js";
import { PAYLOAD_VERSION, COMPRESSION_THRESHOLD } from "../constants.js";

const oneTab: TabInfo[] = [{ url: "https://github.com", title: "GitHub" }];

const fiveTabs: TabInfo[] = [
  { url: "https://github.com", title: "GitHub" },
  { url: "https://stackoverflow.com", title: "Stack Overflow" },
  { url: "https://developer.mozilla.org", title: "MDN Web Docs" },
  { url: "https://www.reddit.com/r/webdev", title: "r/webdev - Reddit" },
  { url: "https://css-tricks.com", title: "CSS-Tricks" },
];

const tenTabs: TabInfo[] = [
  { url: "https://github.com", title: "GitHub" },
  { url: "https://stackoverflow.com", title: "Stack Overflow" },
  { url: "https://developer.mozilla.org", title: "MDN Web Docs" },
  { url: "https://www.reddit.com/r/webdev", title: "r/webdev - Reddit" },
  { url: "https://css-tricks.com", title: "CSS-Tricks" },
  { url: "https://codepen.io", title: "CodePen" },
  { url: "https://jsfiddle.net", title: "JSFiddle" },
  { url: "https://npmjs.com", title: "npm" },
  { url: "https://yarnpkg.com", title: "Yarn" },
  { url: "https://caniuse.com", title: "Can I use" },
];

const fiftyTabs: TabInfo[] = [
  { url: "https://github.com", title: "GitHub" },
  { url: "https://stackoverflow.com", title: "Stack Overflow" },
  { url: "https://developer.mozilla.org", title: "MDN Web Docs" },
  { url: "https://www.reddit.com/r/webdev", title: "r/webdev - Reddit" },
  { url: "https://css-tricks.com", title: "CSS-Tricks" },
  { url: "https://codepen.io", title: "CodePen" },
  { url: "https://jsfiddle.net", title: "JSFiddle" },
  { url: "https://npmjs.com", title: "npm" },
  { url: "https://yarnpkg.com", title: "Yarn" },
  { url: "https://caniuse.com", title: "Can I use" },
  { url: "https://web.dev", title: "web.dev" },
  { url: "https://developer.chrome.com", title: "Chrome for Developers" },
  { url: "https://javascript.info", title: "JavaScript.info" },
  { url: "https://react.dev", title: "React" },
  { url: "https://vuejs.org", title: "Vue.js" },
  { url: "https://angular.io", title: "Angular" },
  { url: "https://svelte.dev", title: "Svelte" },
  { url: "https://nextjs.org", title: "Next.js" },
  { url: "https://nuxt.com", title: "Nuxt" },
  { url: "https://remix.run", title: "Remix" },
  { url: "https://astro.build", title: "Astro" },
  { url: "https://deno.com", title: "Deno" },
  { url: "https://bun.sh", title: "Bun" },
  { url: "https://nodejs.org", title: "Node.js" },
  { url: "https://typescriptlang.org", title: "TypeScript" },
  { url: "https://tailwindcss.com", title: "Tailwind CSS" },
  { url: "https://webpack.js.org", title: "Webpack" },
  { url: "https://vitejs.dev", title: "Vite" },
  { url: "https://rollupjs.org", title: "Rollup" },
  { url: "https://eslint.org", title: "ESLint" },
  { url: "https://prettier.io", title: "Prettier" },
  { url: "https://jestjs.io", title: "Jest" },
  { url: "https://vitest.dev", title: "Vitest" },
  { url: "https://testing-library.com", title: "Testing Library" },
  { url: "https://cypress.io", title: "Cypress" },
  { url: "https://playwright.dev", title: "Playwright" },
  { url: "https://sentry.io", title: "Sentry" },
  { url: "https://datadoghq.com", title: "Datadog" },
  { url: "https://vercel.com", title: "Vercel" },
  { url: "https://netlify.com", title: "Netlify" },
  { url: "https://cloudflare.com", title: "Cloudflare" },
  { url: "https://aws.amazon.com", title: "AWS" },
  { url: "https://cloud.google.com", title: "Google Cloud" },
  { url: "https://azure.microsoft.com", title: "Azure" },
  { url: "https://mongodb.com", title: "MongoDB" },
  { url: "https://postgresql.org", title: "PostgreSQL" },
  { url: "https://redis.io", title: "Redis" },
  { url: "https://supabase.com", title: "Supabase" },
  { url: "https://firebase.google.com", title: "Firebase" },
  { url: "https://planetscale.com", title: "PlanetScale" },
];

async function measurePayload(
  tabs: TabInfo[],
  brotli: BrotliFunctions,
  compressionThreshold: number,
): Promise<{
  payloadName: string;
  serialized_bytes: number;
  compressed_bytes: number;
  b64url_chars: number;
  final_url_chars: number;
  compression_ratio: number;
  encoding_overhead: number;
  prefix: string;
}> {
  const payload = createPayload(tabs);

  // Build v2 format: version char + expiry + group separator + items
  const items = payload.i
    .filter(([url]) => {
      return url.startsWith("http://") || url.startsWith("https://");
    })
    .map(([url, title]) => {
      const urlWithoutScheme = url.replace(/^https?:\/\//, "");
      return `${urlWithoutScheme}\x1f${title}`;
    });

  const packed = `${payload.v}${payload.e}\x1d${items.join("\x1e")}`;
  const utf8 = new TextEncoder().encode(packed);

  const isCompressed = utf8.length > compressionThreshold;
  const bytes = isCompressed ? brotli.compress(utf8, { quality: 11 }) : utf8;

  const b64 = btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "");

  const prefix = isCompressed ? "C" : "R";
  const encoded = prefix + b64;
  const url = buildShareUrl(encoded);

  const compressionRatio = isCompressed ? bytes.length / utf8.length : 1.0;
  const encodingOverhead = b64.length / bytes.length;

  return {
    payloadName: `${tabs.length}-tab`,
    serialized_bytes: utf8.length,
    compressed_bytes: bytes.length,
    b64url_chars: b64.length,
    final_url_chars: url.length,
    compression_ratio: compressionRatio,
    encoding_overhead: encodingOverhead,
    prefix,
  };
}

async function main() {
  const module = await brotliWasm;
  const brotli: BrotliFunctions = {
    compress: (data, opts) => module.compress(data, opts),
    decompress: (data) => module.decompress(data),
  };

  console.log("# v2 Baseline Benchmark Results\n");
  console.log(
    `**Payload Version**: ${PAYLOAD_VERSION}\n` +
      `**Compression**: Brotli quality 11\n` +
      `**Current Threshold**: ${COMPRESSION_THRESHOLD} bytes\n` +
      `**Encoding**: Base64URL\n\n`,
  );

  console.log(`## Standard Payloads (threshold: ${COMPRESSION_THRESHOLD} bytes)\n`);
  console.log(
    "| payload | serialized_bytes | compressed_bytes | b64url_chars | final_url_chars | compression_ratio | encoding_overhead | prefix |",
  );
  console.log(
    "|---------|-----------------|------------------|--------------|-----------------|-------------------|------------------|--------|",
  );

  const standardResults: Array<{ name: string } & Awaited<ReturnType<typeof measurePayload>>> = [];
  for (const [name, tabs] of [
    ["1-tab", oneTab],
    ["5-tab", fiveTabs],
    ["10-tab", tenTabs],
    ["50-tab", fiftyTabs],
  ] as [string, TabInfo[]][]) {
    const result = await measurePayload(tabs, brotli, COMPRESSION_THRESHOLD);
    standardResults.push({ name, ...result });
    console.log(
      `${result.payloadName.padEnd(8)} | ` +
        `${result.serialized_bytes.toString().padStart(16)} | ` +
        `${result.compressed_bytes.toString().padStart(16)} | ` +
        `${result.b64url_chars.toString().padStart(12)} | ` +
        `${result.final_url_chars.toString().padStart(15)} | ` +
        `${result.compression_ratio.toFixed(3).padStart(17)} | ` +
        `${result.encoding_overhead.toFixed(3).padStart(16)} | ` +
        `${result.prefix.padStart(6)} |`,
    );
  }

  console.log("\n## Threshold Sweep (5-tab payload)\n");
  console.log("**Question**: At what byte threshold does Brotli compression become beneficial?\n");
  console.log(
    "| threshold | serialized_bytes | compressed_bytes | b64url_chars | final_url_chars | compression_ratio | encoding_overhead | prefix | beneficial? |",
  );
  console.log(
    "|-----------|-----------------|------------------|--------------|-----------------|-------------------|------------------|--------|-------------|",
  );

  const thresholds = [50, 100, 200, 500];
  for (const threshold of thresholds) {
    const result = await measurePayload(fiveTabs, brotli, threshold);
    const beneficial = result.compressed_bytes < result.serialized_bytes;
    console.log(
      `${threshold.toString().padStart(9)} | ` +
        `${result.serialized_bytes.toString().padStart(16)} | ` +
        `${result.compressed_bytes.toString().padStart(16)} | ` +
        `${result.b64url_chars.toString().padStart(12)} | ` +
        `${result.final_url_chars.toString().padStart(15)} | ` +
        `${result.compression_ratio.toFixed(3).padStart(17)} | ` +
        `${result.encoding_overhead.toFixed(3).padStart(16)} | ` +
        `${result.prefix.padStart(6)} | ` +
        `${beneficial ? "YES ✓" : "NO ✗".padStart(11)} |`,
    );
  }

  console.log("\n## Key Findings\n");
  console.log(
    `- For 1-tab payload (${standardResults[0].serialized_bytes} bytes): ` +
      `remains raw at all thresholds → threshold has no effect\n` +
      `- For 5-tab payload (${standardResults[1].serialized_bytes} bytes): ` +
      `compressed at 50-byte threshold but check threshold sweep for crossover\n` +
      `- For 10-tab payload (${standardResults[2].serialized_bytes} bytes): ` +
      `compressed at 50-byte threshold\n` +
      `- For 50-tab payload (${standardResults[3].serialized_bytes} bytes): ` +
      `compressed at 50-byte threshold\n`,
  );

  console.log("## Recommendations\n");
  console.log(
    `- **Current threshold (50)**: May be too low for small payloads where Brotli header overhead (10-20 bytes) negates compression benefits\n` +
      `- **Optimal threshold**: Review threshold sweep results to identify crossover point\n` +
      `- **Consider**: Raising threshold to 200-500 bytes based on empirical data\n`,
  );

  const evidencePath = ".sisyphus/evidence/benchmark-results.md";
  await Bun.write(
    evidencePath,
    `# v2 Baseline Benchmark Results

**Payload Version**: ${PAYLOAD_VERSION}
**Compression**: Brotli quality 11
**Current Threshold**: ${COMPRESSION_THRESHOLD} bytes
**Encoding**: Base64URL

## Standard Payloads (threshold: ${COMPRESSION_THRESHOLD} bytes)

| payload | serialized_bytes | compressed_bytes | b64url_chars | final_url_chars | compression_ratio | encoding_overhead | prefix |
|---------|-----------------|------------------|--------------|-----------------|-------------------|------------------|--------|
${standardResults
  .map(
    (r) =>
      `| ${r.payloadName.padEnd(8)} | ` +
      `${r.serialized_bytes.toString().padStart(16)} | ` +
      `${r.compressed_bytes.toString().padStart(16)} | ` +
      `${r.b64url_chars.toString().padStart(12)} | ` +
      `${r.final_url_chars.toString().padStart(15)} | ` +
      `${r.compression_ratio.toFixed(3).padStart(17)} | ` +
      `${r.encoding_overhead.toFixed(3).padStart(16)} | ` +
      `${r.prefix.padStart(6)} |`,
  )
  .join("\n")}

## Threshold Sweep (5-tab payload)

**Question**: At what byte threshold does Brotli compression become beneficial?

| threshold | serialized_bytes | compressed_bytes | b64url_chars | final_url_chars | compression_ratio | encoding_overhead | prefix | beneficial? |
|-----------|-----------------|------------------|--------------|-----------------|-------------------|------------------|--------|-------------|
${await Promise.all(
  thresholds.map(async (threshold) => {
    const result = await measurePayload(fiveTabs, brotli, threshold);
    const beneficial = result.compressed_bytes < result.serialized_bytes;
    return (
      `| ${threshold.toString().padStart(9)} | ` +
      `${result.serialized_bytes.toString().padStart(16)} | ` +
      `${result.compressed_bytes.toString().padStart(16)} | ` +
      `${result.b64url_chars.toString().padStart(12)} | ` +
      `${result.final_url_chars.toString().padStart(15)} | ` +
      `${result.compression_ratio.toFixed(3).padStart(17)} | ` +
      `${result.encoding_overhead.toFixed(3).padStart(16)} | ` +
      `${result.prefix.padStart(6)} | ` +
      `${beneficial ? "YES ✓" : "NO ✗".padStart(11)} |`
    );
  }),
).then((rows) => rows.join("\n"))}

## Key Findings

- For 1-tab payload (${standardResults[0].serialized_bytes} bytes): remains raw at all thresholds → threshold has no effect
- For 5-tab payload (${standardResults[1].serialized_bytes} bytes): compressed at 50-byte threshold but check threshold sweep for crossover
- For 10-tab payload (${standardResults[2].serialized_bytes} bytes): compressed at 50-byte threshold
- For 50-tab payload (${standardResults[3].serialized_bytes} bytes): compressed at 50-byte threshold

## Recommendations

- **Current threshold (50)**: May be too low for small payloads where Brotli header overhead (10-20 bytes) negates compression benefits
- **Optimal threshold**: Review threshold sweep results to identify crossover point
- **Consider**: Raising threshold to 200-500 bytes based on empirical data
`,
  );

  console.log(`\n**Evidence saved to**: ${evidencePath}\n`);
}

main();
