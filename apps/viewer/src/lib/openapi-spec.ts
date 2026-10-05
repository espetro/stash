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
        "API documentation for AI agents consuming Stash endpoints. Three surfaces: (1) the viewer's canonical decode at https://stash.illo.fyi (GET /s?p=<payload> with Accept or ?format= negotiation), (2) the relay at https://s.illo.fyi (POST /api/stash, DELETE /api/stash/<id>, GET /s/<id>?format=json|md|txt), and (3) a profile-local browser-agent surface at https://stash.illo.fyi/stashes — this last surface is for browser-class agents that run inside the user's profile (ChromeClaw, NanoBrowser, BrowserOS); fetch-only agents cannot use it and should use the hosted share-link endpoints. The `p` parameter contains the payload string taken from the share URL fragment (everything after #p= or #q=).",
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
            "Creates a stored (server-side) stash with a 6-char base32 id and returns { id, url, expiry } (+ itemCount for plaintext creates). Dual-mode request: send `payload` (the same encoded string used in share URL fragments; decoded, validated and stored readable) OR `ciphertext` (a zero-trust relayed share encrypted client-side with AES-256-GCM; stored opaque — the server never sees the key, which travels in the share URL's #<key> fragment). ttl is one of 1d, 7d, 14d, 30d.",
          servers: [{ url: "https://s.illo.fyi" }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    payload: {
                      type: "string",
                      description:
                        "Encoded payload string (C/R/D/S prefix + body). Exactly one of payload/ciphertext is required.",
                    },
                    ciphertext: {
                      type: "string",
                      description:
                        "base64url AES-256-GCM ciphertext (IV || ciphertext+tag) for a zero-trust relayed share. Exactly one of payload/ciphertext is required.",
                    },
                    ttl: {
                      type: "string",
                      enum: ["1d", "7d", "14d", "30d"],
                      default: "7d",
                      description:
                        "Server-side TTL bucket; defaults from relay config when omitted",
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
      "/api/stash/{id}": {
        delete: {
          summary: "Revoke a short stash",
          description:
            "Deletes the stored entry for the given short id before its TTL expiry. 204 on success, 404 when absent (or already deleted/expired). No auth in v1: the 6-char base32 id is the unguessable shared secret; abuse is bounded by the rate limiter.",
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
            "204": { description: "Stash deleted" },
            "404": {
              description: "Unknown id",
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
            "Returns the stash contents for the given short id. Format is selected by (1) the optional ?format=json|md|txt query parameter, or (2) Accept header (application/json, text/markdown, text/plain). An unknown format value returns 400 JSON. Zero-trust (encrypted) entries cannot be decoded server-side: ?format=json returns the ciphertext envelope { id, ciphertext, expiry, encrypted: true } for client-side decryption with the key from the share URL's #<key> fragment; md/txt return 409; HTML negotiation 302-redirects to viewer?id=<id>&relay=<origin>. Plaintext entries decode as before and HTML negotiation 302-redirects to /s#p=<encoded>. Legacy .json/.md/.txt path suffixes 301-redirect to the ?format= form and will be removed in a future release.",
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
              description:
                "Decoded contents (plaintext) or ciphertext envelope (encrypted, ?format=json only)",
              content: {
                "application/json": {
                  schema: {
                    oneOf: [
                      { $ref: "#/components/schemas/DecodedPayload" },
                      { $ref: "#/components/schemas/CiphertextEnvelope" },
                    ],
                  },
                },
                "text/markdown": {
                  schema: { type: "string" },
                },
                "text/plain": {
                  schema: { type: "string" },
                },
              },
            },
            "302": {
              description:
                "Redirect to viewer SPA (HTML negotiation): /s#p=<encoded> for plaintext entries, /s?id=<id>&relay=<origin> for encrypted entries",
            },
            "400": {
              description: "Unknown format parameter",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/ErrorResponse" },
                },
              },
            },
            "409": {
              description:
                "Entry is encrypted (zero-trust): md/txt cannot be produced server-side; fetch ?format=json for the ciphertext envelope",
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
          required: ["id", "url", "expiry"],
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
              description:
                "Number of items in the created stash (only for plaintext {payload} creates; absent for {ciphertext})",
            },
          },
        },
        CiphertextEnvelope: {
          type: "object",
          required: ["id", "ciphertext", "expiry", "encrypted"],
          description:
            "Zero-trust entry: the server holds only ciphertext. Decrypt client-side with the AES-256-GCM key from the share URL's #<key> fragment (ciphertext layout: IV(12B) || ciphertext+tag(16B), base64url).",
          properties: {
            id: {
              type: "string",
              pattern: "^[A-Z2-7]{6}$",
            },
            ciphertext: {
              type: "string",
              description: "base64url AES-256-GCM ciphertext (IV || ciphertext+tag)",
            },
            expiry: {
              type: "integer",
              description: "Expiry timestamp (Unix seconds)",
            },
            encrypted: {
              type: "boolean",
              enum: [true],
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
