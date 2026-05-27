export const onRequest = async (context: any): Promise<Response> => {
  const { request } = context;
  const url = new URL(request.url);
  const payload = url.searchParams.get("p");
  const format = url.searchParams.get("format") || "json";

  if (!payload) {
    return new Response(JSON.stringify({ error: "Missing required parameter: p" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const newPath = format === "md" ? "/md" : "/json";
  const redirectUrl = `${newPath}?p=${encodeURIComponent(payload)}`;

  return new Response(null, {
    status: 301,
    headers: {
      Location: redirectUrl,
    },
  });
};
