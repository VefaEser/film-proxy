
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
  const list = [
    ["GEMINI_API_KEY_1", env.GEMINI_API_KEY_1],
    ["GEMINI_API_KEY_2", env.GEMINI_API_KEY_2],
    ["GEMINI_API_KEY_3", env.GEMINI_API_KEY_3],
    ["GEMINI_API_KEY", env.GEMINI_API_KEY]
  ];

  const seen = new Set();

  return list
    .filter(([name, value]) => {
      if (!value || seen.has(value)) return false;
      seen.add(value);
      return true;
    })
    .map(([name, value]) => ({ name, value }));
}

function extractText(data) {
  if (typeof data?.output_text === "string") {
    return data.output_text;
  }

  if (typeof data?.outputText === "string") {
    return data.outputText;
  }

  const parts = [];

  function walk(items) {
    if (!Array.isArray(items)) return;

    for (const item of items) {
      if (typeof item?.text === "string") {
        parts.push(item.text);
      } else if (Array.isArray(item?.content)) {
        walk(item.content);
      }
    }
  }

  if (Array.isArray(data?.steps)) {
    for (const step of data.steps) {
      if (step.type === "model_output") {
        walk(step.content);
      }
    }
  }

  if (!parts.length && Array.isArray(data?.outputs)) {
    walk(data.outputs);
  }

  if (!parts.length && Array.isArray(data?.output)) {
    walk(data.output);
  }

  return parts.join("\n").trim();
}

async function tmdbRequest(env, upstreamPath, params) {
  if (!env.TMDB_API_KEY) {
    return jsonResponse({
      error: "TMDB_API_KEY tanımlanmamış."
    }, 500);
  }

  const target = new URL(
    "https://api.themoviedb.org/3" + upstreamPath
  );

  for (const [key, value] of params.entries()) {
    if (key !== "id") {
      target.searchParams.set(key, value);
    }
  }

  target.searchParams.set("api_key", env.TMDB_API_KEY);

  const response = await fetch(target.toString(), {
    headers: { Accept: "application/json" }
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    return jsonResponse({
      error: "TMDB isteği başarısız.",
      details: data
    }, response.status);
  }

  return jsonResponse(data);
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

      // Worker sağlık kontrolü
      if (
        method === "GET" &&
        (path === "/" || path === "/health")
      ) {
        const keys = getGeminiKeys(env);

        return jsonResponse({
          ok: true,
          service: "film-proxy",
          tmdbConfigured: Boolean(env.TMDB_API_KEY),
          geminiConfigured: keys.length > 0,
          geminiKeysConfigured: keys.length
        });
      }

      if (method === "GET") {
        // Film keşfetme
        if (path === "/tmdb/discover/movie") {
          return tmdbRequest(
            env,
            "/discover/movie",
            url.searchParams
          );
        }

        // Film arama
        if (path === "/tmdb/search/movie") {
          return tmdbRequest(
            env,
            "/search/movie",
            url.searchParams
          );
        }

        // Film türleri
        if (path === "/tmdb/genre/movie/list") {
          return tmdbRequest(
            env,
            "/genre/movie/list",
            url.searchParams
          );
        }

        // TMDB dil listesi
        if (path === "/tmdb/configuration/languages") {
          return tmdbRequest(
            env,
            "/configuration/languages",
            url.searchParams
          );
        }

        // TMDB ülke listesi
        if (path === "/tmdb/configuration/countries") {
          return tmdbRequest(
            env,
            "/configuration/countries",
            url.searchParams
          );
        }

        // Film ayrıntıları
        if (path === "/tmdb/movie/details") {
          const id = url.searchParams.get("id");

          if (!id || !/^\d+$/.test(id)) {
            return jsonResponse({
              error: "Film ayrıntısı için geçerli bir TMDB ID gerekli."
            }, 400);
          }

          return tmdbRequest(
            env,
            `/movie/${id}`,
            url.searchParams
          );
        }
      }

      // Gemini Interactions API
      if (
        method === "POST" &&
        path === "/gemini-interactions"
      ) {
        const keys = getGeminiKeys(env);

        if (!keys.length) {
          return jsonResponse({
            error: "Gemini API anahtarı tanımlanmamış."
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

            data = await response.json().catch(() => ({}));
          } catch (error) {
            lastStatus = 502;
            lastData = {
              error: {
                message: error?.message || "Bağlantı hatası."
              }
            };

            attempts.push({
              key: key.name,
              status: 502,
              message: lastData.error.message
            });

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

          // Kota veya geçici sunucu hatasında sonraki anahtarı dene.
          if (
            response.status === 429 ||
            response.status >= 500
          ) {
            continue;
          }

          // Diğer 4xx hatalarında anahtar değiştirmek genellikle çözmez.
          break;
        }

        const lastMessage =
          lastData?.error?.message ||
          lastData?.message ||
          "Ayrıntı alınamadı.";

        return jsonResponse({
          ok: false,
          error: `Gemini başarısız (HTTP ${lastStatus}): ${lastMessage}`,
          details: lastData,
          attempts,
          keysAvailable: keys.length,
          hint:
            lastStatus === 429
              ? "Tüm denenmiş anahtarlar kota sınırına takılmış olabilir. Google AI Studio'da proje kotasını, model limitlerini ve faturalandırmayı kontrol et."
              : "Gemini model adını, API erişimini ve Cloudflare dağıtımını kontrol et."
        }, lastStatus);
      }

      return jsonResponse({
        error: "Endpoint bulunamadı.",
        path,
        availableEndpoints: [
          "GET /health",
          "GET /tmdb/discover/movie",
          "GET /tmdb/search/movie",
          "GET /tmdb/genre/movie/list",
          "GET /tmdb/configuration/languages",
          "GET /tmdb/configuration/countries",
          "GET /tmdb/movie/details?id=123",
          "POST /gemini-interactions"
        ]
      }, 404);

    } catch (error) {
      console.error(
        "Worker hatası:",
        error?.message || error
      );

      return jsonResponse({
        error: "Worker içinde beklenmeyen hata.",
        details: error?.message || String(error)
      }, 500);
    }
  }
};
