/**
 * Runner: boots viewer preview + local shortener, runs evals 1-3, writes
 * report.json. Exit 0 iff all runnable evals pass.
 */
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createClient, envConfig, MAX_REQUESTS_PER_RUN } from "./harness";
import { bootShortener, bootAgentViewer, fixture, readLlmsTxt } from "./env";
import { EVALS } from "./evals";
import type { EvalOutcome } from "./evals";

async function main() {
  // Model-authored sandbox code can spawn floating promise rejections (e.g.
  // an un-awaited crypto.subtle.decrypt with a wrong key). Log and continue —
  // one bad eval_js call must not abort the whole benchmark.
  process.on("unhandledRejection", (error) => {
    console.error(`unhandled rejection (continuing): ${error instanceof Error ? error.message : error}`);
  });
  const { apiKey, model } = envConfig();
  if (!apiKey) {
    console.error("OPENROUTER_API_KEY missing. Put it in the root .env.");
    process.exit(2);
  }
  const modelSlug = model.replace(/[^\w.-]+/g, "_");
  const reportPath = fileURLToPath(new URL(`../report-${modelSlug}.json`, import.meta.url));

  console.log(`model (requested): ${model} | budget: ${MAX_REQUESTS_PER_RUN} requests`);
  console.log("booting viewer preview + agent function server ...");
  const viewer = await bootAgentViewer();
  const fx = fixture("three-tabs");
  const shortener = await bootShortener(fx.fragment.replace(/^#[pq]=/, ""));
  const createRes = await fetch(`${shortener.origin}/api/stash`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ payload: fx.fragment.replace(/^#[pq]=/, ""), ttl: "1d" }),
  }).then((r) => r.json());
  // The first stash is created inside bootShortener; use the one from the
  // response of a second create so shortUrl is deterministic per run.
  const shortUrl: string = createRes.url;

  // Seed a zero-trust entry through the public ciphertext path so the enc
  // evals exercise the real dual-mode server, not a fixture.
  const { generateShareKey, encryptForRelay } = await import("@stash/shared");
  const encKey = generateShareKey();
  const encCiphertext = await encryptForRelay(fx.fragment.replace(/^#[pq]=/, ""), encKey);
  const encRes = await fetch(`${shortener.origin}/api/stash`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ciphertext: encCiphertext, ttl: "1d" }),
  }).then((r) => r.json());
  const encUrl = `${encRes.url}#${encKey}`;
  const encId = encRes.id as string;

  const client = createClient();
  const results: EvalOutcome[] = [];
  try {
    const input = {
      client,
      fixture: fx,
      viewerOrigin: viewer.origin,
      shortenerOrigin: shortener.origin,
      shortUrl,
      encUrl,
      encId,
      encKey,
      llmsTxt: readLlmsTxt(),
    };
    const filter = process.env.EVAL_FILTER?.toLowerCase();
    for (const evalFn of EVALS) {
      if (filter && !evalFn.name.toLowerCase().includes(filter)) continue;
      const name = await Promise.resolve(evalFn.name);
      console.log(`running ${name} ...`);
      const started = Date.now();
      try {
        const outcome = await evalFn(input);
        outcome.latencyMs = Date.now() - started;
        results.push(outcome);
        console.log(
          `  ${outcome.pass ? "PASS" : "FAIL"} (${outcome.servedModel ?? "?"}) — ${outcome.reason} [${outcome.latencyMs}ms, ${outcome.toolCalls ?? 0} tool calls]`,
        );
      } catch (error) {
        results.push({
          name,
          pass: false,
          reason: `error: ${error instanceof Error ? error.message : String(error)}`,
          prompt: "",
          response: "",
          servedModel: null,
          latencyMs: Date.now() - started,
        });
        console.error(`  ERROR: ${error instanceof Error ? error.message : error}`);
        if (process.env.EVAL_DEBUG && error instanceof Error) console.error(error.stack);
      }
    }
  } finally {
    await shortener.stop();
    await viewer.stop();
  }

  const failed = results.filter((r) => !r.pass);
  const metrics = {
    evals: results.length,
    passed: results.length - failed.length,
    totalLatencyMs: results.reduce((n, r) => n + (r.latencyMs ?? 0), 0),
    totalToolCalls: results.reduce((n, r) => n + (r.toolCalls ?? 0), 0),
    meanLatencyMs: Math.round(
      results.reduce((n, r) => n + (r.latencyMs ?? 0), 0) / Math.max(results.length, 1),
    ),
  };
  writeFileSync(
    reportPath,
    JSON.stringify(
      { requestedModel: model, requestsUsed: client.requestsUsed(), metrics, results },
      null,
      2,
    ),
  );
  console.log(`report written: ${reportPath}`);
  console.log(
    `metrics: ${metrics.passed}/${metrics.evals} pass | ${metrics.totalToolCalls} tool calls | ` +
      `total ${metrics.totalLatencyMs}ms | mean ${metrics.meanLatencyMs}ms/eval`,
  );
  if (failed.length > 0) {
    console.error(`\n${failed.length}/${results.length} eval(s) failed:`);
    for (const f of failed) {
      console.error(`\n[${f.name}] model=${f.servedModel ?? "?"}`);
      console.error(`reason: ${f.reason}`);
      if (f.prompt) console.error(`prompt (first 500): ${f.prompt.slice(0, 500)}`);
    }
    process.exit(1);
  }
  console.log(`all ${results.length} evals passed`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
