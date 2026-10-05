// Pages middleware for agent-readiness:
//
// 1. Unknown /.well-known/* paths return 404 JSON instead of the SPA's HTML
//    200 fallback. Existing static files pass through; only an HTML fallback
//    or another unsuccessful response is replaced with the JSON 404.
//
// 2. `Accept: text/markdown` on the homepage returns an agent-oriented
//    markdown rendition (pointer to llms.txt + the landing content),
//    instead of HTML. This is honest content negotiation for our own page,
//    not a fake signal.

const HOMEPAGE_MARKDOWN = `# Stash

> URL management for humans and agents. Share groups of links as a single,
> stateless URL. The stash payload travels inside the URL itself.

Stash bundles groups of links into one shareable URL. The payload lives in
the URL fragment, so nothing is stored server-side unless you create a short
link.

## For agents

- Machine-readable docs: https://stash.illo.fyi/llms.txt
- API catalog: https://stash.illo.fyi/.well-known/api-catalog.json
- OpenAPI spec: https://stash.illo.fyi/openapi.json
- MCP server card: https://stash.illo.fyi/.well-known/mcp-server-card.json
- Decode a stash payload: \`GET /s?p=<payload>\` with \`Accept: application/json\`,
  \`text/markdown\`, or \`text/plain\` (fallback \`?format=json|md|txt\`)
- Profile-local browser-agent surface: \`/stashes/?agent=json\`
`;

export const onRequest = async (context: any): Promise<Response> => {
	const { request, next } = context;
	const { pathname } = new URL(request.url);

	if (pathname.startsWith("/.well-known/")) {
		const response = await next();
		const contentType = response.headers.get("Content-Type") ?? "";
		if (response.ok && !contentType.toLowerCase().includes("text/html")) {
			return response;
		}

		return new Response(JSON.stringify({ error: "not_found" }), {
			status: 404,
			headers: {
				"Content-Type": "application/json",
				"Access-Control-Allow-Origin": "*",
			},
		});
	}

	if (pathname === "/" || pathname === "/index.html") {
		const accept = request.headers.get("Accept") ?? "";
		// Parse quality values; text/markdown must not be explicitly refused.
		const mdEntry = accept
			.split(",")
			.map((part: string): { type: string; q: number } => {
				const [type, ...params] = part.trim().split(";");
				const q = params.find((p: string) => p.trim().startsWith("q="));
				return { type: type.trim().toLowerCase(), q: q ? parseFloat(q.split("=")[1]) : 1 };
			})
			.filter((e: { type: string }) => e.type === "text/markdown" || e.type === "text/*" || e.type === "*/*")
			.sort((a: { q: number }, b: { q: number }) => b.q - a.q);
		const wantsMd =
			mdEntry.length > 0 && mdEntry[0].type === "text/markdown" && mdEntry[0].q > 0;
		if (wantsMd) {
			return new Response(HOMEPAGE_MARKDOWN, {
				status: 200,
				headers: {
					"Content-Type": "text/markdown; charset=utf-8",
					"Vary": "Accept",
					"Access-Control-Allow-Origin": "*",
				},
			});
		}
	}

	return next();
};
