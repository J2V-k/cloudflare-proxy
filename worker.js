export default {
  async fetch(request) {
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization, LocalName",
    };

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    const url = new URL(request.url);
    const pathAfterApi = url.pathname.replace(/^\/api\//, "");

    if (!pathAfterApi && !url.pathname.includes("/api/")) {
      return new Response(
        JSON.stringify({ error: "No path specified" }),
        { status: 400 }
      );
    }

    const backendBase = "https://webportal.jiit.ac.in:6011";
    const backendUrl = `${backendBase}/${pathAfterApi}${url.search}`;

    let reqBody = null;
    if (request.method !== "GET" && request.method !== "HEAD") {
      reqBody = await request.text();
    }

    const outboundHeaders = new Headers(request.headers);

    const headersToDelete = [
      "host",
      "origin",
      "referer",
      "cf-connecting-ip",
      "cf-ipcountry",
      "cf-ray",
      "cf-visitor",
      "x-forwarded-for",
      "x-forwarded-proto",
      "x-real-ip",
      "content-length",
      "transfer-encoding",
    ];

    headersToDelete.forEach(h => outboundHeaders.delete(h));

    outboundHeaders.set("Origin", "https://webportal.jiit.ac.in:6011");
    outboundHeaders.set("Referer", "https://webportal.jiit.ac.in:6011/");
    outboundHeaders.set("Host", "webportal.jiit.ac.in:6011");

    try {
      const response = await fetch(backendUrl, {
        method: request.method,
        headers: outboundHeaders,
        body: reqBody,
        redirect: "manual",
      });

      const responseHeaders = new Headers(response.headers);

      const hopByHop = [
        "connection",
        "keep-alive",
        "proxy-authenticate",
        "proxy-authorization",
        "te",
        "trailers",
        "transfer-encoding",
        "upgrade",
      ];
      hopByHop.forEach(h => responseHeaders.delete(h));

      Object.keys(corsHeaders).forEach(key => {
        responseHeaders.set(key, corsHeaders[key]);
      });

      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers: responseHeaders,
      });
    } catch (err) {
      return new Response(
        JSON.stringify({ error: "Proxy error", details: err.message }),
        {
          status: 500,
          headers: {
            "Content-Type": "application/json",
            ...corsHeaders,
          },
        }
      );
    }
  },
};
