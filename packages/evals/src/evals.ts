import type { FetchTool, LlmClient, LlmResult } from "./harness";
import type { PayloadFixture } from "@stash/shared/fixtures";
import { domainsOf, gradeComprehension, gradeFormatDiscovery, gradeShortLinkRead, type ComprehensionAnswer } from "./graders";

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

export const EVALS: Eval[] = [decodeComprehension, formatDiscovery, shortLinkRead];
