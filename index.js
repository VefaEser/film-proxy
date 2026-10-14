
const TMDB_BASE = "https://api.themoviedb.org/3";
const GEMINI_INTERACTIONS_URL = "https://generativelanguage.googleapis.com/v1beta/interactions";

const ALLOWED_TMDB_PATHS = [
  /^\/tmdb\/discover\/movie$/,
  /^\/tmdb\/genre\/movie\/list$/,
  /^\/tmdb\/configuration\/languages$/,
  /^\/tmdb\/configuration\/countries$/,
  /^\/tmdb\/movie\/\d+$/
];

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400"
  };
}

function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...corsHeaders(),
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      ...extraHeaders
    }
  });
}

function isAllowedTmdbPath(pathname) {
  return ALLOWED_TMDB_PATHS.some(pattern => pattern.test(pathname));
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders() });
    }

    if (url.pathname === "/" && request.method === "GET") {
      return json({
        ok: true,
        service: "film-proxy",
        routes: ["/tmdb/*", "/gemini-interactions"]
      });
    }

    if (url.pathname.startsWith("/tmdb/")) {
      if (request.method !== "GET") {
        return json({ error: "Bu yol yalnızca GET isteğini kabul eder." }, 405);
      }
      if (!env.TMDB_API_KEY) {
        return json({ error: "TMDB_API_KEY Worker secret ayarlanmamış." }, 500);
      }

      const tmdbPath = url.pathname.replace(/^\/tmdb/, "");
      if (!isAllowedTmdbPath(url.pathname)) {
        return json({ error: "Bu TMDB yolu proxy üzerinden kullanıma açık değil." }, 404);
      }

      const upstreamUrl = new URL(`${TMDB_BASE}${tmdbPath}`);
      for (const [key, value] of url.searchParams.entries()) {
        upstreamUrl.searchParams.set(key, value);
      }
      upstreamUrl.searchParams.set("api_key", env.TMDB_API_KEY);

      try {
        const upstream = await fetch(upstreamUrl.toString(), {
          headers: { Accept: "application/json" }
        });
        const body = await upstream.text();

        return new Response(body, {
          status: upstream.status,
          headers: {
            ...corsHeaders(),
            "Content-Type": upstream.headers.get("Content-Type") || "application/json; charset=utf-8",
            "Cache-Control": "public, max-age=300"
          }
        });
      } catch (error) {
        return json({
          error: "TMDB servisine bağlanılamadı.",
          detail: error instanceof Error ? error.message : String(error)
        }, 502);
      }
    }

    if (url.pathname === "/gemini-interactions") {
      if (request.method !== "POST") {
        return json({ error: "Bu yol yalnızca POST isteğini kabul eder." }, 405);
      }
      if (!env.GEMINI_API_KEY) {
        return json({ error: "GEMINI_API_KEY Worker secret ayarlanmamış." }, 500);
      }

      let body;
      try {
        body = await request.json();
      } catch {
        return json({ error: "İstek gövdesi geçerli JSON değil." }, 400);
      }

      if (typeof body.input !== "string" || !body.input.trim()) {
        return json({ error: "input alanı boş olmayan bir metin olmalı." }, 400);
      }
      if (body.input.length > 30000) {
        return json({ error: "İstek metni çok uzun." }, 413);
      }

      const payload = {
        model: typeof body.model === "string" ? body.model : "gemini-3.8-flash",
        input: body.input,
        tools: [{ type: "google_search" }]
      };

      try {
        const upstream = await fetch(GEMINI_INTERACTIONS_URL, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-goog-api-key": env.GEMINI_API_KEY
          },
          body: JSON.stringify(payload)
        });

        const raw = await upstream.text();
        let data;
        try { data = raw ? JSON.parse(raw) : {}; }
        catch { data = { error: raw || "Gemini geçerli JSON döndürmedi." }; }

        if (!upstream.ok) {
          return json({
            error: "Gemini API isteği başarısız oldu.",
            upstreamStatus: upstream.status,
            details: data
          }, upstream.status);
        }

        return json(data, 200);
      } catch (error) {
        return json({
          error: "Gemini servisine bağlanılamadı.",
          detail: error instanceof Error ? error.message : String(error)
        }, 502);
      }
    }

    return json({ error: "Endpoint bulunamadı." }, 404);
  }
};
