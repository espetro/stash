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
        "API documentation for AI agents consuming Stash endpoints. Two surfaces: the viewer's canonical decode at https://stash.illo.fyi (GET /json?p=<payload>, /md?p=<payload>, /s?p=<payload>) and the shortener at https://s.illo.fyi (POST /api/stash, GET /s/<id>[.json|.md|.txt]). The `p` parameter contains the payload string taken from the share URL fragment (everything after #p= or #q=).",
    },
    servers: [
      { url: "https://stash.illo.fyi", description: "Stash viewer (decode endpoints)" },
      { url: "https://s.illo.fyi", description: "Stash shortener (short links + MCP)" },
      { url: "/", description: "Relative origin (same host)" },
    ],
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
            "Alias of /json via content negotiation. When the payload is passed as ?p= (query, not fragment), GET /s?p=<payload> with Accept: application/json, Accept: text/markdown, Accept: text/plain, ?format=json|md, or a .json/.md/.txt suffix on p returns the decoded content server-side. Without negotiation it serves the interactive HTML viewer (the default for browsers).",
          parameters: [
            {
              name: "p",
              in: "query",
              required: false,
              schema: {
                type: "string",
                description:
                  "Payload string from the share URL fragment (optional .json/.md/.txt suffix selects format)",
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
            "Returns the decoded stash contents for the given short id. Format is selected by (1) optional .json/.md/.txt suffix on the path, or (2) Accept header (application/json, text/markdown, text/plain). Without a recognized format the request 302-redirects to the interactive viewer at /s#p=<encoded>.",
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
      "/s/{id}.json": {
        get: {
          summary: "Resolve short stash id as JSON",
          description:
            "Alias of GET /s/{id} with the .json suffix; equivalent to GET /s/{id} with Accept: application/json.",
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
          ],
          responses: {
            "200": {
              description: "Decoded JSON",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/DecodedPayload" },
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
          },
        },
      },
      "/s/{id}.md": {
        get: {
          summary: "Resolve short stash id as Markdown",
          description:
            "Alias of GET /s/{id} with the .md suffix; equivalent to GET /s/{id} with Accept: text/markdown.",
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
          ],
          responses: {
            "200": {
              description: "Markdown link list",
              content: {
                "text/markdown": {
                  schema: { type: "string" },
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
