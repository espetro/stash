import { PayloadDecodeError } from "@stash/codec";
import {
  decodePayload,
  buildCacheControl,
  checkRateLimit,
  extractClientIp,
} from "./_shared/decode";

export const onRequest = async (context: any): Promise<Response> => {
  const { request } = context;

  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      },
    });
  }

  if (request.method !== "GET") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    const url = new URL(request.url);
    const payload = url.searchParams.get("p");

    if (!payload) {
      return new Response(
        JSON.stringify({ error: "Missing required parameter: p" }),
        {
          status: 400,
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
          },
        }
      );
    }

    const ip = extractClientIp(request);
    if (!checkRateLimit(ip)) {
      return new Response(
        JSON.stringify({ error: "Rate limit exceeded" }),
        {
          status: 429,
          headers: {
            "Content-Type": "application/json",
            "Retry-After": "60",
            "Access-Control-Allow-Origin": "*",
          },
        }
      );
    }

    const decoded = await decodePayload(payload);
    const cacheControl = buildCacheControl(decoded.expiry);

    return new Response(JSON.stringify(decoded, null, 2), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": cacheControl,
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      },
    });
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
};
