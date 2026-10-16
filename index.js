
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
  return [
    env.GEMINI_API_KEY_1,
    env.GEMINI_API_KEY_2,
    env.GEMINI_API_KEY_3
  ].filter((key, index, all) =>
    typeof key === "string" &&
    key.trim() !== "" &&
    all.indexOf(key) === index
  );
}

async function tmdbRequest(path, params, env) {
  if (!env.TMDB_API_KEY) {
    throw new Error("TMDB_API_KEY Cloudflare gizli değişkeni tanımlanmamış.");
  }

  const target = new URL("https://api.themoviedb.org/3" + path);

  for (const [key, value] of params.entries()) {
    if (key !== "api_key") {
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
      status: response.status,
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

    if (method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: CORS_HEADERS
      });
    }

    try {
      // Worker ve API ayarlarını kontrol et.
      if (method === "GET" &&
          (path === "/" || path === "/health")) {
        return jsonResponse({
          ok: true,
          service: "film-proxy",
          tmdbConfigured: Boolean(env.TMDB_API_KEY),
          geminiKeysConfigured: getGeminiKeys(env).length
        });
      }

      // TMDB film keşfetme.
      if (method === "GET" &&
          path === "/tmdb/discover/movie") {
        return await tmdbRequest(
          "/discover/movie",
          url.searchParams,
          env
        );
      }

      // TMDB film arama.
      if (method === "GET" &&
          path === "/tmdb/search/movie") {
        return await tmdbRequest(
          "/search/movie",
          url.searchParams,
          env
        );
      }

      // Bütün film türlerini getir.
      if (method === "GET" &&
          path === "/tmdb/genre/movie/list") {
        const params = new URLSearchParams({
          language: url.searchParams.get("language") || "tr-TR"
        });

        return await tmdbRequest(
          "/genre/movie/list",
          params,
          env
        );
      }

      // Bütün orijinal dil seçeneklerini getir.
      if (method === "GET" &&
          path === "/tmdb/configuration/languages") {
        return await tmdbRequest(
          "/configuration/languages",
          new URLSearchParams(),
          env
        );
      }

      // Ülke seçeneklerini getir.
      if (method === "GET" &&
          path === "/tmdb/configuration/countries") {
        return await tmdbRequest(
          "/configuration/countries",
          new URLSearchParams({
            language: "tr-TR"
          }),
          env
        );
      }

      // Film ayrıntıları: ülke ve süre filtreleri için.
      if (method === "GET" &&
          path === "/tmdb/movie/details") {
        const id = url.searchParams.get("id");

        if (!id || !/^\d+$/.test(id)) {
          return jsonResponse({
            error: "Geçerli bir film ID değeri gerekli."
          }, 400);
        }

        return await tmdbRequest(
          `/movie/${id}`,
          new URLSearchParams({ language: "tr-TR" }),
          env
        );
      }

      // Gemini Interactions API.
      if (method === "POST" &&
          path === "/gemini-interactions") {
        const keys = getGeminiKeys(env);

        if (keys.length === 0) {
          return jsonResponse({
            error: "Gemini API anahtarı bulunamadı. Cloudflare üzerinde GEMINI_API_KEY_1, GEMINI_API_KEY_2 veya GEMINI_API_KEY_3 tanımla."
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
            error: "input alanında metin gönderilmelidir."
          }, 400);
        }

        let lastStatus = 502;
        let lastDetails = null;

        // Her tanımlı anahtarı en fazla bir kez dene.
        // Kota hatasında diğer anahtara geç.
        for (let i = 0; i < keys.length; i++) {
          let response;
          let data;

          try {
            response = await fetch(
              "https://generativelanguage.googleapis.com/v1beta/interactions",
              {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  "x-goog-api-key": keys[i]
                },
                body: JSON.stringify({
                  model: "gemini-3.8-flash",
                  input: prompt.trim(),
                  tools: [
                    { type: "google_search" }
                  ]
                })
              }
            );

            data = await response.json().catch(() => ({}));
          } catch (error) {
            lastStatus = 502;
            lastDetails = {
              message: error?.message || "Gemini bağlantı hatası."
            };
            continue;
          }

          if (response.ok) {
            let outputText =
              data.output_text ||
              data.outputText ||
              "";

            if (!outputText && Array.isArray(data.steps)) {
              outputText = data.steps
                .filter(step => step.type === "model_output")
                .flatMap(step => step.content || [])
                .filter(item => item.type === "text")
                .map(item => item.text || "")
                .join("\n");
            }

            if (!outputText && Array.isArray(data.outputs)) {
              outputText = data.outputs
                .map(item => item.text || "")
                .filter(Boolean)
                .join("\n");
            }

            return jsonResponse({
              ok: true,
              model: "gemini-3.8-flash",
              text: outputText,
              outputText,
              interaction: {
                ...data,
                outputText
              }
            });
          }

          lastStatus = response.status;
          lastDetails = data;

          // Kimlik doğrulama, kota veya sunucu hatasında
          // sıradaki anahtarı dene. Diğer 4xx hatalarında dur.
          const retryable = [
            401, 403, 408, 429, 500, 502, 503, 504
          ].includes(response.status);

          if (!retryable) break;
        }

        return jsonResponse({
          error: "Gemini isteği başarısız oldu. Anahtarları, model erişimini ve proje kotalarını kontrol et.",
          details: lastDetails,
          attemptedKeys: keys.length,
          status: lastStatus
        }, lastStatus >= 400 && lastStatus <= 599
          ? lastStatus
          : 502);
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
        error: error?.message ||
          "Worker içinde beklenmeyen hata oluştu."
      }, 500);
    }
  }
};
