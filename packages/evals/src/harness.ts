/**
 * Thin OpenAI-compatible client for OpenRouter, with budget guard,
 * optional fetch tool loop, and model-attribution recording. Never logs
 * the API key; reports carry prompts, responses, and the served model only.
 */
import { config as loadEnv } from "dotenv";
import { fileURLToPath } from "node:url";

// Load the ROOT .env (pnpm-workspace root), resolved relative to this
// file so it works under tsx and vitest alike.
loadEnv({ path: fileURLToPath(new URL("../../../.env", import.meta.url)) });

export const DEFAULT_MODEL = "nvidia/nemotron-3-super-120b-a12b:free";

const BASE_URL = "https://openrouter.ai/api/v1";
export const MAX_REQUESTS_PER_RUN = 60;
const MAX_TOOL_ROUNDS = 6;

export class BudgetExceededError extends Error {
  constructor(used: number, max: number) {
    super(`LLM budget exceeded: ${used}/${max} requests used this run`);
  }
}

export interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  tool_calls?: { id: string; type?: "function"; function: { name: string; arguments: string } }[];
  tool_call_id?: string;
}

const DEFAULT_TOOL_PARAMETERS = {
  type: "object",
  properties: { url: { type: "string" } },
  required: ["url"],
} as const;

export interface FetchTool {
  name: string;
  description: string;
  /**
   * JSON-schema for the tool's parameters, advertised to the model.
   * Defaults to fetch_url's single required `url` string when omitted,
   * so existing fetch-only tools need no change.
   */
  parameters?: Record<string, unknown>;
  /** Execute the tool; return the content fed back to the model. */
  execute(args: Record<string, unknown>): Promise<string>;
}

export interface LlmResult {
  content: string;
  servedModel: string | null;
  attempts: number;
  transcript: ChatMessage[];
  /** Token usage summed over every request in this chat, when reported. */
  promptTokens?: number;
  completionTokens?: number;
}

export interface LlmClient {
  chat(
    prompt: string,
    context: string,
    tools?: FetchTool[],
  ): Promise<LlmResult>;
  requestsUsed(): number;
}

export function envConfig(env: Record<string, string | undefined> = process.env) {
  return {
    apiKey: env.OPENROUTER_API_KEY,
    model: env.OPENROUTER_MODEL_ID ?? DEFAULT_MODEL,
  };
}

export function createClient(fetchImpl: typeof fetch = fetch, modelOverride?: string): LlmClient {
  let used = 0;

  async function once(
    apiKey: string,
    model: string,
    messages: ChatMessage[],
    tools?: FetchTool[],
  ): Promise<{ message: ChatMessage; servedModel: string | null; promptTokens: number; completionTokens: number }> {
    const res = await fetchImpl(`${BASE_URL}/chat/completions`, {
      method: "POST",
      // Bound each request: a stalled upstream stream otherwise hangs the
      // eval forever. Free-tier models have legitimately needed ~300s for a
      // single completion, so the ceiling stays above that.
      signal: AbortSignal.timeout(360_000),
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages,
        ...(tools && tools.length > 0
          ? {
              tools: tools.map((t) => ({
                type: "function",
                function: { name: t.name, description: t.description, parameters: t.parameters ?? DEFAULT_TOOL_PARAMETERS },
              })),
            }
          : {}),
      }),
    });
    if (!res.ok) {
      throw Object.assign(
        new Error(`OpenRouter ${res.status}: ${(await res.text()).slice(0, 300)}`),
        { status: res.status },
      );
    }
    const body = (await res.json()) as {
      model?: string;
      choices?: {
        message?: {
          role?: string;
          content?: string | null;
          tool_calls?: {
            id?: string;
            name?: string;
            arguments?: string;
            function?: { name?: string; arguments?: string };
          }[];
        };
      }[];
      usage?: { prompt_tokens?: number; completion_tokens?: number };
    };
    const raw = body.choices?.[0]?.message;
    if (!raw) throw new Error("OpenRouter returned no message");
    const message: ChatMessage = {
      role: "assistant",
      content: raw.content ?? "",
      tool_calls: raw.tool_calls?.map((c) => ({
        id: c.id ?? "call",
        type: "function" as const,
        function: {
          name: c.function?.name ?? c.name ?? "",
          arguments: c.function?.arguments ?? c.arguments ?? "{}",
        },
      })),
    };
    const servedModel = res.headers.get("x-or-model") ?? body.model ?? null;
    const usage = body.usage ?? {};
    return {
      message,
      servedModel,
      promptTokens: usage.prompt_tokens ?? 0,
      completionTokens: usage.completion_tokens ?? 0,
    };
  }

  return {
    requestsUsed: () => used,
    async chat(prompt, context, tools) {
      const { apiKey, model: envModel } = envConfig();
      const model = modelOverride ?? envModel;
      if (!apiKey) throw new Error("OPENROUTER_API_KEY missing (root .env)");
      if (used >= MAX_REQUESTS_PER_RUN) throw new BudgetExceededError(used, MAX_REQUESTS_PER_RUN);
      used++;
      const messages: ChatMessage[] = [
        { role: "system", content: context },
        { role: "user", content: prompt },
      ];
      let servedModel: string | null = null;
      let requestsForThisChat = 0;
      let emptyNudges = 0;
      let promptTokens = 0;
      let completionTokens = 0;
      for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
        if (round > 0) {
          if (used >= MAX_REQUESTS_PER_RUN) throw new BudgetExceededError(used, MAX_REQUESTS_PER_RUN);
          used++;
        }
        let result: Awaited<ReturnType<typeof once>>;
        let lastError: unknown;
        for (let attempt = 1; attempt <= 2; attempt++) {
          try {
            result = await once(apiKey, model, messages, tools);
            break;
          } catch (error) {
            lastError = error;
            const status = (error as { status?: number }).status;
            const message = error instanceof Error ? error.message : "";
            // Retry once on rate-limit / model-unavailable class errors.
            // OpenRouter wraps upstream 429s in a 400, so sniff the body too.
            const rateLimited = status === 429 || /"code":429|rate-limited/.test(message);
            // Transport-level flakes (undici `terminated`, socket resets) carry no
            // status — retry those once too instead of failing the whole eval.
            const transportFlake =
              status === undefined &&
              /terminated|ECONNRESET|ETIMEDOUT|fetch failed|socket|UND_ERR|abort|timed? ?out|TimeoutError/i.test(message);
            if (attempt === 1 && (rateLimited || (status ?? 0) >= 500 || transportFlake)) {
              if (used < MAX_REQUESTS_PER_RUN) {
                used++;
                requestsForThisChat++;
              }
              continue;
            }
            throw error;
          }
        }
        // @ts-expect-result assigned in the loop above on success
        result = result!;
        requestsForThisChat++;
        promptTokens += result.promptTokens;
        completionTokens += result.completionTokens;
        servedModel = servedModel ?? result.servedModel;
        messages.push(result.message);
        const calls = result.message.tool_calls ?? [];
        // Some models (gpt-oss harmony format) occasionally emit a truly
        // empty assistant turn — no content, no tool calls. Treating that as
        // the final answer discards all prior tool work; nudge instead and
        // let the model continue. Bounded so a degenerate loop can't spin.
        if (calls.length === 0 && !result.message.content?.trim() && tools && emptyNudges < 2) {
          emptyNudges++;
          messages.push({
            role: "user",
            content:
              "Your last response was empty — no text and no tool call. " +
              "Continue: either call a tool or write your final answer.",
          });
          continue;
        }
        if (calls.length === 0 || !tools) {
          return {
            content: result.message.content,
            servedModel,
            attempts: requestsForThisChat,
            transcript: messages,
            promptTokens,
            completionTokens,
          };
        }
        for (const call of calls) {
          // Harmony-format models (gpt-oss) leak channel markers into tool
          // names — `answer<|channel|>commentary`. Strip them: the tool
          // intent and arguments are correct, and real serving stacks
          // normalize these on dispatch.
          const toolName = call.function.name.replace(/<\|[^|]*\|>.*$/, "");
          const tool = tools.find((t) => t.name === toolName);
          let output: string;
          if (!tool) {
            output = `error: unknown tool ${call.function.name}`;
          } else {
            try {
              output = await tool.execute(JSON.parse(call.function.arguments || "{}"));
            } catch (error) {
              output = `error: ${error instanceof Error ? error.message : String(error)}`;
            }
          }
          messages.push({ role: "tool", content: output.slice(0, 20_000), tool_call_id: call.id });
        }
      }
      return {
        content: messages[messages.length - 1]?.content ?? "",
        servedModel,
        attempts: requestsForThisChat,
        transcript: messages,
        promptTokens,
        completionTokens,
      };
    },
  };
}
