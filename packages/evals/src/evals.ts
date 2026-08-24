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

function base(
  name: string,
  prompt: string,
  response: LlmResult,
  graded: { pass: boolean; reason: string },
): EvalOutcome {
  return {
    name,
    pass: graded.pass,
    reason: graded.reason,
    prompt,
    response: response.content,
    servedModel: response.servedModel,
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
  const htmlRes = await fetch(`${viewerOrigin}/s`, { headers: { Accept: "text/html" } });
  const html = await htmlRes.text();
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
      const parsed = current ? JSON.parse(current) : {};
      parsed.localLibraryViewerEnabled = true;
      await c.storage.sync.set({ "stash-settings": JSON.stringify(parsed) });
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
      `Task: list the stashes saved in this browser.`,
    ].join("\n\n");
    const result = await client.chat(prompt, DOM_AGENT_CONTEXT, [navigateTool, readDomTool, answerTool]);
    const answer = capturedAnswer ?? tryParseJson(result.content);
    return base(
      "island-extraction",
      prompt,
      result,
      gradeIslandExtraction(answer, EXTENSION_SEED.map((s) => ({ title: s.title, items: s.items }))),
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

export const EVALS: Eval[] = [
  decodeComprehension,
  formatDiscovery,
  shortLinkRead,
  alternateLinkDiscovery,
  negativeFetchOnly,
  islandExtraction,
];
