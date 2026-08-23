/**
 * Build the OpenAPI 3.1 spec for Stash endpoints. Lives in src/lib so it
 * is reachable by unit tests (the page route lives under pages/api/ which
 * is excluded from tsc).
 */
export function buildOpenApiSpec() {
  return {
    openapi: "3.1.0",
    info: {
      title: "Stash API",
      version: "1.2.0",
      description:
        "API documentation for AI agents consuming Stash endpoints. Two surfaces: the viewer's canonical decode at https://stash.illo.fyi (GET /s?p=<payload> with Accept or ?format= negotiation) and the shortener at https://s.illo.fyi (POST /api/stash, GET /s/<id>?format=json|md|txt). The `p` parameter contains the payload string taken from the share URL fragment (everything after #p= or #q=).",
    },
    servers: [
      { url: "https://stash.illo.fyi", description: "Stash viewer (decode endpoints)" },
      { url: "https://s.illo.fyi", description: "Stash shortener (short links + MCP)" },
      { url: "/", description: "Relative origin (same host)" },
    ],
    paths: {
      "/s": {
        get: {
          summary: "Stash viewer page with content negotiation (canonical decode endpoint)",
          description:
            "Canonical decode endpoint. When the payload is passed as ?p= (query, not fragment), GET /s?p=<payload> negotiates the output format: Accept header (application/json, text/markdown, text/plain) or ?format=json|md|txt fallback. Without negotiation it serves the interactive HTML viewer (the default for browsers). Responses are cached based on the payload's expiry time.",
          parameters: [
            {
              name: "p",
              in: "query",
              required: true,
              schema: {
                type: "string",
                description: "Payload string from the share URL fragment",
              },
            },
            {
              name: "format",
              in: "query",
              required: false,
              schema: {
                type: "string",
                enum: ["json", "md", "txt"],
                description: "Explicit output format override",
              },
            },
          ],
          responses: {
            "200": {
              description: "Decoded content (negotiated format) or the HTML viewer",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/DecodedPayload" },
                },
                "text/markdown": {
                  schema: { type: "string" },
                },
                "text/plain": {
                  schema: { type: "string" },
                },
                "text/html": {
                  schema: { type: "string" },
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
      "/api/stash": {
        post: {
          summary: "Create a short stash",
          description:
            "Creates a stored (server-side) stash with a 6-char base32 id and returns { id, url, expiry, itemCount }. Payload is the same encoded string used in share URL fragments; ttl is one of 1d, 7d, 14d, 30d.",
          servers: [{ url: "https://s.illo.fyi" }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["payload"],
                  properties: {
                    payload: {
                      type: "string",
                      description: "Encoded payload string (C/R/D/S prefix + body)",
                    },
                    ttl: {
                      type: "string",
                      enum: ["1d", "7d", "14d", "30d"],
                      default: "7d",
                      description: "Server-side TTL bucket",
                    },
                  },
                },
              },
            },
          },
          responses: {
            "201": {
              description: "Stash created",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/StashCreated" },
                },
              },
            },
            "400": {
              description: "Invalid body or payload",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/ErrorResponse" },
                },
              },
            },
            "413": {
              description: "Payload too large",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/ErrorResponse" },
                },
              },
            },
            "429": {
              description: "Rate limit exceeded",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/ErrorResponse" },
                },
              },
            },
          },
        },
      },
      "/s/{id}": {
        get: {
          summary: "Resolve short stash id by content negotiation",
          description:
            "Returns the decoded stash contents for the given short id. Format is selected by (1) the optional ?format=json|md|txt query parameter, or (2) Accept header (application/json, text/markdown, text/plain). An unknown format value returns 400 JSON. Without a recognized format the request 302-redirects to the interactive viewer at /s#p=<encoded>. Legacy .json/.md/.txt path suffixes 301-redirect to the ?format= form and will be removed in a future release.",
          servers: [{ url: "https://s.illo.fyi" }],
          parameters: [
            {
              name: "id",
              in: "path",
              required: true,
              schema: {
                type: "string",
                pattern: "^[A-Z2-7]{6}$",
                description: "6-char base32 stash id",
              },
            },
            {
              name: "format",
              in: "query",
              required: false,
              schema: {
                type: "string",
                enum: ["json", "md", "txt"],
                description: "Explicit output format override",
              },
            },
          ],
          responses: {
            "200": {
              description: "Decoded contents",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/DecodedPayload" },
                },
                "text/markdown": {
                  schema: { type: "string" },
                },
                "text/plain": {
                  schema: { type: "string" },
                },
              },
            },
            "302": { description: "Redirect to viewer SPA (HTML negotiation)" },
            "400": {
              description: "Unknown format parameter",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/ErrorResponse" },
                },
              },
            },
            "404": {
              description: "Unknown or expired stash",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/ErrorResponse" },
                },
              },
            },
            "410": {
              description: "Stash expired",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/ErrorResponse" },
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
                    description: "Optional item kind (payload v5+)",
                  },
                ],
                minItems: 2,
                maxItems: 3,
              },
              description: "Array of [url, title, kind?] tuples",
            },
            g: {
              type: "array",
              items: { type: "string" },
              description: "Optional flat tags (payload v6+)",
            },
            n: {
              type: "string",
              description: "Optional freeform note (payload v6+)",
            },
          },
        },
        DecodedPayload: {
          type: "object",
          required: ["expiry", "items", "isExpired", "tags"],
          properties: {
            version: {
              type: "integer",
              description: "Payload schema version (4, 5, or 6)",
            },
            title: {
              type: "string",
              description: "Optional title of the stash",
            },
            tags: {
              type: "array",
              items: { type: "string" },
              description: "Flat tags; empty array if none (payload v6+)",
            },
            note: {
              type: "string",
              description: "Optional freeform note (payload v6+)",
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
        StashCreated: {
          type: "object",
          required: ["id", "url", "expiry", "itemCount"],
          properties: {
            id: {
              type: "string",
              pattern: "^[A-Z2-7]{6}$",
              description: "6-char base32 short id",
            },
            url: {
              type: "string",
              format: "uri",
              description: "Full short URL pointing at the created stash",
            },
            expiry: {
              type: "integer",
              description: "Expiry timestamp (Unix seconds)",
            },
            itemCount: {
              type: "integer",
              description: "Number of items in the created stash",
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
}
