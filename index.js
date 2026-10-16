
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

function getGeminiKeys(env) {
  const candidates = [
    ["GEMINI_API_KEY_1", env.GEMINI_API_KEY_1],
    ["GEMINI_API_KEY_2", env.GEMINI_API_KEY_2],
    ["GEMINI_API_KEY_3", env.GEMINI_API_KEY_3],
    ["GEMINI_API_KEY", env.GEMINI_API_KEY]
  ];

  const seen = new Set();

  return candidates.filter(([name, value]) => {
    if (!value || seen.has(value)) return false;
    seen.add(value);
    return true;
  }).map(([name, value]) => ({ name, value }));
}

function extractText(data) {
  if (typeof data?.output_text === "string") {
    return data.output_text;
  }

  if (typeof data?.outputText === "string") {
    return data.outputText;
  }

  const pieces = [];

  function walk(value) {
    if (!value) return;

    if (Array.isArray(value)) {
      for (const item of value) walk(item);
      return;
    }

    if (typeof value !== "object") return;

    if (
      value.type === "text" &&
      typeof value.text === "string"
    ) {
      pieces.push(value.text);
      return;
    }

    if (
      typeof value.text === "string" &&
      !value.type
    ) {
      pieces.push(value.text);
    }

    for (const [key, child] of Object.entries(value)) {
      if (key === "text") continue;
      if (
        key === "content" ||
        key === "steps" ||
        key === "outputs" ||
        key === "output"
      ) {
        walk(child);
      }
    }
  }

  walk(data?.steps);
  walk(data?.outputs);
  walk(data?.output);

  return pieces.join("\n").trim();
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, "") || "/";
    const method = request.method;

    try {
      if (method === "OPTIONS") {
        return new Response(null, {
          status: 204,
          headers: CORS_HEADERS
        });
      }

      // Sağlık kontrolü
      if (method === "GET" && (path === "/" || path === "/health")) {
        const keys = getGeminiKeys(env);

        return jsonResponse({
          ok: true,
          service: "film-proxy",
          tmdbConfigured: Boolean(env.TMDB_API_KEY),
          geminiConfigured: keys.length > 0,
          geminiKeysConfigured: keys.length
        });
      }

      // TMDB film keşfetme
      if (method === "GET" && path === "/tmdb/discover/movie") {
        if (!env.TMDB_API_KEY) {
          return jsonResponse({
            error: "TMDB_API_KEY tanımlanmamış."
          }, 500);
        }

        const tmdbUrl = new URL(
          "https://api.themoviedb.org/3/discover/movie"
        );

        for (const [key, value] of url.searchParams.entries()) {
          tmdbUrl.searchParams.set(key, value);
        }

        tmdbUrl.searchParams.set("api_key", env.TMDB_API_KEY);

        const response = await fetch(tmdbUrl.toString(), {
          headers: { Accept: "application/json" }
        });

        const data = await response.json();

        if (!response.ok) {
          return jsonResponse({
            error: "TMDB film keşfetme isteği başarısız.",
            details: data
          }, response.status);
        }

        return jsonResponse(data);
      }

      // TMDB film arama
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

        const response = await fetch(tmdbUrl.toString(), {
          headers: { Accept: "application/json" }
        });

        const data = await response.json();

        if (!response.ok) {
          return jsonResponse({
            error: "TMDB film arama isteği başarısız.",
            details: data
          }, response.status);
        }

        return jsonResponse(data);
      }

      // Gemini Interactions API ve anahtar yedekleme
      if (method === "POST" && path === "/gemini-interactions") {
        const keys = getGeminiKeys(env);

        if (!keys.length) {
          return jsonResponse({
            error: "Gemini API anahtarı tanımlanmamış.",
            hint: "Cloudflare Secrets bölümünü kontrol et."
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

        const model =
          typeof inputData.model === "string" &&
          inputData.model.trim()
            ? inputData.model.trim()
            : "gemini-3.8-flash";

        const attempts = [];
        let lastStatus = 502;
        let lastData = null;

        for (const key of keys) {
          let response;
          let data;

          try {
            response = await fetch(
              "https://generativelanguage.googleapis.com/v1beta/interactions",
              {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  "x-goog-api-key": key.value
                },
                body: JSON.stringify({
                  model,
                  input: prompt.trim(),
                  tools: [{ type: "google_search" }]
                })
              }
            );

            data = await response.json();
          } catch (error) {
            attempts.push({
              key: key.name,
              status: 502,
              message: error?.message || "Bağlantı hatası."
            });

            lastStatus = 502;
            lastData = { error: "Gemini bağlantısı kurulamadı." };
            continue;
          }

          if (response.ok) {
            const outputText = extractText(data);

            return jsonResponse({
              ok: true,
              model,
              text: outputText,
              outputText,
              usedKey: key.name,
              attempts,
              interaction: {
                ...data,
                outputText
              }
            });
          }

          lastStatus = response.status;
          lastData = data;

          const message =
            data?.error?.message ||
            data?.message ||
            "Gemini isteği başarısız.";

          attempts.push({
            key: key.name,
            status: response.status,
            message
          });

          // 429 veya geçici sunucu hatalarında sıradaki anahtarı dene.
          if (
            response.status !== 429 &&
            response.status < 500
          ) {
            break;
          }
        }

        return jsonResponse({
          ok: false,
          error: "Gemini API isteği başarısız.",
          details: lastData,
          attempts,
          keysAvailable: keys.length,
          hint:
            lastStatus === 429
              ? "Kullanılabilir anahtarların kotası dolmuş olabilir. Google AI Studio proje kotasını ve faturalandırmayı kontrol et."
              : "Cloudflare dağıtımını, Gemini model adını ve API erişimini kontrol et."
        }, lastStatus);
      }

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
      console.error(
        "Worker hatası:",
        error?.message || error
      );

      return jsonResponse({
        error: "Worker içinde beklenmeyen bir hata oluştu.",
        details: error?.message || String(error)
      }, 500);
    }
  }
};
