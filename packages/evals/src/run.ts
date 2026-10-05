/**
 * Runner: boots viewer preview + local shortener, runs the eval suite per
 * model, writes report-<model>.json per model. Exit 0 iff all evals pass on
 * every model.
 *
 * Models: OPENROUTER_MODEL_ID for a single run, or EVAL_MODELS (comma-
 * separated slugs) to sweep a panel against one booted environment.
 */
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createClient, envConfig, MAX_REQUESTS_PER_RUN } from "./harness";
import { bootShortener, bootAgentViewer, fixture, readLlmsTxt } from "./env";
import { EVALS } from "./evals";
import type { EvalOutcome } from "./evals";

interface ModelSummary {
  model: string;
  metrics: {
    evals: number;
    passed: number;
    totalLatencyMs: number;
    totalToolCalls: number;
    totalPromptTokens: number;
    totalCompletionTokens: number;
    meanLatencyMs: number;
  };
  failed: EvalOutcome[];
  error?: string;
}

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
  const models = (process.env.EVAL_MODELS?.split(",").map((m) => m.trim()).filter(Boolean) ?? [model]);
  if (models.length === 0) models.push(model);

  console.log(`models: ${models.join(", ")} | budget: ${MAX_REQUESTS_PER_RUN} requests/model`);
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
  const llmsTxt = readLlmsTxt();
  const filter = process.env.EVAL_FILTER?.toLowerCase();

  const summaries: ModelSummary[] = [];
  try {
    for (const m of models) {
      const client = createClient(fetch, m);
      const results: EvalOutcome[] = [];
      const summary: ModelSummary = {
        model: m,
        metrics: {
          evals: 0,
          passed: 0,
          totalLatencyMs: 0,
          totalToolCalls: 0,
          totalPromptTokens: 0,
          totalCompletionTokens: 0,
          meanLatencyMs: 0,
        },
        failed: [],
      };
      summaries.push(summary);
      console.log(`\n=== model: ${m} ===`);
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
          llmsTxt,
        };
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
              `  ${outcome.pass ? "PASS" : "FAIL"} (${outcome.servedModel ?? "?"}) — ${outcome.reason} ` +
                `[${outcome.latencyMs}ms, ${outcome.toolCalls ?? 0} tool calls, ` +
                `${(outcome.promptTokens ?? 0) + (outcome.completionTokens ?? 0)} tok]`,
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
      } catch (error) {
        summary.error = error instanceof Error ? error.message : String(error);
        console.error(`  model ${m} aborted: ${summary.error}`);
        if (process.env.EVAL_DEBUG && error instanceof Error) console.error(error.stack);
      }

      const failed = results.filter((r) => !r.pass);
      summary.metrics = {
        evals: results.length,
        passed: results.length - failed.length,
        totalLatencyMs: results.reduce((n, r) => n + (r.latencyMs ?? 0), 0),
        totalToolCalls: results.reduce((n, r) => n + (r.toolCalls ?? 0), 0),
        totalPromptTokens: results.reduce((n, r) => n + (r.promptTokens ?? 0), 0),
        totalCompletionTokens: results.reduce((n, r) => n + (r.completionTokens ?? 0), 0),
        meanLatencyMs: Math.round(
          results.reduce((n, r) => n + (r.latencyMs ?? 0), 0) / Math.max(results.length, 1),
        ),
      };
      summary.failed = failed;
      const modelSlug = m.replace(/[^\w.-]+/g, "_");
      const reportPath = fileURLToPath(new URL(`../report-${modelSlug}.json`, import.meta.url));
      writeFileSync(
        reportPath,
        JSON.stringify(
          { requestedModel: m, requestsUsed: client.requestsUsed(), metrics: summary.metrics, results },
          null,
          2,
        ),
      );
      console.log(`report written: ${reportPath}`);
      console.log(
        `metrics: ${summary.metrics.passed}/${summary.metrics.evals} pass | ` +
          `${summary.metrics.totalToolCalls} tool calls | ` +
          `${summary.metrics.totalPromptTokens + summary.metrics.totalCompletionTokens} tok | ` +
          `total ${summary.metrics.totalLatencyMs}ms | mean ${summary.metrics.meanLatencyMs}ms/eval`,
      );
    }
  } finally {
    await shortener.stop();
    await viewer.stop();
  }

  const anyFail = summaries.some((s) => s.error || s.failed.length > 0);
  if (summaries.length > 1) {
    console.log("\n=== panel summary ===");
    for (const s of summaries) {
      console.log(
        `${s.model}: ${s.error ? `ABORTED (${s.error})` : `${s.metrics.passed}/${s.metrics.evals}`} | ` +
          `${s.metrics.totalToolCalls} calls | mean ${s.metrics.meanLatencyMs}ms`,
      );
    }
  }
  if (anyFail) {
    for (const s of summaries) {
      for (const f of s.failed) {
        console.error(`\n[${f.name}] model=${f.servedModel ?? s.model}`);
        console.error(`reason: ${f.reason}`);
        if (f.prompt) console.error(`prompt (first 500): ${f.prompt.slice(0, 500)}`);
      }
    }
    process.exit(1);
  }
  console.log(`\nall evals passed on all ${summaries.length} model(s)`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
