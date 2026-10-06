/**
 * Standing regression-catcher for the "AI bots are blocked at the CDN"
 * finding (see `.agents/docs/agent-runtime-matrix.md`). Fetches the agent
 * surfaces on production under known-AI User-Agent strings plus a browser
 * control, and asserts they all come back 200 with the right content type.
 *
 * Expected to FAIL today: Cloudflare's "Block AI bots" managed rule 403s
 * `Claude-User`/`ClaudeBot`/`GPTBot`/`ChatGPT-User` at the edge. It starts
 * passing once the WAF Skip rule (see the plan doc) is applied, and catches
 * a silent regression if the managed rule is ever re-tightened.
 *
 * Run: pnpm --filter @stash/e2e run probe:agent-uas
 */

import fixturesJson from "@stash/shared/fixtures/payloads.json" with { type: "json" };
import { loadPayloadFixtures } from "@stash/shared/fixtures";

const VIEWER_ORIGIN = process.env.PROBE_VIEWER_ORIGIN || "https://stash.illo.fyi";
const SHORTENER_ORIGIN = process.env.PROBE_SHORTENER_ORIGIN || "https://s.illo.fyi";

const AI_USER_AGENTS = ["Claude-User/1.0", "ClaudeBot/1.0", "GPTBot/1.0", "ChatGPT-User/1.0"];
const CONTROL_USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";
const ALL_USER_AGENTS = [...AI_USER_AGENTS, CONTROL_USER_AGENT];

interface Check {
  label: string;
  url: string;
  userAgent: string;
  accept?: string;
  expectContentTypeIncludes: string;
}

interface CheckResult extends Check {
  ok: boolean;
  status: number;
  contentType: string | null;
  bodySnippet: string;
}

async function runCheck(check: Check): Promise<CheckResult> {
  const headers: Record<string, string> = { "user-agent": check.userAgent };
  if (check.accept) headers["accept"] = check.accept;

  const response = await fetch(check.url, { headers });
  const contentType = response.headers.get("content-type");
  const body = await response.text();
  const ok =
    response.status === 200 &&
    (contentType?.toLowerCase().includes(check.expectContentTypeIncludes.toLowerCase()) ?? false);

  return {
    ...check,
    ok,
    status: response.status,
    contentType,
    bodySnippet: body.slice(0, 120).replace(/\s+/g, " "),
  };
}

/** POST /api/stash under the control UA to mint a short link to probe reads against. */
async function createShortLink(payload: string): Promise<string> {
  const response = await fetch(`${SHORTENER_ORIGIN}/api/stash`, {
    method: "POST",
    headers: { "content-type": "application/json", "user-agent": CONTROL_USER_AGENT },
    body: JSON.stringify({ payload, ttl: "1d" }),
  });
  if (!response.ok) {
    throw new Error(
      `Could not create short link to probe (POST ${SHORTENER_ORIGIN}/api/stash -> ${response.status}). ` +
        `Aborting rather than probing a stale/guessed id.`,
    );
  }
  const body = (await response.json()) as { id: string };
  return body.id;
}

function buildChecks(payload: string, shortId: string): Check[] {
  const checks: Check[] = [];

  for (const userAgent of ALL_USER_AGENTS) {
    checks.push({
      label: "llms.txt",
      url: `${VIEWER_ORIGIN}/llms.txt`,
      userAgent,
      expectContentTypeIncludes: "text/plain",
    });
    checks.push({
      label: "/s?p= (json)",
      url: `${VIEWER_ORIGIN}/s?p=${payload}&format=json`,
      userAgent,
      accept: "application/json",
      expectContentTypeIncludes: "application/json",
    });
    checks.push({
      label: "/s?p= (markdown)",
      url: `${VIEWER_ORIGIN}/s?p=${payload}&format=md`,
      userAgent,
      accept: "text/markdown",
      expectContentTypeIncludes: "text/markdown",
    });
    checks.push({
      label: "short link",
      url: `${SHORTENER_ORIGIN}/s/${shortId}`,
      userAgent,
      accept: "application/json",
      expectContentTypeIncludes: "application/json",
    });
  }

  return checks;
}

async function main(): Promise<void> {
  const fixtures = loadPayloadFixtures(fixturesJson);
  const fixture = fixtures.find((f) => f.name === "single-tab") ?? fixtures[0];
  if (!fixture) {
    throw new Error("No payload fixtures found in @stash/shared/fixtures/payloads.json");
  }
  const payload = fixture.fragment.replace(/^#p=/, "");

  process.stdout.write(`Probing ${VIEWER_ORIGIN} and ${SHORTENER_ORIGIN} under AI + control UAs...\n`);

  const shortId = await createShortLink(payload);
  process.stdout.write(`Created short link for probing: ${SHORTENER_ORIGIN}/s/${shortId}\n\n`);

  const checks = buildChecks(payload, shortId);
  const results = await Promise.all(checks.map(runCheck));

  const failures = results.filter((r) => !r.ok);
  const passes = results.filter((r) => r.ok);

  for (const r of results) {
    const status = r.ok ? "OK  " : "FAIL";
    process.stdout.write(
      `[${status}] ${r.userAgent.padEnd(18)} ${r.label.padEnd(20)} -> ${r.status} ${r.contentType ?? "(no content-type)"}\n`,
    );
  }

  process.stdout.write(`\n${passes.length}/${results.length} checks passed.\n`);

  if (failures.length > 0) {
    process.stderr.write(`\n${failures.length} check(s) failed:\n`);
    for (const f of failures) {
      process.stderr.write(
        `  - ${f.userAgent} ${f.label} (${f.url}): got ${f.status} ${f.contentType ?? ""}, body: "${f.bodySnippet}"\n`,
      );
    }
    process.exitCode = 1;
  }
}

main().catch((error: unknown) => {
  process.stderr.write(`probe-agent-uas failed: ${error instanceof Error ? error.stack : error}\n`);
  process.exitCode = 1;
});
