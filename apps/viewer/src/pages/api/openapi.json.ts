import type { APIRoute } from "astro";
// import { PAYLOAD_VERSION, EXPIRY_HOURS } from "@stash/codec";

export const GET: APIRoute = () => {
  const spec = {
    openapi: "3.1.0",
    info: {
      title: "Stash Viewer API",
      version: "1.1.0",
      description:
        "API documentation for AI agents consuming Stash viewer endpoints. The canonical read endpoint is GET /json?p=<payload>; /md and /s content negotiation are aliases of it. The p parameter contains the payload string taken from the share URL fragment (everything after #p= or #q=).",
    },
    servers: [{ url: "/" }],
    paths: {
      "/json": {
        get: {
          summary: "Decode stash payload as JSON (canonical)",
          description:
            "Canonical endpoint. Decodes a stash payload and returns the structured data as JSON. Responses are cached based on the payload's expiry time.",
          parameters: [
            {
              name: "p",
              in: "query",
              required: true,
              schema: {
                type: "string",
                description: "Base64url-encoded compressed payload",
              },
            },
          ],
          responses: {
            "200": {
              description: "Success",
              content: {
                "application/json": {
                  schema: {
                    $ref: "#/components/schemas/DecodedPayload",
                  },
                },
              },
            },
            "400": {
              description: "Invalid or missing payload",
              content: {
                "application/json": {
                  schema: {
                    $ref: "#/components/schemas/ErrorResponse",
                  },
                },
              },
            },
            "429": {
              description: "Rate limit exceeded",
              content: {
                "application/json": {
                  schema: {
                    $ref: "#/components/schemas/ErrorResponse",
                  },
                },
              },
            },
          },
        },
      },
      "/md": {
        get: {
          summary: "Decode stash payload as Markdown (alias of /json)",
          description:
            "Alias of /json returning the items as a Markdown link list. Prefer GET /json for structured consumption; /md is a convenience for prompt-friendly plain text. Responses are cached based on the payload's expiry time.",
          parameters: [
            {
              name: "p",
              in: "query",
              required: true,
              schema: {
                type: "string",
                description: "Base64url-encoded compressed payload",
              },
            },
          ],
          responses: {
            "200": {
              description: "Success",
              content: {
                "text/markdown": {
                  schema: {
                    type: "string",
                    description: "Markdown-formatted link list",
                  },
                },
              },
            },
            "400": {
              description: "Invalid or missing payload",
              content: {
                "application/json": {
                  schema: {
                    $ref: "#/components/schemas/ErrorResponse",
                  },
                },
              },
            },
            "429": {
              description: "Rate limit exceeded",
              content: {
                "application/json": {
                  schema: {
                    $ref: "#/components/schemas/ErrorResponse",
                  },
                },
              },
            },
          },
        },
      },
      "/s": {
        get: {
          summary: "Stash viewer page with content negotiation (alias of /json)",
          description:
            "Alias of /json via content negotiation. When the payload is passed as ?p= (query, not fragment), GET /s?p=<payload> with Accept: application/json, Accept: text/markdown, ?format=json|md, or a .json/.md suffix on p returns the decoded content server-side. Without negotiation it serves the interactive HTML viewer (the default for browsers).",
          parameters: [
            {
              name: "p",
              in: "query",
              required: false,
              schema: {
                type: "string",
                description:
                  "Payload string from the share URL fragment (optional .json/.md suffix selects format)",
              },
            },
            {
              name: "format",
              in: "query",
              required: false,
              schema: {
                type: "string",
                enum: ["json", "md"],
                description: "Explicit output format override",
              },
            },
          ],
          responses: {
            "200": {
              description: "Decoded content (negotiated format) or the HTML viewer",
            },
            "400": {
              description: "Invalid payload",
              content: {
                "application/json": {
                  schema: {
                    $ref: "#/components/schemas/ErrorResponse",
                  },
                },
              },
            },
          },
        },
      },
    },
    components: {
      schemas: {
        SharePayload: {
          type: "object",
          required: ["v", "e", "i"],
          properties: {
            v: {
              type: "integer",
              description: "Schema version",
              example: 1,
            },
            e: {
              type: "integer",
              description: "Expiry timestamp (Unix seconds)",
              example: 1736524800,
            },
            i: {
              type: "array",
              items: {
                type: "array",
                prefixItems: [
                  { type: "string", description: "url" },
                  { type: "string", description: "title" },
                  {
                    type: "string",
                    enum: ["url", "note"],
                    description: "Optional item kind (payload v5)",
                  },
                ],
                minItems: 2,
                maxItems: 3,
              },
              description: "Array of [url, title, kind?] tuples",
            },
          },
        },
        DecodedPayload: {
          type: "object",
          required: ["expiry", "items", "isExpired"],
          properties: {
            version: {
              type: "integer",
              description: "Payload schema version (4 or 5)",
            },
            title: {
              type: "string",
              description: "Optional title of the stash",
            },
            expiry: {
              type: "integer",
              description: "Expiry timestamp (Unix seconds)",
            },
            isExpired: {
              type: "boolean",
              description: "Whether the payload has expired",
            },
            items: {
              type: "array",
              items: {
                type: "object",
                required: ["url", "title"],
                properties: {
                  url: {
                    type: "string",
                    description: "URL of the item (or note text for kind=note)",
                  },
                  title: {
                    type: "string",
                    description: "Title of the item",
                  },
                  kind: {
                    type: "string",
                    enum: ["url", "note"],
                    description: "Optional item kind; absent means url (payload v5)",
                  },
                },
              },
              description: "Array of items with url and title",
            },
          },
        },
        ErrorResponse: {
          type: "object",
          properties: {
            error: {
              type: "string",
              description: "Error message",
            },
          },
        },
      },
    },
  };

  return new Response(JSON.stringify(spec), {
    headers: { "Content-Type": "application/json" },
  });
};
