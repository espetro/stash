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
  const { apiKey, model } = envConfig();
  if (!apiKey) {
    console.error("OPENROUTER_API_KEY missing. Put it in the root .env.");
    process.exit(2);
  }
  const reportPath = fileURLToPath(new URL("../report.json", import.meta.url));

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

  const client = createClient();
  const results: EvalOutcome[] = [];
  try {
    const input = {
      client,
      fixture: fx,
      viewerOrigin: viewer.origin,
      shortenerOrigin: shortener.origin,
      shortUrl,
      llmsTxt: readLlmsTxt(),
    };
    for (const evalFn of EVALS) {
      const name = await Promise.resolve(evalFn.name);
      console.log(`running ${name} ...`);
      try {
        const outcome = await evalFn(input);
        results.push(outcome);
        console.log(`  ${outcome.pass ? "PASS" : "FAIL"} (${outcome.servedModel ?? "?"}) — ${outcome.reason}`);
      } catch (error) {
        results.push({
          name,
          pass: false,
          reason: `error: ${error instanceof Error ? error.message : String(error)}`,
          prompt: "",
          response: "",
          servedModel: null,
        });
        console.error(`  ERROR: ${error instanceof Error ? error.message : error}`);
      }
    }
  } finally {
    await shortener.stop();
    await viewer.stop();
  }

  const failed = results.filter((r) => !r.pass);
  writeFileSync(
    reportPath,
    JSON.stringify(
      { requestedModel: model, requestsUsed: client.requestsUsed(), results },
      null,
      2,
    ),
  );
  console.log(`report written: ${reportPath}`);
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
