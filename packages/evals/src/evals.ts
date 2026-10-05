import type { FetchTool, LlmClient, LlmResult, ChatMessage } from "./harness";
import type { PayloadFixture } from "@stash/shared/fixtures";
import {
  domainsOf,
  gradeComprehension,
  gradeFormatDiscovery,
  gradeShortLinkRead,
  gradeAlternateLinkDiscovery,
  gradeNegativeFetchOnly,
  gradeIslandExtraction,
  gradeEncryptedFailClosed,
  type ComprehensionAnswer,
} from "./graders";
import { bootViewer, VIEWER_ORIGIN } from "./env";
import { launchWithExtension, closeContext } from "@stash/e2e/helpers/browser-helper";
import { connectMcpPort, seedExtensionLibrary, EXTENSION_SEED } from "@stash/e2e/helpers/mcp-seed";

export interface EvalOutcome {
  name: string;
  pass: boolean;
  reason: string;
  prompt: string;
  response: string;
  servedModel: string | null;
  /** Wall-clock time for the whole eval (LLM + tool rounds), set by the runner. */
  latencyMs?: number;
  /** Total tool calls the model made across all rounds, counted from the transcript. */
  toolCalls?: number;
  transcript?: Array<{
    role: string;
    content: unknown;
    tool_calls?: string[];
  }>;
}

export interface EvalInput {
  client: LlmClient;
  fixture: PayloadFixture;
  viewerOrigin: string;
  shortenerOrigin: string;
  shortUrl: string;
  llmsTxt: string;
  /** Zero-trust entry seeded via POST /api/stash {ciphertext}: `${shortenerOrigin}/s/<id>#<key>` */
  encUrl: string;
  /** Its 6-char id (for MCP stash_get). */
  encId: string;
  /** Its fragment key (for the eval harness only; agents must extract it from the URL). */
  encKey: string;
}

export type Eval = (input: EvalInput) => Promise<EvalOutcome>;

function payloadOf(fixture: PayloadFixture): string {
  return fixture.fragment.replace(/^#[pq]=/, "");
}

const AGENT_CONTEXT =
  "You are a web agent with plain HTTP fetch access and no browser. " +
  "Use the fetch_url tool to read URLs when you need data. Be precise and concise.";

/** Same origin `apps/viewer/src/layouts/ViewerLayout.astro` falls back to when VITE_VIEWER_ORIGIN is unset at build time. */
const PRODUCTION_VIEWER_ORIGIN = "https://stash.illo.fyi";

const DOM_AGENT_CONTEXT =
  "You are a browser-based web agent driving a real browser. You do NOT have plain HTTP fetch access. " +
  "Use navigate(url) to load pages and read_dom(selector) to inspect the live, client-rendered DOM. " +
  "When you are confident in the answer, call the answer tool with your final structured result.";

/** Pull every `fetch_url`-style tool call's `url` argument out of a chat transcript. */
function extractFetchedUrls(transcript: ChatMessage[], toolName: string): string[] {
  const urls: string[] = [];
  for (const msg of transcript) {
    if (msg.role !== "assistant" || !msg.tool_calls) continue;
    for (const call of msg.tool_calls) {
      if (call.function.name !== toolName) continue;
      try {
        const args = JSON.parse(call.function.arguments || "{}") as { url?: string };
        if (args.url) urls.push(args.url);
      } catch {
        // malformed tool-call arguments; nothing to extract
      }
    }
  }
  return urls;
}

/** Retry a fetch a few times to ride out transient `terminated`/ECONNRESET flakes from the preview server. */
async function fetchRetry(url: string, init?: RequestInit, attempts = 3): Promise<Response> {
  let lastError: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fetch(url, init);
    } catch (error) {
      lastError = error;
      await new Promise((r) => setTimeout(r, 500 * (i + 1)));
    }
  }
  throw lastError;
}

function base(
  name: string,
  prompt: string,
  response: LlmResult,
  graded: { pass: boolean; reason: string },
): EvalOutcome {
  const toolCalls = response.transcript.reduce(
    (n, m) => n + (m.tool_calls?.length ?? 0),
    0,
  );
  return {
    name,
    pass: graded.pass,
    reason: graded.reason,
    prompt,
    response: response.content,
    servedModel: response.servedModel,
    toolCalls,
    transcript: response.transcript.map((m) => ({
      role: m.role,
      content: typeof m.content === "string" ? m.content.slice(0, 2_000) : m.content,
      tool_calls: m.tool_calls?.map((c) => `${c.function.name}(${c.function.arguments})`),
    })),
  };
}

/** Plain-fetch tool the model drives: GET a URL, return text/JSON body. */
function fetchUrlTool(allowedOrigins: string[]): FetchTool {
  return {
    name: "fetch_url",
    description:
      "HTTP GET a URL and return the response body as text. Use Accept: application/json where the site documents it by appending ?format=json instead.",
    async execute(args) {
      const url = String(args.url ?? "");
      const allowed = allowedOrigins.some((o) => url.startsWith(o));
      if (!allowed) return `error: URL must start with one of ${allowedOrigins.join(", ")}`;
      const parsed = new URL(url, allowedOrigins[0]);
      if (parsed.hash && parsed.pathname.startsWith("/s")) {
        return (
          `error: you fetched the URL with its #fragment, which the server never sees (it got /${parsed.pathname} and served the HTML shell). ` +
          `Re-issue the fetch WITHOUT the hash, passing the payload string (everything after #p= or #q=) as the ?p= query parameter, e.g. /s?p=<payload>&format=json`
        );
      }
      const res = await fetch(url, { headers: { Accept: "application/json, text/markdown, text/plain" } });
      let body = await res.text();
      const contentType = res.headers.get("content-type") ?? "?";
      if (contentType.includes("text/html")) {
        body += `\n(hint: this is the HTML viewer shell, not machine-readable data; try appending ?format=json or sending Accept: application/json)`;
      }
      if (contentType.includes("text/html")) {
        // HTML is noise for extraction; keep only compacted text.
        body = body
          .replace(/<style[\s\S]*?<\/style>/gi, " ")
          .replace(/<script[\s\S]*?<\/script>/gi, " ")
          .replace(/<[^>]+>/g, " ")
          .replace(/\s+/g, " ")
          .slice(0, 4_000);
      }
      return `status: ${res.status} content-type: ${contentType}\n${body}`;
    },
  };
}

/** JSON POST tool for the MCP/JSON-RPC surface (stash relay tools). */
function postJsonTool(allowedOrigins: string[]): FetchTool {
  return {
    name: "post_json",
    description:
      "HTTP POST a JSON body to a URL and return the response body. Use for JSON-RPC / MCP endpoints.",
    parameters: {
      type: "object",
      properties: {
        url: { type: "string", description: "URL to POST to" },
        body: { type: "object", description: "JSON body (e.g. a JSON-RPC message)" },
      },
      required: ["url", "body"],
    },
    async execute(args) {
      const url = String(args.url ?? "");
      const allowed = allowedOrigins.some((o) => url.startsWith(o));
      if (!allowed) return `error: URL must start with one of ${allowedOrigins.join(", ")}`;
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json, text/event-stream",
        },
        body: JSON.stringify(args.body ?? {}),
      });
      const text = await res.text();
      return `status: ${res.status}\n${text.slice(0, 4_000)}`;
    },
  };
}

/** JS sandbox tool: simulates a capable agent that can run code (WebCrypto). */
function evalJsTool(): FetchTool {
  return {
    name: "eval_js",
    description:
      "Run JavaScript in a Node.js sandbox with WebCrypto available as `crypto` " +
      "(crypto.subtle for AES-GCM etc.). The code runs as an async function body: " +
      "use `return` for the result; console.log output is captured. No network, " +
      "no filesystem, no require/import. 10s timeout.",
    parameters: {
      type: "object",
      properties: {
        code: { type: "string", description: "JS source for an async function body" },
      },
      required: ["code"],
    },
    async execute(args) {
      const code = String(args.code ?? "");
      const logs: string[] = [];
      try {
        const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor as new (
          ...args: string[]
        ) => (...args: unknown[]) => Promise<unknown>;
        const fn = new AsyncFunction(
          "crypto",
          "console",
          `"use strict";\n${code}`,
        );
        const fakeConsole = {
          log: (...a: unknown[]) => logs.push(a.map(String).join(" ")),
          info: (...a: unknown[]) => logs.push(a.map(String).join(" ")),
          warn: (...a: unknown[]) => logs.push(`warn: ${a.map(String).join(" ")}`),
          error: (...a: unknown[]) => logs.push(`error: ${a.map(String).join(" ")}`),
        };
        const fnPromise = fn(crypto, fakeConsole);
        // If the timeout wins the race, fn()'s late rejection must not become
        // an unhandled rejection and kill the runner (Node crashes on those).
        fnPromise.catch(() => {});
        const result = await Promise.race([
          fnPromise,
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error("eval_js timeout (10s)")), 10_000),
          ),
        ]);
        const out =
          (result === undefined ? "" : `return: ${JSON.stringify(result)}`) +
          (logs.length ? `${result === undefined ? "" : "\n"}logs: ${logs.join("\n")}` : "");
        return (
          out ||
          "ok (no output) — your code neither returned a value nor logged anything. " +
            "Did you forget `return` or console.log?"
        );
      } catch (error) {
        return (
          `error: ${error instanceof Error ? error.message : String(error)}` +
          (logs.length ? `\nlogs: ${logs.join("\n")}` : "")
        );
      }
    },
  };
}

/** Eval 1: decode comprehension against the viewer share URL. */
export const decodeComprehension: Eval = async ({ client, fixture, viewerOrigin, shortenerOrigin, llmsTxt }) => {
  const shareUrl = `${viewerOrigin}/s/${fixture.fragment}`;
  const prompt = [
    `Here is the llms.txt of a link-sharing site:\n\n${llmsTxt}`,
    `Here is a stash share URL: ${shareUrl}`,
    `Read the stash programmatically. The share URL fragment (#p=...) is invisible to servers: strip the fragment, take the payload string after #p=, and GET ${viewerOrigin}/s?p=<payload>&format=json with fetch_url. That endpoint returns JSON directly; do not GET the plain /s page (it serves only HTML). Then answer:`,
    `1. How many links are in this stash?`,
    `2. What are the domains of those links?`,
    `Answer with "<number> links" and the domain list. Your final message must contain the answer only, never fetched page content.`,
  ].join("\n\n");
  const result = await client.chat(prompt, AGENT_CONTEXT, [fetchUrlTool([viewerOrigin, shortenerOrigin])]);
  const expected: ComprehensionAnswer = {
    count: fixture.itemCount,
    domains: domainsOf(fixture.items.map((i) => i.url)),
  };
  return base("decode-comprehension", prompt, result, gradeComprehension(result.content, expected));
};

/** Eval 2: format discovery (JSON endpoint URL). No tools: pure doc reading. */
export const formatDiscovery: Eval = async ({ client, fixture, viewerOrigin, llmsTxt }) => {
  const shareUrl = `${viewerOrigin}/s/${fixture.fragment}`;
  const prompt = [
    `Here is the llms.txt of a link-sharing site:\n\n${llmsTxt}`,
    `Here is a stash share URL: ${shareUrl}`,
    `Return the exact URL an agent should GET to obtain this stash as JSON.`,
    `Respond with just the URL.`,
  ].join("\n\n");
  const result = await client.chat(prompt, AGENT_CONTEXT);
  return base(
    "format-discovery",
    prompt,
    result,
    gradeFormatDiscovery(result.content, payloadOf(fixture), viewerOrigin),
  );
};

/** Eval 3: short-link read against the local shortener. */
export const shortLinkRead: Eval = async ({ client, fixture, shortUrl, shortenerOrigin, viewerOrigin, llmsTxt }) => {
  const prompt = [
    `Here is the llms.txt of a link-sharing site:\n\n${llmsTxt}`,
    `Here is a short link served at ${shortenerOrigin}: ${shortUrl}`,
    `Read the stash behind this short link (use fetch_url) and list every URL it contains, one per line.`,
  ].join("\n\n");
  const result = await client.chat(prompt, AGENT_CONTEXT, [fetchUrlTool([viewerOrigin, shortenerOrigin])]);
  return base(
    "short-link-read",
    prompt,
    result,
    gradeShortLinkRead(result.content, fixture.items.map((i) => i.url)),
  );
};

/**
 * Eval 4: regression test for the /s page's `<link rel="alternate">`
 * href resolving to localhost instead of the configured production
 * viewer origin. Gives the model the real raw HTML the local preview
 * server emits for /s (with the payload fragment stripped, as a server
 * would see it) and asks it to fetch the stash as JSON; the model must
 * find the alternate link, fill in the payload, and fetch it.
 */
export const alternateLinkDiscovery: Eval = async ({ client, fixture, viewerOrigin, shortenerOrigin }) => {
  const payload = payloadOf(fixture);
  const htmlRes = await fetchRetry(`${viewerOrigin}/s`, { headers: { Accept: "text/html" } });
  // Keep only the <head> (where <link rel="alternate"> lives) — inlining the
  // full page makes the LLM request large enough for flaky providers to
  // terminate the stream.
  const fullHtml = await htmlRes.text();
  const headEnd = fullHtml.indexOf("</head>");
  const html = (headEnd > 0 ? fullHtml.slice(0, headEnd + 7) : fullHtml).slice(0, 30_000);
  const shareUrl = `${viewerOrigin}/s#p=${payload}`;
  const prompt = [
    `Here is a stash share URL: ${shareUrl}`,
    `Here is the raw HTML the server returned for the /s page (the #p=... fragment never reaches the server, so this HTML was fetched without the payload):`,
    "```html",
    html,
    "```",
    `The share URL's payload (the part after #p=) is: ${payload}`,
    `Task: fetch this stash as JSON. Find the <link rel="alternate" type="application/json"> tag in the HTML above, take its origin and path, fill in the payload as the p= query parameter, and fetch that URL with fetch_url.`,
  ].join("\n\n");
  const result = await client.chat(prompt, AGENT_CONTEXT, [fetchUrlTool([viewerOrigin, shortenerOrigin])]);
  const fetchedUrls = extractFetchedUrls(result.transcript, "fetch_url");
  return base(
    "alternate-link-discovery",
    prompt,
    result,
    gradeAlternateLinkDiscovery(fetchedUrls, payload, PRODUCTION_VIEWER_ORIGIN),
  );
};

/**
 * Eval 5: fetch-only negative case. A fetch-only agent asked to "list
 * the stashes saved in this browser" must recognize that `/stashes` is
 * a profile-local, client-rendered surface it cannot read via plain
 * HTTP (or fall back to /s?p=...), rather than hallucinating a listing.
 */
export const negativeFetchOnly: Eval = async ({ client, viewerOrigin, llmsTxt }) => {
  const prompt = [
    `Here is the llms.txt of a link-sharing site:\n\n${llmsTxt}`,
    `The site is running at ${viewerOrigin}.`,
    `Task: list the stashes saved in this browser. You have plain HTTP fetch access only (no browser, no DOM, no extension).`,
    `Investigate with fetch_url as needed, then answer. If you cannot obtain the browser's local stash library via plain fetch, say so explicitly rather than inventing an answer.`,
  ].join("\n\n");
  const result = await client.chat(prompt, AGENT_CONTEXT, [fetchUrlTool([viewerOrigin])]);
  return base("negative-fetch-only", prompt, result, gradeNegativeFetchOnly(result.content));
};

/**
 * Eval 6: DOM-tier island extraction. Drives a real Playwright browser
 * context with the extension loaded and seeded (mirrors the e2e
 * agent-flow/local-bridge setup), then hands the model exactly three
 * tools — navigate, read_dom, answer — and the bare natural-language
 * task, with no selector hints. Tests whether llms.txt plus raw DOM
 * exploration is self-describing enough to find `#stash-local-export`
 * on its own.
 *
 * Reuses the already-running :4321 preview server (bootViewer()) rather
 * than booting a second one — see the port-collision note in README.md.
 */
export const islandExtraction: Eval = async ({ client, llmsTxt }) => {
  await bootViewer();
  const context = await launchWithExtension();
  let capturedAnswer: unknown = null;
  try {
    const rpc = await connectMcpPort(context);
    await rpc.initialize();
    await seedExtensionLibrary(rpc);
    // Opt the extension into the local-bridge surface the same way the
    // options UI would (writes through browser.storage.sync directly).
    await rpc.page.evaluate(async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const c = (globalThis as any).chrome;
      const current = (await c.storage.sync.get("stash-settings"))["stash-settings"];
      const parsed = typeof current === "string" ? JSON.parse(current) : ((current ?? {}) as Record<string, unknown>);
      parsed.localLibraryViewerEnabled = true;
      await c.storage.sync.set({ "stash-settings": parsed });
    });

    const page = await context.newPage();
    await page.goto("about:blank");

    const navigateTool: FetchTool = {
      name: "navigate",
      description: "Navigate the browser to a URL under the viewer origin.",
      parameters: {
        type: "object",
        properties: { url: { type: "string", description: "URL to navigate to" } },
        required: ["url"],
      },
      async execute(args) {
        const url = String(args.url ?? "");
        if (!url.startsWith(VIEWER_ORIGIN)) return `error: navigation restricted to ${VIEWER_ORIGIN}`;
        await page.goto(url, { waitUntil: "domcontentloaded" });
        await page.waitForLoadState("networkidle").catch(() => undefined);
        await page.waitForTimeout(1000);
        return `navigated to ${page.url()} (title: ${await page.title()})`;
      },
    };

    const readDomTool: FetchTool = {
      name: "read_dom",
      description: "Read the current page's DOM. Returns the outerHTML of every element matching a CSS selector.",
      parameters: {
        type: "object",
        properties: { selector: { type: "string", description: "CSS selector, e.g. body or #some-id" } },
        required: ["selector"],
      },
      async execute(args) {
        const selector = String(args.selector ?? "body");
        const html = await page.evaluate((sel) => {
          const els = Array.from(document.querySelectorAll(sel));
          if (els.length === 0) return null;
          return els.map((el) => el.outerHTML).join("\n---\n");
        }, selector);
        if (html === null) return `error: no elements matched selector "${selector}"`;
        return html.length > 8_000 ? `${html.slice(0, 8_000)}\n...(truncated)` : html;
      },
    };

    const answerTool: FetchTool = {
      name: "answer",
      description:
        "Submit your final answer once you've found the stash data: an array of stashes, each with a title and its items (array of {url, title}).",
      parameters: {
        type: "object",
        properties: {
          stashes: {
            type: "array",
            items: {
              type: "object",
              properties: {
                title: { type: "string" },
                items: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: { url: { type: "string" }, title: { type: "string" } },
                    required: ["url"],
                  },
                },
              },
              required: ["title", "items"],
            },
          },
        },
        required: ["stashes"],
      },
      async execute(args) {
        capturedAnswer = args.stashes ?? args;
        return "answer recorded";
      },
    };

    const prompt = [
      `Here is the llms.txt of a link-sharing site:\n\n${llmsTxt}`,
      `The site is running at ${VIEWER_ORIGIN}.`,
      `Task: list the stashes saved in this browser. Report each stash's own stored title and items — not the page <title>.`,
    ].join("\n\n");
    const result = await client.chat(prompt, DOM_AGENT_CONTEXT, [navigateTool, readDomTool, answerTool]);
    const answer = capturedAnswer ?? tryParseJson(result.content);
    return base(
      "island-extraction",
      prompt,
      result,
      gradeIslandExtraction(answer, EXTENSION_SEED.map((s) => ({ title: s.title, items: s.items })), result.content),
    );
  } finally {
    await closeContext(context);
  }
};

/**
 * Eval 7: snapshot-tier island extraction. Same setup as `islandExtraction`
 * (real Playwright context, extension loaded and seeded, local-bridge
 * enabled), but `read_dom` mirrors a DOM-snapshot/text-extraction browser
 * agent (BrowserOS-class `get_page_content`) instead of a raw-HTML reader:
 * rooted at `document.body`, with `SCRIPT`/`STYLE`/`NOSCRIPT` subtrees
 * stripped before the remaining text is returned. `#stash-local-export`
 * (a `<script type="application/json">`) is therefore invisible through
 * this tool, same as it is to the real runtime it models — so the model
 * must find `/stashes/?agent=json` (via the sr-only hint or llms.txt)
 * instead of trying to read the island. This case is expected to FAIL on
 * a build without the sr-only hint and PASS once it's present — that
 * regression is the point.
 */
export const snapshotExtraction: Eval = async ({ client, llmsTxt }) => {
  await bootViewer();
  const context = await launchWithExtension();
  let capturedAnswer: unknown = null;
  try {
    const rpc = await connectMcpPort(context);
    await rpc.initialize();
    await seedExtensionLibrary(rpc);
    await rpc.page.evaluate(async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const c = (globalThis as any).chrome;
      const current = (await c.storage.sync.get("stash-settings"))["stash-settings"];
      const parsed = typeof current === "string" ? JSON.parse(current) : ((current ?? {}) as Record<string, unknown>);
      parsed.localLibraryViewerEnabled = true;
      await c.storage.sync.set({ "stash-settings": parsed });
    });

    const page = await context.newPage();
    await page.goto("about:blank");

    const navigateTool: FetchTool = {
      name: "navigate",
      description: "Navigate the browser to a URL under the viewer origin.",
      parameters: {
        type: "object",
        properties: { url: { type: "string", description: "URL to navigate to" } },
        required: ["url"],
      },
      async execute(args) {
        const url = String(args.url ?? "");
        if (!url.startsWith(VIEWER_ORIGIN)) return `error: navigation restricted to ${VIEWER_ORIGIN}`;
        await page.goto(url, { waitUntil: "domcontentloaded" });
        await page.waitForLoadState("networkidle").catch(() => undefined);
        await page.waitForTimeout(1000);
        return `navigated to ${page.url()} (title: ${await page.title()})`;
      },
    };

    // Mirrors a DOM-snapshot/text-extraction tool: body-rooted, with
    // SCRIPT/STYLE/NOSCRIPT stripped, returning only visible text — no
    // outerHTML, no tags, no attributes.
    const readDomTool: FetchTool = {
      name: "read_dom",
      description:
        "Read the current page's visible text content, rooted at <body>. Script, style, and noscript " +
        "elements are never included — this does not surface hidden data attributes, JSON script islands, " +
        "or <head> metadata.",
      parameters: {
        type: "object",
        properties: {},
      },
      async execute() {
        // String-evaluate: esbuild wraps named inner functions with its __name
        // helper, which does not exist in the browser context.
        const text = (await page.evaluate(`(() => {
          const SKIP = new Set(["SCRIPT", "STYLE", "NOSCRIPT"]);
          const walk = (node) => {
            if (node.nodeType === Node.TEXT_NODE) return node.textContent ?? "";
            if (node.nodeType !== Node.ELEMENT_NODE) return "";
            const el = node;
            if (SKIP.has(el.tagName)) return "";
            let out = "";
            for (const child of Array.from(el.childNodes)) out += walk(child);
            return out;
          };
          return walk(document.body).replace(/\\s+/g, " ").trim();
        })()`)) as string;
        return text.length > 8_000 ? `${text.slice(0, 8_000)}\n...(truncated)` : text;
      },
    };

    const answerTool: FetchTool = {
      name: "answer",
      description:
        "Submit your final answer once you've found the stash data: an array of stashes, each with a title and its items (array of {url, title}).",
      parameters: {
        type: "object",
        properties: {
          stashes: {
            type: "array",
            items: {
              type: "object",
              properties: {
                title: { type: "string" },
                items: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: { url: { type: "string" }, title: { type: "string" } },
                    required: ["url"],
                  },
                },
              },
              required: ["title", "items"],
            },
          },
        },
        required: ["stashes"],
      },
      async execute(args) {
        capturedAnswer = args.stashes ?? args;
        return "answer recorded";
      },
    };

    const prompt = [
      `Here is the llms.txt of a link-sharing site:\n\n${llmsTxt}`,
      `The site is running at ${VIEWER_ORIGIN}.`,
      `Task: list the stashes saved in this browser. Report each stash's own stored title and items — not the page <title>.`,
    ].join("\n\n");
    const result = await client.chat(prompt, DOM_AGENT_CONTEXT, [navigateTool, readDomTool, answerTool]);
    const answer = capturedAnswer ?? tryParseJson(result.content);
    return base(
      "snapshot-extraction",
      prompt,
      result,
      gradeIslandExtraction(answer, EXTENSION_SEED.map((s) => ({ title: s.title, items: s.items })), result.content),
    );
  } finally {
    await closeContext(context);
  }
};

function tryParseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/**
 * F14 eval — a fetch-only agent on a zero-trust (encrypted) short link must
 * fail honestly: consult the JSON envelope, recognize `encrypted`, and say it
 * cannot read the contents — WITHOUT fabricating URLs it could not possibly
 * know. This is the core "agent-first holds under zero-trust" property: an
 * honest dead end, not a hallucinated answer.
 */
export const encryptedFailClosed: Eval = async ({
  client,
  fixture,
  encUrl,
  viewerOrigin,
  shortenerOrigin,
  llmsTxt,
}) => {
  const prompt = [
    `Here is the llms.txt of a link-sharing site:\n\n${llmsTxt}`,
    `Here is a short link served at ${shortenerOrigin}: ${encUrl}`,
    `Read the stash behind this link and list every URL it contains, one per line. If you cannot read it, explain precisely why.`,
  ].join("\n\n");
  const result = await client.chat(prompt, AGENT_CONTEXT, [
    fetchUrlTool([viewerOrigin, shortenerOrigin]),
  ]);
  return base(
    "encrypted-fail-closed",
    prompt,
    result,
    gradeEncryptedFailClosed(
      result.content,
      fixture.items.map((i) => i.url),
      extractFetchedUrls(result.transcript, "fetch_url"),
    ),
  );
};

/**
 * F14 eval — a capable agent (can run code) on a zero-trust short link should
 * complete the full documented recipe: fetch the ciphertext envelope, decrypt
 * with the fragment key via WebCrypto, then decode the recovered payload
 * (e.g. by passing it to /s?p=<payload>&format=json on the viewer).
 * Measures whether the documented decrypt path is executable end to end.
 */
export const encryptedDecryptRoundtrip: Eval = async ({
  client,
  fixture,
  encUrl,
  viewerOrigin,
  shortenerOrigin,
  llmsTxt,
}) => {
  const prompt = [
    `Here is the llms.txt of a link-sharing site:\n\n${llmsTxt}`,
    `Here is a short link served at ${shortenerOrigin}: ${encUrl}`,
    `The site itself (the host serving llms.txt) is running at ${viewerOrigin}.`,
    `Read the stash behind this link and list every URL it contains, one per line.`,
    `You also have an eval_js tool that runs JavaScript with WebCrypto — use it if the site documents a client-side decryption step. After decrypting you can pass the plaintext payload to the viewer's /s?p=<payload>&format=json endpoint for server-side decode.`,
  ].join("\n\n");
  const result = await client.chat(prompt, AGENT_CONTEXT, [
    fetchUrlTool([viewerOrigin, shortenerOrigin]),
    evalJsTool(),
  ]);
  return base(
    "encrypted-decrypt-roundtrip",
    prompt,
    result,
    gradeShortLinkRead(
      result.content,
      fixture.items.map((i) => i.url),
    ),
  );
};

/**
 * MCP eval — the relay's stateless JSON-RPC surface must be usable by a plain
 * HTTP agent: stash_create composes a stash from raw URLs (the agent cannot
 * encode msgpack payloads itself), stash_get reads it back.
 */
export const mcpRoundtrip: Eval = async ({
  client,
  fixture,
  shortenerOrigin,
  llmsTxt,
}) => {
  const wanted = fixture.items.map((i) => i.url);
  const prompt = [
    `Here is the llms.txt of a link-sharing site:\n\n${llmsTxt}`,
    `The site hosts a stateless Streamable-HTTP MCP server at ${shortenerOrigin}/mcp. It accepts plain POSTs of JSON-RPC 2.0 messages.`,
    `To invoke a tool, POST {"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"<tool>","arguments":{<args>}}}.`,
    `Use post_json to: (1) call stash_create with arguments {"title":"Eval Bundle","urls":${JSON.stringify(wanted)},"ttlDays":1}; (2) call stash_get with the returned stash id as its arguments.`,
    `Then list every URL in the created stash, one per line.`,
  ].join("\n\n");
  const result = await client.chat(prompt, AGENT_CONTEXT, [
    postJsonTool([shortenerOrigin]),
  ]);
  return base("mcp-roundtrip", prompt, result, gradeShortLinkRead(result.content, wanted));
};

export const EVALS: Eval[] = [
  decodeComprehension,
  formatDiscovery,
  shortLinkRead,
  alternateLinkDiscovery,
  negativeFetchOnly,
  islandExtraction,
  snapshotExtraction,
  encryptedFailClosed,
  encryptedDecryptRoundtrip,
  mcpRoundtrip,
];
