
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Content-Type": "application/json; charset=utf-8"
};

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: CORS_HEADERS
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, "") || "/";
    const method = request.method;

    try {
      // CORS ön kontrol isteği
      if (method === "OPTIONS") {
        return new Response(null, {
          status: 204,
          headers: CORS_HEADERS
        });
      }

      // Worker sağlık kontrolü
      if (method === "GET" && (path === "/" || path === "/health")) {
        return jsonResponse({
          ok: true,
          service: "film-proxy",
          tmdbConfigured: Boolean(env.TMDB_API_KEY),
          geminiConfigured: Boolean(env.GEMINI_API_KEY_2)
        });
      }

      // TMDB: film keşfetme ve filtreleme
      if (method === "GET" && path === "/tmdb/discover/movie") {
        if (!env.TMDB_API_KEY) {
          return jsonResponse({
            error: "TMDB_API_KEY tanımlanmamış."
          }, 500);
        }

        const tmdbUrl = new URL(
          "https://api.themoviedb.org/3/discover/movie"
        );

        // İstemciden gelen TMDB filtrelerini aktar.
        for (const [key, value] of url.searchParams.entries()) {
          tmdbUrl.searchParams.set(key, value);
        }

        // TMDB API v3 anahtarı
        tmdbUrl.searchParams.set("api_key", env.TMDB_API_KEY);

        const upstream = await fetch(tmdbUrl.toString(), {
          headers: { Accept: "application/json" }
        });

        const body = await upstream.json();

        if (!upstream.ok) {
          return jsonResponse({
            error: "TMDB film keşfetme isteği başarısız.",
            details: body
          }, upstream.status);
        }

        return jsonResponse(body);
      }

      // TMDB: film arama
      if (method === "GET" && path === "/tmdb/search/movie") {
        if (!env.TMDB_API_KEY) {
          return jsonResponse({
            error: "TMDB_API_KEY tanımlanmamış."
          }, 500);
        }

        const tmdbUrl = new URL(
          "https://api.themoviedb.org/3/search/movie"
        );

        for (const [key, value] of url.searchParams.entries()) {
          tmdbUrl.searchParams.set(key, value);
        }

        tmdbUrl.searchParams.set("api_key", env.TMDB_API_KEY);

        const upstream = await fetch(tmdbUrl.toString(), {
          headers: { Accept: "application/json" }
        });

        const body = await upstream.json();

        if (!upstream.ok) {
          return jsonResponse({
            error: "TMDB film arama isteği başarısız.",
            details: body
          }, upstream.status);
        }

        return jsonResponse(body);
      }

      // Gemini 3.8 Flash: Interactions API
      if (method === "POST" && path === "/gemini-interactions") {
        if (!env.GEMINI_API_KEY_2) {
          return jsonResponse({
            error: "GEMINI_API_KEY_2 tanımlanmamış."
          }, 500);
        }

        let inputData;

        try {
          inputData = await request.json();
        } catch {
          return jsonResponse({
            error: "İstek gövdesi geçerli JSON değil."
          }, 400);
        }

        const prompt = inputData?.input;

        if (typeof prompt !== "string" || !prompt.trim()) {
          return jsonResponse({
            error: "input alanında bir metin gönderilmelidir."
          }, 400);
        }

        // Model adı sabit tutulur; istemciden gelen model adı kullanılmaz.
        const geminiResponse = await fetch(
          "https://generativelanguage.googleapis.com/v1beta/interactions",
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-goog-api-key": env.GEMINI_API_KEY_2
            },
            body: JSON.stringify({
              model: "gemini-3.8-flash",
              input: prompt.trim()
              tools: [{ type: "google_search" }]
            })
          }
        );

        const geminiData = await geminiResponse.json();

        if (!geminiResponse.ok) {
          console.error("Gemini API hatası:", geminiResponse.status);

          return jsonResponse({
            error: "Gemini API isteği başarısız.",
            details: geminiData
          }, geminiResponse.status);
        }

        // REST yanıtındaki metni farklı olası yanıt biçimlerinden çıkar.
        let outputText =
          geminiData.output_text ||
          geminiData.outputText ||
          "";

        if (!outputText && Array.isArray(geminiData.steps)) {
          outputText = geminiData.steps
            .filter(step => step.type === "model_output")
            .flatMap(step => step.content || [])
            .filter(item => item.type === "text")
            .map(item => item.text || "")
            .join("\n");
        }

        if (!outputText && Array.isArray(geminiData.outputs)) {
          outputText = geminiData.outputs
            .map(item => item.text || "")
            .filter(Boolean)
            .join("\n");
        }

        // app.js içindeki data.interaction.outputText alanıyla uyumlu.
        return jsonResponse({
          ok: true,
          model: "gemini-3.8-flash",
          text: outputText,
          outputText,
          interaction: {
            ...geminiData,
            outputText
          }
        });
      }

      // Tanımlanmamış adres
      return jsonResponse({
        error: "Endpoint bulunamadı.",
        path,
        availableEndpoints: [
          "GET /",
          "GET /health",
          "GET /tmdb/discover/movie",
          "GET /tmdb/search/movie",
          "POST /gemini-interactions"
        ]
      }, 404);

    } catch (error) {
      console.error("Worker hatası:", error?.message || error);

      return jsonResponse({
        error: "Worker içinde beklenmeyen bir hata oluştu."
      }, 500);
    }
  }
};
