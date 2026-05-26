import { decodeShareUrl, PayloadDecodeError } from "@stash/codec";
import type { BrotliFunctions } from "@stash/codec";

let brotliInstance: BrotliFunctions | null = null;

async function getBrotliFunctions(): Promise<BrotliFunctions> {
  if (brotliInstance) return brotliInstance;

  // Dynamic import to support CF Workers environment
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const brotliWasm = await import("brotli-wasm") as any;
  brotliInstance = {
    compress: (data, opts) => brotliWasm.compress(data, opts),
    decompress: (data) => brotliWasm.decompress(data),
  };
  return brotliInstance;
}

export const onRequest = async (context: any): Promise<Response> => {
  const { request } = context;

  if (request.method !== "GET") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    const url = new URL(request.url);
    const payload = url.searchParams.get("p");
    const format = (url.searchParams.get("format") || "json").toLowerCase();

    if (!payload) {
      return new Response(
        JSON.stringify({ error: "Missing required parameter: p" }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    if (!["json", "md"].includes(format)) {
      return new Response(
        JSON.stringify({ error: "Invalid format. Must be 'json' or 'md'" }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    const brotli = await getBrotliFunctions();
    const fragment = `#p=${payload}`;
    const decoded = await decodeShareUrl(fragment, brotli);

    if (format === "json") {
      const output = {
        title: decoded.title,
        expiry: decoded.expiry,
        isExpired: decoded.isExpired,
        items: decoded.items.map(([url, title]) => ({ url, title })),
      };

      return new Response(JSON.stringify(output, null, 2), {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type",
        },
      });
    }

    if (format === "md") {
      const lines = decoded.items.map(([url, title]) => {
        const escaped = title.replace(/]/g, "\\]").replace(/\[/g, "\\[");
        return `[${escaped}](${url})`;
      });

      return new Response(lines.join("\n"), {
        status: 200,
        headers: {
          "Content-Type": "text/markdown",
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type",
        },
      });
    }
  } catch (error) {
    console.error("Decode error:", error);

    if (error instanceof PayloadDecodeError) {
      return new Response(
        JSON.stringify({ error: "Invalid payload: " + error.message }),
        {
          status: 400,
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
          },
        }
      );
    }

    return new Response(
      JSON.stringify({ error: "Failed to decode payload" }),
      {
        status: 500,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      }
    );
  }

  return new Response(JSON.stringify({ error: "Unknown error" }), {
    status: 500,
    headers: { "Content-Type": "application/json" },
  });
};
