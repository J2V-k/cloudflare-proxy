export default {
  async fetch(request) {
    const corsHeaders = (origin) => ({
      "Access-Control-Allow-Origin": origin || "*",
      "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS",
      "Access-Control-Allow-Headers":
        "Content-Type, Authorization, LocalName, Cookie",
      "Access-Control-Allow-Credentials": "true",
    });

    const originHeader = request.headers.get("Origin");
    const ch = corsHeaders(originHeader);

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: ch });
    }

    const url = new URL(request.url);
    const pathAfterApi = url.pathname.replace(/^\/api\//, "");

    if (!pathAfterApi && !url.pathname.includes("/api/")) {
      return new Response(JSON.stringify({ error: "No path specified" }), {
        status: 400,
      });
    }

    const backendBase = "https://webportal.jiit.ac.in:6011";

    const sanitizeHeaders = (source) => {
      const src = new Headers(source || {});
      const allowed = [
        'authorization',
        'localname',
        'content-type',
        'accept',
        'user-agent',
        'accept-language',
        'accept-encoding',
        'sec-fetch-site',
        'sec-fetch-mode',
        'sec-fetch-dest',
        'sec-ch-ua',
        'sec-ch-ua-mobile',
        'sec-ch-ua-platform',
        'dnt',
        'cookie',
      ];
      const headers = new Headers();
      allowed.forEach(k => {
        const v = src.get(k);
        if (v !== null && v !== undefined) headers.set(k, v);
      });
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
      const headers = setBackendHeaders(sanitizeHeaders(options.headers || {}));

      if ((options.body !== undefined && options.body !== null) && !headers.has('Content-Type')) {
        headers.set('Content-Type', 'application/json');
      }

      const fetchOptions = { method, headers, redirect: "manual" };
      if (options.body !== undefined && options.body !== null) {
        fetchOptions.body = JSON.stringify(options.body);
      }

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

        const inboundHeadersObj = {};
        for (const [k, v] of sanitizeHeaders(request.headers)) inboundHeadersObj[k] = v;

        const responses = await Promise.all(calls.map(async (call) => {
          try {
            const headersToUse = Object.assign({}, inboundHeadersObj, (call.headers && Object.keys(call.headers).length) ? call.headers : {});
            const res = await proxyFetch(call.path, { method: call.method || 'POST', body: call.body, headers: headersToUse });
            if (!res.ok && res.status === 401) {
              const masked = {};
              Object.keys(headersToUse).forEach(k => {
                const lk = k.toLowerCase();
                const v = headersToUse[k] || '';
                if (lk === 'authorization' || lk === 'cookie') masked[k] = (typeof v === 'string') ? (v.slice(0,10) + '...') : v;
                else masked[k] = v;
              });
            }
            return { ...res, key: call.key };
          } catch (errCall) {
            return { ok: false, status: 500, statusText: 'call_failed', key: call.key, body: { error: String(errCall) } };
          }
        }));

        return new Response(JSON.stringify({ responses }), { status: 200, headers: { "Content-Type": "application/json", ...ch } });
      } catch (err) {
        return new Response(JSON.stringify({ error: "Batch processing failed", details: String(err) }), { status: 500, headers: { "Content-Type": "application/json", ...ch } });
      }
    }

    const backendUrl = `${backendBase}/${pathAfterApi}${url.search}`;

    let reqBody = null;
    if (request.method !== "GET" && request.method !== "HEAD")
      reqBody = await request.text();

    try {
      const outboundHeaders = setBackendHeaders(
        sanitizeHeaders(request.headers),
      );

      const response = await fetch(backendUrl, {
        method: request.method,
        headers: outboundHeaders,
        body: reqBody,
        redirect: "manual",
      });

      let body;
      try { body = await response.text(); } catch (e) { body = '' }

      const outHeaders = Object.assign({}, ch, { 'Content-Type': response.headers.get('content-type') || 'application/json' });

      return new Response(body, { status: response.status, statusText: response.statusText, headers: outHeaders });
    } catch (err) {
      return new Response(
        JSON.stringify({ error: "Worker error", details: String(err) }),
        { status: 500, headers: { "Content-Type": "application/json", ...ch } },
      );
    }
  },
};
