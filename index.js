
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, Accept",
  "Access-Control-Max-Age": "86400",
  "Content-Type": "application/json; charset=utf-8"
};

const MODEL_DEFAULT = "gemini-3.8-flash";
const GEMINI_MIN_INTERVAL_MS = 12000;

let lastGeminiStart = 0;
let geminiQueue = Promise.resolve();

function json(data, status = 200, extra = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, ...extra }
  });
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function queuedGemini(task) {
  const run = geminiQueue.then(async () => {
    const wait = GEMINI_MIN_INTERVAL_MS - (Date.now() - lastGeminiStart);
    if (lastGeminiStart && wait > 0) await sleep(wait);
    lastGeminiStart = Date.now();
    return task();
  });

  geminiQueue = run.then(() => undefined, () => undefined);
  return run;
}

function uniqueKeys(env) {
  return [...new Set([
    env.GEMINI_API_KEY_1,
    env.GEMINI_API_KEY_2,
    env.GEMINI_API_KEY_3,
    env.GEMINI_API_KEY
  ].filter(v => typeof v === "string" && v.trim()).map(v => v.trim()))];
}

async function cacheGet(env, table, key, ttlSeconds = 1800) {
  if (!env.DB) return null;

  try {
    const row = await env.DB.prepare(
      `SELECT data_json, updated_at FROM ${table} WHERE cache_key = ?`
    ).bind(key).first();

    if (!row?.data_json ||
        Date.now() / 1000 - Number(row.updated_at) > ttlSeconds) {
      return null;
    }

    return JSON.parse(row.data_json);
  } catch {
    return null;
  }
}

async function cachePut(env, table, key, data) {
  if (!env.DB) return;

  try {
    await env.DB.prepare(`
      INSERT INTO ${table} (cache_key, data_json, updated_at)
      VALUES (?, ?, ?)
      ON CONFLICT(cache_key) DO UPDATE SET
        data_json = excluded.data_json,
        updated_at = excluded.updated_at
    `).bind(
      key,
      JSON.stringify(data),
      Math.floor(Date.now() / 1000)
    ).run();
  } catch {
    // Önbellek hatası canlı isteği durdurmaz.
  }
}

async function movieCacheGet(env, id) {
  if (!env.DB) return null;

  try {
    const row = await env.DB.prepare(
      "SELECT data_json, updated_at FROM movie_cache WHERE tmdb_id = ?"
    ).bind(id).first();

    if (!row?.data_json ||
        Date.now() / 1000 - Number(row.updated_at) > 86400) {
      return null;
    }

    return JSON.parse(row.data_json);
  } catch {
    return null;
  }
}

async function movieCachePut(env, id, data, source = "tmdb") {
  if (!env.DB) return;

  try {
    await env.DB.prepare(`
      INSERT INTO movie_cache (tmdb_id, data_json, source, updated_at)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(tmdb_id) DO UPDATE SET
        data_json = excluded.data_json,
        source = excluded.source,
        updated_at = excluded.updated_at
    `).bind(
      id,
      JSON.stringify(data),
      source,
      Math.floor(Date.now() / 1000)
    ).run();
  } catch {}
}

async function tmdbFetch(path, params, env) {
  if (!env.TMDB_API_KEY) {
    throw Object.assign(
      new Error("TMDB_API_KEY Cloudflare Secret olarak tanımlanmamış."),
      { status: 500 }
    );
  }

  const url = new URL(`https://api.themoviedb.org/3/${path}`);

  for (const [key, value] of params) {
    url.searchParams.set(key, value);
  }

  url.searchParams.set("api_key", env.TMDB_API_KEY);

  const response = await fetch(url.toString(), {
    headers: { Accept: "application/json" },
    cf: {
      cacheTtl:
        path.includes("images") ||
        path.includes("genre/") ||
        path.includes("configuration/")
          ? 86400
          : 1800,
      cacheEverything: true
    }
  });

  const body = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw Object.assign(
      new Error(body.status_message || `TMDB HTTP ${response.status}`),
      { status: response.status, details: body }
    );
  }

  return body;
}

async function tmdbRequest(tmdbPath, params, env) {
  const key = `${tmdbPath}?${[...params.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join("&")}`;

  if (tmdbPath.startsWith("movie/") &&
      /^movie\/\d+$/.test(tmdbPath)) {
    const id = Number(tmdbPath.split("/")[1]);
    const cached = await movieCacheGet(env, id);

    if (cached) return cached;

    const data = await tmdbFetch(tmdbPath, params, env);
    await movieCachePut(env, id, data);
    return data;
  }

  const ttl =
    tmdbPath.startsWith("configuration/") ||
    tmdbPath.startsWith("genre/")
      ? 86400
      : 1800;

  const cached = await cacheGet(env, "search_cache", key, ttl);
  if (cached) return cached;

  const data = await tmdbFetch(tmdbPath, params, env);
  await cachePut(env, "search_cache", key, data);

  return data;
}

/* OMDb: IMDb puanı, oy sayısı, IMDb kimliği ve film bilgileri. */
async function omdbRequest(params, env) {
  if (!env.OMDB_API_KEY) {
    throw Object.assign(
      new Error("OMDB_API_KEY Cloudflare Secret olarak tanımlanmamış."),
      { status: 500 }
    );
  }

  const clean = new URLSearchParams(params);
  clean.delete("apikey");

  if (!clean.has("i") && !clean.has("t")) {
    throw Object.assign(
      new Error("OMDb için IMDb ID'si (i) veya film adı (t) gerekli."),
      { status: 400 }
    );
  }

  clean.set("apikey", env.OMDB_API_KEY);

  const cacheKey = "omdb:" + [...clean.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join("&");

  const cached = await cacheGet(
    env,
    "search_cache",
    cacheKey,
    86400
  );

  if (cached) return cached;

  let response;

  try {
    response = await fetch(
      `https://www.omdbapi.com/?${clean.toString()}`,
      {
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout
          ? AbortSignal.timeout(12000)
          : undefined
      }
    );
  } catch (e) {
    throw Object.assign(
      new Error(`OMDb bağlantı hatası: ${e.message || "Ağ hatası"}`),
      { status: 502 }
    );
  }

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw Object.assign(
      new Error(data.Error || `OMDb HTTP ${response.status}`),
      { status: response.status, details: data }
    );
  }

  if (data.Response === "False") {
    throw Object.assign(
      new Error(data.Error || "OMDb film bulamadı."),
      { status: 404, details: data }
    );
  }

  await cachePut(env, "search_cache", cacheKey, data);
  return data;
}

async function fetchImageBase64(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 6000);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      cf: { cacheTtl: 86400, cacheEverything: true }
    });

    if (!response.ok) return null;

    const mime = (response.headers.get("content-type") || "")
      .split(";")[0].toLowerCase();

    if (!mime.startsWith("image/")) return null;

    const buffer = await response.arrayBuffer();
    if (!buffer.byteLength || buffer.byteLength > 450000) return null;

    const bytes = new Uint8Array(buffer);
    let binary = "";

    for (let i = 0; i < bytes.length; i += 32768) {
      binary += String.fromCharCode(
        ...bytes.subarray(i, Math.min(i + 32768, bytes.length))
      );
    }

    return {
      data: btoa(binary),
      mime_type: mime === "image/jpg" ? "image/jpeg" : mime
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function outputText(data) {
  if (typeof data.output_text === "string") return data.output_text;
  if (typeof data.outputText === "string") return data.outputText;

  return (data.steps || [])
    .filter(step => step.type === "model_output")
    .flatMap(step => step.content || [])
    .filter(content => content.type === "text")
    .map(content => content.text || "")
    .join("\n");
}

async function callGemini(payload, env) {
  const keys = uniqueKeys(env);

  if (!keys.length) {
    throw Object.assign(
      new Error(
        "GEMINI_API_KEY_1, _2, _3 veya GEMINI_API_KEY Cloudflare Secret olarak tanımlanmamış."
      ),
      { status: 500 }
    );
  }

  let last = null;
  const attempts = [];

  for (let i = 0; i < keys.length; i++) {
    try {
      const response = await fetch(
        "https://generativelanguage.googleapis.com/v1beta/interactions",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-goog-api-key": keys[i]
          },
          body: JSON.stringify(payload),
          signal: AbortSignal.timeout
            ? AbortSignal.timeout(45000)
            : undefined
        }
      );

      const body = await response.json().catch(() => ({}));

      if (response.ok) return { body, attempts };

      const message =
        body.error?.message || body.message || `HTTP ${response.status}`;

      attempts.push({
        keyNumber: i + 1,
        status: response.status,
        message
      });

      last = { status: response.status, message, body };

      if (response.status !== 429 &&
          response.status !== 503 &&
          response.status < 500) {
        break;
      }
    } catch (e) {
      attempts.push({
        keyNumber: i + 1,
        status: 0,
        message: e.message || "Bağlantı hatası"
      });

      last = {
        status: 502,
        message: e.message || "Gemini bağlantı hatası"
      };
    }
  }

  throw Object.assign(
    new Error(last?.message || "Gemini anahtarlarının hiçbiri yanıt vermedi."),
    {
      status: last?.status || 502,
      attempts,
      details: last?.body
    }
  );
}

async function analyseMovies(movies, target, env) {
  if (!Array.isArray(movies) || !movies.length) {
    throw Object.assign(new Error("movies dizisi boş."), { status: 400 });
  }

  if (movies.length > 4) {
    throw Object.assign(
      new Error("Tek istekte en fazla 4 film analiz edilebilir."),
      { status: 400 }
    );
  }

  const valid = movies.filter(
    movie => Number.isInteger(Number(movie.id)) && Number(movie.id) > 0
  );

  if (!valid.length) {
    throw Object.assign(new Error("Geçerli film ID'si yok."), { status: 400 });
  }

  const cached = new Map();
  const uncached = [];

  for (const movie of valid) {
    const id = Number(movie.id);
    const key = `night-v1:${id}:${env.MODEL_NAME || MODEL_DEFAULT}`;
    let row = null;

    if (env.DB) {
      try {
        const result = await env.DB.prepare(
          "SELECT data_json, updated_at FROM ai_analysis_cache WHERE cache_key = ?"
        ).bind(key).first();

        if (result?.data_json &&
            Date.now() / 1000 - Number(result.updated_at) <= 2592000) {
          row = JSON.parse(result.data_json);
        }
      } catch {}
    }

    if (row) cached.set(id, row);
    else uncached.push(movie);
  }

  let attempts = [];
  let imagesProvided = 0;

  if (uncached.length) {
    const input = [];
    const meta = [];

    for (const movie of uncached) {
      let data = { backdrops: [] };

      try {
        data = await tmdbFetch(
          `movie/${Number(movie.id)}/images`,
          new URLSearchParams({ include_image_language: "en,null" }),
          env
        );
      } catch {}

      const images = [];

      for (const backdrop of (data.backdrops || []).slice(0, 2)) {
        if (!backdrop.file_path) continue;

        const image = await fetchImageBase64(
          `https://image.tmdb.org/t/p/w300${backdrop.file_path}`
        );

        if (image) images.push(image);
      }

      meta.push({
        id: Number(movie.id),
        title: String(movie.title || movie.original_title || "Bilinmeyen film"),
        year: String(movie.year || ""),
        images: images.length
      });

      input.push({
        type: "text",
        text: `Film ID ${movie.id}: ${movie.title || movie.original_title || ""} (${movie.year || "yıl bilinmiyor"}). Ardından bu filme ait görseller gelir.`
      });

      for (const image of images) {
        input.push({
          type: "image",
          data: image.data,
          mime_type: image.mime_type
        });
      }
    }

    const withImages = meta.filter(movie => movie.images > 0);
    imagesProvided = withImages.reduce((sum, movie) => sum + movie.images, 0);

    if (!withImages.length) {
      if (cached.size) {
        return {
          analyses: [...cached.values()],
          model: env.MODEL_NAME || MODEL_DEFAULT,
          imagesProvided: 0,
          cacheHits: cached.size
        };
      }

      throw Object.assign(
        new Error("TMDB'den analiz için sahne görseli alınamadı."),
        { status: 502 }
      );
    }

    const prompt = `
Film sahnelerinin ışık koşullarını yalnızca bu istekteki TMDB
görsellerine göre tahmin et. Harici web araştırması yapma.
Görseller tüm filmi temsil etmeyebilir; tahmin olduğunu belirt.
Her film için gece yüzdesi 0-100 tam sayı, gündüz=100-gece,
güven, görsel ton ve kısa ışık özeti üret.
Görseli olmayan filmleri ekleme.
Hedef gece oranı ${Math.max(0, Math.min(100, Number(target) || 50))}%.
Filmler: ${JSON.stringify(withImages)}.
`;

    input.unshift({ type: "text", text: prompt });

    const schema = {
      type: "object",
      properties: {
        analyses: {
          type: "array",
          items: {
            type: "object",
            properties: {
              id: { type: "integer" },
              night: { type: "integer" },
              day: { type: "integer" },
              confidence: { type: "string" },
              visual_tone: { type: "string" },
              lighting_summary: { type: "string" }
            },
            required: [
              "id",
              "night",
              "day",
              "confidence",
              "visual_tone",
              "lighting_summary"
            ]
          }
        }
      },
      required: ["analyses"]
    };

    const result = await queuedGemini(() =>
      callGemini({
        model: env.MODEL_NAME || MODEL_DEFAULT,
        input,
        response_format: {
          type: "text",
          mime_type: "application/json",
          schema
        }
      }, env)
    );

    attempts = result.attempts;

    let parsed;

    try {
      parsed = JSON.parse(outputText(result.body));
    } catch {
      throw Object.assign(
        new Error("Gemini yanıtı geçerli JSON değil."),
        {
          status: 502,
          details: {
            response: outputText(result.body).slice(0, 800)
          }
        }
      );
    }

    const allowed = new Set(withImages.map(movie => movie.id));

    for (const analysis of parsed.analyses || []) {
      const id = Number(analysis.id);
      if (!allowed.has(id)) continue;

      const night = Math.max(
        0,
        Math.min(100, Math.round(Number(analysis.night) || 0))
      );

      const item = {
        id,
        night,
        day: 100 - night,
        confidence: analysis.confidence || "düşük",
        visual_tone: analysis.visual_tone || "",
        lighting_summary: analysis.lighting_summary || ""
      };

      cached.set(id, item);

      if (env.DB) {
        const key = `night-v1:${id}:${env.MODEL_NAME || MODEL_DEFAULT}`;

        try {
          await env.DB.prepare(`
            INSERT INTO ai_analysis_cache
              (cache_key, tmdb_id, analysis_type, model, data_json, updated_at)
            VALUES (?, ?, ?, ?, ?, ?)
            ON CONFLICT(cache_key) DO UPDATE SET
              data_json = excluded.data_json,
              updated_at = excluded.updated_at
          `).bind(
            key,
            id,
            "night-ratio",
            env.MODEL_NAME || MODEL_DEFAULT,
            JSON.stringify(item),
            Math.floor(Date.now() / 1000)
          ).run();
        } catch {}
      }
    }
  }

  return {
    analyses: valid
      .map(movie => cached.get(Number(movie.id)))
      .filter(Boolean),
    model: env.MODEL_NAME || MODEL_DEFAULT,
    imagesProvided,
    cacheHits: cached.size - uncached.length,
    attempts
  };
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, "") || "/";

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS });
    }

    try {
      if (request.method === "GET" &&
          (path === "/" || path === "/health")) {
        return json({
          ok: true,
          service: "film-proxy",
          tmdbConfigured: Boolean(env.TMDB_API_KEY),
          omdbConfigured: Boolean(env.OMDB_API_KEY),
          geminiKeysConfigured: uniqueKeys(env).length,
          model: env.MODEL_NAME || MODEL_DEFAULT,
          d1Configured: Boolean(env.DB),
          endpoints: [
            "GET /tmdb/discover/movie",
            "GET /tmdb/search/movie",
            "GET /tmdb/genre/movie/list",
            "GET /tmdb/configuration/languages",
            "GET /tmdb/configuration/countries",
            "GET /tmdb/movie/details?id=123",
            "GET /omdb?i=tt0133093",
            "GET /omdb?t=The%20Matrix&y=1999",
            "POST /gemini-interactions"
          ]
        });
      }

      /* OMDb uç noktası: IMDb ID veya film adıyla arama. */
      if (request.method === "GET" &&
          (path === "/omdb" || path === "/omdb-by-imdb")) {
        try {
          return json(
            await omdbRequest(url.searchParams, env),
            200,
            { "Cache-Control": "public, max-age=3600" }
          );
        } catch (e) {
          return json({
            error: e.message || "OMDb isteği başarısız.",
            details: e.details || null
          }, e.status || 502);
        }
      }

      if (request.method === "GET" && path.startsWith("/tmdb/")) {
        let tmdbPath;
        let params = new URLSearchParams(url.searchParams);

        if (path === "/tmdb/discover/movie") {
          tmdbPath = "discover/movie";
        } else if (path === "/tmdb/search/movie") {
          tmdbPath = "search/movie";
        } else if (path === "/tmdb/genre/movie/list") {
          tmdbPath = "genre/movie/list";
        } else if (path === "/tmdb/configuration/languages") {
          tmdbPath = "configuration/languages";
          params = new URLSearchParams();
        } else if (path === "/tmdb/configuration/countries") {
          tmdbPath = "configuration/countries";
          params = new URLSearchParams();
        } else if (path === "/tmdb/movie/details") {
          const id = Number(url.searchParams.get("id"));

          if (!Number.isInteger(id) || id <= 0) {
            return json(
              { error: "Geçerli film id parametresi gerekli." },
              400
            );
          }

          tmdbPath = `movie/${id}`;
          params.delete("id");
          params.set("append_to_response", "external_ids,credits");
        } else {
          return json({ error: "TMDB uç noktası bulunamadı.", path }, 404);
        }

        try {
          return json(
            await tmdbRequest(tmdbPath, params, env),
            200,
            { "Cache-Control": "public, max-age=300" }
          );
        } catch (e) {
          return json({
            error: e.message,
            details: e.details || null
          }, e.status || 502);
        }
      }

      if (request.method === "POST" && path === "/gemini-interactions") {
        let body;

        try {
          body = await request.json();
        } catch {
          return json({ error: "İstek gövdesi geçerli JSON değil." }, 400);
        }

        if (Array.isArray(body.movies)) {
          try {
            return json(
              await analyseMovies(body.movies, body.night_target, env)
            );
          } catch (e) {
            return json({
              error: e.message || "Gemini analizi başarısız.",
              details: e.details || null,
              attempts: e.attempts || []
            }, e.status || 500);
          }
        }

        if (typeof body.input !== "string" || !body.input.trim()) {
          return json({
            error: "movies dizisi veya input metni gönderilmelidir."
          }, 400);
        }

        try {
          const result = await queuedGemini(() =>
            callGemini({
              model: env.MODEL_NAME || MODEL_DEFAULT,
              input: body.input.trim()
            }, env)
          );

          const text = outputText(result.body);

          return json({
            ok: true,
            model: env.MODEL_NAME || MODEL_DEFAULT,
            text,
            outputText: text,
            interaction: { outputText: text },
            attempts: result.attempts
          });
        } catch (e) {
          return json({
            error: e.message,
            attempts: e.attempts || []
          }, e.status || 500);
        }
      }

      return json({ error: "Endpoint bulunamadı.", path }, 404);
    } catch (e) {
      return json({
        error: e.message || "Worker içinde beklenmeyen hata."
      }, e.status || 500);
    }
  }
};
