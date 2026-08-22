import type { APIRoute } from "astro";
import { buildOpenApiSpec } from "@/lib/openapi-spec";

export const GET: APIRoute = () => {
  const spec = buildOpenApiSpec();

  return new Response(JSON.stringify(spec), {
    headers: { "Content-Type": "application/json" },
  });
};
