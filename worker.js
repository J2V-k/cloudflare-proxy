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
      return new Response(JSON.stringify({ error: "No path specified" }), { status: 400 });
    }

    const backendBase = "https://webportal.jiit.ac.in:6011";

    const sanitizeHeaders = (source) => {
      const headers = new Headers(source || {});
      [
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
      ].forEach(h => headers.delete(h));
      return headers;
    };

    const setBackendHeaders = (headers) => {
      headers.set("Origin", "https://webportal.jiit.ac.in:6011");
      headers.set("Referer", "https://webportal.jiit.ac.in:6011/");
      headers.set("Host", "webportal.jiit.ac.in:6011");
      return headers;
    };

    const proxyFetch = async (path, options = {}) => {
      const method = options.method || "POST";
      const backendUrl = `${backendBase}/${path.replace(/^\//, "")}`;
      let headers = sanitizeHeaders(options.headers || {});
      headers = setBackendHeaders(headers);

      const fetchOptions = { method, headers, redirect: "manual" };
      if (options.body !== undefined && options.body !== null) fetchOptions.body = typeof options.body === 'string' ? options.body : JSON.stringify(options.body);

      const resp = await fetch(backendUrl, fetchOptions);
      let body;
      try { body = await resp.json(); } catch (e) { body = await resp.text(); }
      return { ok: resp.ok, status: resp.status, statusText: resp.statusText, body };
    };

    if (pathAfterApi === "batch/attendance" && request.method === "POST") {
      try {
        const reqText = await request.text();
        const parsed = JSON.parse(reqText || "{}");
        const calls = Array.isArray(parsed.calls) ? parsed.calls : [];
        const fwdHeaders = parsed.forwardHeaders || {};

        const promises = calls.map(async (call) => {
          try {
            const res = await proxyFetch(call.path, { method: call.method || 'POST', body: call.body, headers: fwdHeaders });
            return { ...res, key: call.key };
          } catch (errCall) {
            return { ok: false, status: 500, statusText: 'call_failed', key: call.key, body: { error: errCall.message } };
          }
        });

        const responses = await Promise.all(promises);
        return new Response(JSON.stringify({ responses }), { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } });
      } catch (err) {
        return new Response(JSON.stringify({ error: "Batch processing failed", details: err.message }), { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } });
      }
    }

    const backendUrl = `${backendBase}/${pathAfterApi}${url.search}`;

    let reqBody = null;
    if (request.method !== "GET" && request.method !== "HEAD") reqBody = await request.text();

    try {
      const outboundHeaders = setBackendHeaders(sanitizeHeaders(request.headers));

      const response = await fetch(backendUrl, {
        method: request.method,
        headers: outboundHeaders,
        body: reqBody,
        redirect: "manual",
      });

      const responseHeaders = new Headers(response.headers);
      [
        "connection",
        "keep-alive",
        "proxy-authenticate",
        "proxy-authorization",
        "te",
        "trailers",
        "transfer-encoding",
        "upgrade",
      ].forEach(h => responseHeaders.delete(h));

      Object.keys(corsHeaders).forEach(key => responseHeaders.set(key, corsHeaders[key]));

      return new Response(response.body, { status: response.status, statusText: response.statusText, headers: responseHeaders });
    } catch (err) {
      return new Response(JSON.stringify({ error: "Proxy error", details: err.message }), { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } });
    }
  },
};
