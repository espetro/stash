import type { APIRoute } from 'astro';
import { PAYLOAD_VERSION, EXPIRY_HOURS } from '../lib/constants.js';

export const GET: APIRoute = () => {
  const spec = {
    openapi: "3.1.0",
    info: {
      title: "TabShare Viewer API",
      version: "1.0.0",
      description: "API documentation for AI agents consuming TabShare viewer endpoints. Use /s/?format=json or /s/?format=md for machine-readable output. The URL fragment #p={base64url} contains the compressed payload (client-side only, not a formal parameter)."
    },
    servers: [{ url: "/" }],
    paths: {
      "/s/": {
        get: {
          summary: "View shared tabs",
          description: "Renders shared tabs. The URL fragment #p={base64url} contains the compressed payload (client-side only, not a formal parameter). Use ?format=json or ?format=md for machine-readable output.",
          parameters: [
            {
              name: "format",
              in: "query",
              required: false,
              schema: {
                type: "string",
                enum: ["json", "md"],
                description: "Response format. Omit for HTML."
              }
            }
          ],
          responses: {
            "200": {
              description: "Success",
              content: {
                "application/json": {
                  schema: {
                    $ref: "#/components/schemas/DecodedPayload"
                  }
                },
                "text/markdown": {
                  schema: {
                    type: "string"
                  }
                },
                "text/html": {
                  schema: {
                    type: "string"
                  }
                }
              }
            },
            "400": {
              description: "Invalid or expired payload",
              content: {
                "text/html": {
                  schema: {
                    $ref: "#/components/schemas/ErrorResponse"
                  }
                }
              }
            }
          }
        }
      }
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
              example: 1
            },
            e: {
              type: "integer",
              description: "Expiry timestamp (Unix seconds)",
              example: 1736524800
            },
            i: {
              type: "array",
              items: {
                type: "array",
                items: {
                  type: "string"
                },
                minItems: 2,
                maxItems: 2,
                description: "[url, title] tuple"
              },
              description: "Array of [url, title] pairs"
            }
          }
        },
        DecodedPayload: {
          type: "object",
          required: ["version", "expiry", "items", "isExpired"],
          properties: {
            version: {
              type: "integer",
              description: "Payload schema version"
            },
            expiry: {
              type: "integer",
              description: "Expiry timestamp (Unix seconds)"
            },
            items: {
              type: "array",
              items: {
                type: "array",
                items: {
                  type: "string"
                },
                minItems: 2,
                maxItems: 2
              },
              description: "Array of [url, title] pairs"
            },
            isExpired: {
              type: "boolean",
              description: "Whether the payload has expired"
            }
          }
        },
        ErrorResponse: {
          type: "object",
          properties: {
            error: {
              type: "string",
              description: "Error message"
            }
          }
        }
      }
    }
  };

  return new Response(JSON.stringify(spec), {
    headers: { 'Content-Type': 'application/json' }
  });
};
