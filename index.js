
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Expose-Headers": "X-Gemini-Diagnostics",
  "Content-Type": "application/json; charset=utf-8"
};

function jsonResponse(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...CORS_HEADERS,
      ...extraHeaders
    }
  });
}

function getGeminiKeys(env) {
  return [
    { name: "KEY_1", value: env.GEMINI_API_KEY_1 },
    { name: "KEY_2", value: env.GEMINI_API_KEY_2 },
    { name: "KEY_3", value: env.GEMINI_API_KEY_3 }
  ].filter((item, index, all) =>
    typeof item.value === "string" &&
    item.value.trim() !== "" &&
    all.findIndex(other => other.value === item.value) === index
  );
}

function errorMessage(data) {
  if (typeof data?.error?.message === "string") {
    return data.error.message;
  }

  if (typeof data?.message === "string") {
    return data.message;
  }

  if (typeof data?.error === "string") {
    return data.error;
  }

  return "Google ayrıntılı hata mesajı döndürmedi.";
}

async function tmdbRequest(path, params, env) {
  if (!env.TMDB_API_KEY) {
    throw new Error(
      "TMDB_API_KEY Cloudflare Secret alanında tanımlanmamış."
    );
  }

  const target = new URL(
    "https://api.themoviedb.org/3" + path
  );

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
      // Sağlık kontrolü
      if (
        method === "GET" &&
        (path === "/" || path === "/health")
      ) {
        return jsonResponse({
          ok: true,
          service: "film-proxy",
          tmdbConfigured: Boolean(env.TMDB_API_KEY),
          geminiKeysConfigured: getGeminiKeys(env).length
        });
      }

      // TMDB: film keşfetme
      if (
        method === "GET" &&
        path === "/tmdb/discover/movie"
      ) {
        return await tmdbRequest(
          "/discover/movie",
          url.searchParams,
          env
        );
      }

      // TMDB: film arama
      if (
        method === "GET" &&
        path === "/tmdb/search/movie"
      ) {
        return await tmdbRequest(
          "/search/movie",
          url.searchParams,
          env
        );
      }

      // TMDB: türler
      if (
        method === "GET" &&
        path === "/tmdb/genre/movie/list"
      ) {
        return await tmdbRequest(
          "/genre/movie/list",
          new URLSearchParams({
            language:
              url.searchParams.get("language") || "tr-TR"
          }),
          env
        );
      }

      // TMDB: diller
      if (
        method === "GET" &&
        path === "/tmdb/configuration/languages"
      ) {
        return await tmdbRequest(
          "/configuration/languages",
          new URLSearchParams(),
          env
        );
      }

      // TMDB: ülkeler
      if (
        method === "GET" &&
        path === "/tmdb/configuration/countries"
      ) {
        return await tmdbRequest(
          "/configuration/countries",
          new URLSearchParams({
            language: "tr-TR"
          }),
          env
        );
      }

      // TMDB: film ayrıntıları
      if (
        method === "GET" &&
        path === "/tmdb/movie/details"
      ) {
        const id = url.searchParams.get("id");

        if (!id || !/^\d+$/.test(id)) {
          return jsonResponse({
            error: "Geçerli bir film ID değeri gerekli."
          }, 400);
        }

        return await tmdbRequest(
          `/movie/${id}`,
          new URLSearchParams({
            language: "tr-TR"
          }),
          env
        );
      }

      // Gemini Interactions API
      if (
        method === "POST" &&
        path === "/gemini-interactions"
      ) {
        const keys = getGeminiKeys(env);

        if (keys.length === 0) {
          return jsonResponse({
            error:
              "Gemini anahtarı bulunamadı. " +
              "GEMINI_API_KEY_1, GEMINI_API_KEY_2 " +
              "veya GEMINI_API_KEY_3 tanımlanmalı."
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

        if (
          typeof prompt !== "string" ||
          !prompt.trim()
        ) {
          return jsonResponse({
            error: "input alanında metin gönderilmelidir."
          }, 400);
        }

        const attempts = [];
        let lastStatus = 502;
        let lastDetails = null;

        // Her farklı anahtarı sırayla dene.
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
              message:
                error?.message ||
                "Gemini bağlantı hatası."
            };

            attempts.push({
              key: key.name,
              status: 502,
              message: lastDetails.message
            });

            // Bağlantı hatasında sıradaki anahtarı dene.
            continue;
          }

          attempts.push({
            key: key.name,
            status: response.status,
            message: response.ok
              ? "Başarılı"
              : errorMessage(data)
          });

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

            const diagnosticHeader = attempts
              .map(item => `${item.key}:${item.status}`)
              .join(",");

            return jsonResponse({
              ok: true,
              model: "gemini-3.8-flash",
              text: outputText,
              outputText,
              attempts,
              interaction: {
                ...data,
                outputText
              }
            }, 200, {
              "X-Gemini-Diagnostics": diagnosticHeader
            });
          }

          lastStatus = response.status;
          lastDetails = data;

          // Kota, erişim veya geçici sunucu hatasında
          // sıradaki farklı anahtara geç.
          const retryable = [
            401, 403, 408, 429, 500, 502, 503, 504
          ].includes(response.status);

          if (!retryable) {
            break;
          }
        }

        const attemptSummary = attempts
          .map(item =>
            `${item.key}: HTTP ${item.status} — ${item.message}`
          )
          .join(" | ");

        return jsonResponse({
          ok: false,
          error:
            "Gemini isteği başarısız oldu. " +
            "Anahtar denemeleri: " + attemptSummary,
          status: lastStatus,
          attempts,
          details: lastDetails
        }, lastStatus >= 400 && lastStatus <= 599
          ? lastStatus
          : 502, {
          "X-Gemini-Diagnostics": attempts
            .map(item => `${item.key}:${item.status}`)
            .join(",")
        });
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
        error:
          error?.message ||
          "Worker içinde beklenmeyen hata oluştu."
      }, 500);
    }
  }
};
