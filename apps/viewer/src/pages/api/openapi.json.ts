import type { APIRoute } from "astro";
import { PAYLOAD_VERSION, EXPIRY_HOURS } from "@stash/codec";

export const GET: APIRoute = () => {
  const spec = {
    openapi: "3.1.0",
    info: {
      title: "Stash Viewer API",
      version: "1.0.0",
      description:
        "API documentation for AI agents consuming Stash viewer endpoints. Use /json or /md to retrieve decoded stash payloads. The p parameter contains the base64url-encoded compressed payload.",
    },
    servers: [{ url: "/" }],
    paths: {
      "/json": {
        get: {
          summary: "Decode stash payload as JSON",
          description:
            "Decodes a stash payload and returns the structured data as JSON. Responses are cached based on the payload's expiry time.",
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
          summary: "Decode stash payload as Markdown",
          description:
            "Decodes a stash payload and returns the items as a Markdown link list. Responses are cached based on the payload's expiry time.",
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
                items: {
                  type: "string",
                },
                minItems: 2,
                maxItems: 2,
                description: "[url, title] tuple",
              },
              description: "Array of [url, title] pairs",
            },
          },
        },
        DecodedPayload: {
          type: "object",
          required: ["expiry", "items", "isExpired"],
          properties: {
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
                    description: "URL of the item",
                  },
                  title: {
                    type: "string",
                    description: "Title of the item",
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
