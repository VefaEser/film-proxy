const MODEL_DEFAULT = "gemini-3.8-flash";
const TMDB_BASE = "https://api.themoviedb.org/3";
const GOOGLE_INTERACTIONS =
  "https://generativelanguage.googleapis.com/v1beta/interactions";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type,Authorization",
  "Access-Control-Max-Age": "86400"
};

function response(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...CORS,
      "Content-Type": "application/json; charset=utf-8"
    }
  });
}

function jsonError(message, status = 500, extra = {}) {
  return response({ error: String(message), ...extra }, status);
}

function safeJSON(text, fallback = null) {
  try {
    return JSON.parse(text);
  } catch {
    return fallback;
  }
}

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function yearOf(movie) {
  return Number(
    String(movie.release_date || "").slice(0, 4)
  ) || Number(movie.year) || 0;
}

function cacheKey(prefix, value) {
  return `${prefix}:${encodeURIComponent(String(value)).slice(0, 450)}`;
}

async function fetchJSON(url, options = {}, label = "Uzak servis") {
  const res = await fetch(url, {
    ...options,
    signal: AbortSignal.timeout(18000)
  });

  const body = await res.text();
  const data = safeJSON(body);

  if (!res.ok) {
    throw new Error(
      `${label}: HTTP ${res.status} ${body.slice(0, 500)}`
    );
  }

  if (data === null) {
    throw new Error(`${label}: Geçerli JSON yanıtı alınamadı.`);
  }

  return data;
}

/* D1 önbelleği */

async function cacheGet(env, key) {
  if (!env.DB) return null;

  try {
    const row = await env.DB.prepare(
      "SELECT data_json, updated_at FROM search_cache WHERE cache_key = ?"
    ).bind(key).first();

    if (!row || !row.data_json) return null;

    if (Date.now() / 1000 - Number(row.updated_at) > 30 * 86400) {
      return null;
    }

    return safeJSON(row.data_json);
  } catch (error) {
    console.error("D1 okuma hatası:", error.message);
    return null;
  }
}

async function cachePut(env, key, data) {
  if (!env.DB) return;

  try {
    await env.DB.prepare(
      `INSERT INTO search_cache
       (cache_key, data_json, updated_at)
       VALUES (?, ?, ?)
       ON CONFLICT(cache_key) DO UPDATE SET
       data_json = excluded.data_json,
       updated_at = excluded.updated_at`
    ).bind(
      key,
      JSON.stringify(data),
      Math.floor(Date.now() / 1000)
    ).run();
  } catch (error) {
    console.error("D1 yazma hatası:", error.message);
  }
}

async function cachedJSON(env, key, ttlSeconds, fetcher) {
  const cached = await cacheGet(env, key);

  if (
    cached &&
    cached._cachedAt &&
    Date.now() / 1000 - Number(cached._cachedAt) < ttlSeconds
  ) {
    return cached.value;
  }

  const value = await fetcher();

  await cachePut(env, key, {
    _cachedAt: Math.floor(Date.now() / 1000),
    value
  });

  return value;
}

/* TMDB */

async function tmdb(env, path, params = {}) {
  if (!env.TMDB_API_KEY) {
    throw new Error(
      "TMDB_API_KEY tanımlı değil. Cloudflare Worker Secrets bölümünü kontrol et."
    );
  }

  const url = new URL(TMDB_BASE + path);
  url.searchParams.set("api_key", env.TMDB_API_KEY);

  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== "") {
      url.searchParams.set(key, String(value));
    }
  }

  const cacheURL = new URL(url);
  cacheURL.searchParams.delete("api_key");

  const key = cacheKey("tmdb", cacheURL.toString());

  return cachedJSON(env, key, 86400, () =>
    fetchJSON(url.toString(), {}, "TMDB")
  );
}

async function tmdbRoute(env, url) {
  const path = url.pathname.replace(/^\/tmdb/, "");

  if (path === "/genre/movie/list") {
    return tmdb(env, path, {
      language: url.searchParams.get("language") || "tr-TR"
    });
  }

  if (path === "/configuration/languages") {
    return tmdb(env, path);
  }

  if (path === "/configuration/countries") {
    return tmdb(env, path, {
      language: url.searchParams.get("language") || "tr-TR"
    });
  }

  if (path === "/discover/movie") {
    const allowed = [
      "language",
      "sort_by",
      "vote_average.gte",
      "vote_average.lte",
      "vote_count.gte",
      "page",
      "primary_release_date.gte",
      "primary_release_date.lte",
      "with_genres",
      "without_genres",
      "with_original_language",
      "with_origin_country",
      "with_runtime.gte",
      "with_runtime.lte",
      "with_watch_monetization_types",
      "include_adult"
    ];

    const params = {};

    for (const key of allowed) {
      if (url.searchParams.has(key)) {
        params[key] = url.searchParams.get(key);
      }
    }

    return tmdb(env, path, params);
  }

  if (path === "/search/movie") {
    return tmdb(env, path, {
      query: url.searchParams.get("query") || "",
      language: url.searchParams.get("language") || "tr-TR",
      page: url.searchParams.get("page") || "1",
      include_adult: "false"
    });
  }

  if (path === "/movie/details") {
    const id = url.searchParams.get("id");

    if (!id || !/^\d+$/.test(id)) {
      throw new Error("TMDB film ID geçersiz.");
    }

    const language = url.searchParams.get("language") || "tr-TR";

    const [movie, credits] = await Promise.all([
      tmdb(env, `/movie/${id}`, { language }),
      tmdb(env, `/movie/${id}/credits`)
    ]);

    const external = await tmdb(
      env,
      `/movie/${id}/external_ids`
    ).catch(() => ({}));

    const imdbID = movie.imdb_id || external.imdb_id || null;

    let imdb = null;

    if (imdbID && env.OMDB_API_KEY) {
      try {
        imdb = await omdb(env, { i: imdbID });
      } catch (error) {
        console.error("IMDb bilgisi alınamadı:", error.message);
      }
    }

    const directors = (credits.crew || [])
      .filter(person => person.job === "Director")
      .map(person => person.name);

    return {
      ...movie,
      imdb_id: imdbID,
      credits,
      directors,
      imdbRating: imdb?.imdbRating || null,
      imdbVotes: imdb?.imdbVotes || null,
      imdbYear: imdb?.Year || null
    };
  }

  throw new Error(`Bilinmeyen TMDB uç noktası: ${path}`);
}

/* OMDb */

async function omdb(env, params = {}) {
  if (!env.OMDB_API_KEY) {
    throw new Error("OMDB_API_KEY tanımlı değil.");
  }

  const url = new URL("https://www.omdbapi.com/");
  url.searchParams.set("apikey", env.OMDB_API_KEY);

  for (const [key, value] of Object.entries(params)) {
    if (value) url.searchParams.set(key, String(value));
  }

  const safeURL = new URL(url);
  safeURL.searchParams.set("apikey", "KEY");

  return cachedJSON(
    env,
    cacheKey("omdb", safeURL.toString()),
    7 * 86400,
    async () => {
      const data = await fetchJSON(url.toString(), {}, "OMDb");

      if (data.Response === "False") {
        throw new Error(data.Error || "OMDb sonucu bulunamadı.");
      }

      return data;
    }
  );
}

/* Wikidata */

async function wikidata(env, movie) {
  const title = movie.original_title || movie.title || "";
  const year = yearOf(movie);

  if (!title) {
    return {
      items: [],
      filmingLocations: [],
      originalWork: null
    };
  }

  const key = cacheKey(
    "wikidata",
    `${title}|${year}`
  );

  return cachedJSON(env, key, 30 * 86400, async () => {
    const escaped = title
      .replace(/\\/g, "\\\\")
      .replace(/"/g, '\\"');

    const query = `
SELECT ?item ?itemLabel ?itemDescription
       ?originalWorkLabel ?filmingLocationLabel WHERE {
  ?item wdt:P31 wd:Q11424;
        rdfs:label ?label.
  FILTER(LANG(?label)="en" &&
         LCASE(STR(?label))=LCASE("${escaped}"))
  OPTIONAL { ?item wdt:P144 ?originalWork. }
  OPTIONAL { ?item wdt:P915 ?filmingLocation. }
  OPTIONAL { ?item wdt:P577 ?date. }
  OPTIONAL {
    ?item schema:description ?itemDescription.
    FILTER(LANG(?itemDescription)="en")
  }
  SERVICE wikibase:label {
    bd:serviceParam wikibase:language "en,tr".
  }
  ${
    year
      ? `FILTER(!BOUND(?date) ||
          (YEAR(?date) >= ${year - 1} &&
           YEAR(?date) <= ${year + 1}))`
      : ""
  }
}
LIMIT 8`;

    const url =
      "https://query.wikidata.org/sparql?query=" +
      encodeURIComponent(query);

    const data = await fetchJSON(url, {
      headers: {
        Accept: "application/sparql-results+json",
        "User-Agent": "FilmKesifMotoru/1.0"
      }
    }, "Wikidata");

    const bindings = data.results?.bindings || [];

    return {
      items: bindings.map(item => ({
        label: item.itemLabel?.value || "",
        description: item.itemDescription?.value || "",
        originalWork: item.originalWorkLabel?.value || "",
        filmingLocation: item.filmingLocationLabel?.value || ""
      })),
      originalWork:
        bindings.find(item => item.originalWorkLabel)
          ?.originalWorkLabel?.value || null,
      filmingLocations: [
        ...new Set(
          bindings
            .map(item => item.filmingLocationLabel?.value)
            .filter(Boolean)
        )
      ]
    };
  });
}

/* Wikimedia Commons */

async function commons(env, movie) {
  const title = movie.original_title || movie.title || "";

  if (!title) return { images: [] };

  const key = cacheKey("commons", title);

  return cachedJSON(env, key, 14 * 86400, async () => {
    const url = new URL("https://commons.wikimedia.org/w/api.php");

    url.searchParams.set("action", "query");
    url.searchParams.set("format", "json");
    url.searchParams.set("generator", "search");
    url.searchParams.set(
      "gsrsearch",
      `filetype:bitmap "${title}" film`
    );
    url.searchParams.set("gsrnamespace", "6");
    url.searchParams.set("gsrlimit", "5");
    url.searchParams.set("prop", "imageinfo");
    url.searchParams.set("iiprop", "url|extmetadata");
    url.searchParams.set("iiurlwidth", "640");

    const data = await fetchJSON(url.toString(), {
      headers: { "User-Agent": "FilmKesifMotoru/1.0" }
    }, "Wikimedia Commons");

    const pages = Object.values(data.query?.pages || {});

    return {
      images: pages.map(page => {
        const info = page.imageinfo?.[0] || {};
        const meta = info.extmetadata || {};

        return {
          title: page.title || "",
          url: info.thumburl || info.url || "",
          pageUrl: info.descriptionurl || "",
          license:
            meta.LicenseShortName?.value ||
            "Lisans bilgisi belirtilmemiş",
          artist: meta.Artist?.value || "",
          attribution: meta.Attribution?.value || ""
        };
      }).filter(image => image.url)
    };
  });
}

/* Tavily web araştırması */

async function tavily(env, query) {
  if (!env.TAVILY_API_KEY) {
    return {
      results: [],
      warning: "TAVILY_API_KEY tanımlı değil."
    };
  }

  const key = cacheKey("tavily", query);

  return cachedJSON(env, key, 7 * 86400, async () => {
    const data = await fetchJSON(
      "https://api.tavily.com/search",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          api_key: env.TAVILY_API_KEY,
          query,
          search_depth: "basic",
          max_results: 5,
          include_answer: false,
          include_raw_content: false
        })
      },
      "Tavily"
    );

    return {
      results: (data.results || []).map(item => ({
        title: item.title || "",
        url: item.url || "",
        content: (item.content || "").slice(0, 1800),
        score: item.score || 0
      }))
    };
  });
}

/* Gemini Interactions API */

function extractText(data) {
  if (typeof data?.output_text === "string") {
    return data.output_text;
  }

  if (typeof data?.text === "string") {
    return data.text;
  }

  const outputs = data?.outputs || data?.output || [];
  const list = Array.isArray(outputs) ? outputs : [outputs];
  const texts = [];

  for (const output of list) {
    if (typeof output?.text === "string") {
      texts.push(output.text);
    }

    for (const content of output?.content || []) {
      if (typeof content?.text === "string") {
        texts.push(content.text);
      }
    }
  }

  return texts.join("\n");
}

async function callGemini(env, prompt) {
  const keys = [
    env.GEMINI_API_KEY_1,
    env.GEMINI_API_KEY_2,
    env.GEMINI_API_KEY_3
  ].filter(key => typeof key === "string" && key.trim());

  if (!keys.length) {
    throw new Error(
      "GEMINI_API_KEY_1, GEMINI_API_KEY_2 veya GEMINI_API_KEY_3 Secret'larından en az biri tanımlanmalı."
    );
  }

  const model = env.GEMINI_MODEL || MODEL_DEFAULT;
  let lastError;

  for (let index = 0; index < keys.length; index++) {
    try {
      const data = await fetchJSON(
        GOOGLE_INTERACTIONS,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-goog-api-key": keys[index]
          },
          body: JSON.stringify({
            model,
            input: prompt
          })
        },
        "Gemini Interactions"
      );

      const text = extractText(data);

      if (!text) {
        throw new Error("Gemini yanıtında metin bulunamadı.");
      }

      return text;
    } catch (error) {
      lastError = error;

      const message = String(error.message || error);
      const retryable =
        /HTTP (400|401|403|404|429|500|502|503|504)|quota|rate.?limit|temporar/i
          .test(message);

      if (!retryable) throw error;

      if (index < keys.length - 1) {
        await wait(1000 * (index + 1));
      }
    }
  }

  throw lastError || new Error("Gemini isteği başarısız.");
}

function extractJSON(text) {
  const clean = String(text)
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "")
    .trim();

  const start = clean.indexOf("{");
  const end = clean.lastIndexOf("}");

  if (start < 0 || end < start) {
    throw new Error("Gemini geçerli JSON döndürmedi.");
  }

  return JSON.parse(clean.slice(start, end + 1));
}

/* Film kaynaklarını toplama */

async function researchOne(env, movie, settings) {
  const title = movie.original_title || movie.title || "";
  const year = yearOf(movie);

  const [omdbData, wikidataData, commonsData, webData] =
    await Promise.all([
      (async () => {
        if (!env.OMDB_API_KEY) return null;

        try {
          if (movie.imdb_id) {
            return await omdb(env, { i: movie.imdb_id });
          }

          return await omdb(env, {
            t: title,
            ...(year ? { y: String(year) } : {})
          });
        } catch (error) {
          console.error("OMDb:", error.message);
          return null;
        }
      })(),

      wikidata(env, movie).catch(error => ({
        items: [],
        filmingLocations: [],
        warning: error.message
      })),

      commons(env, movie).catch(error => ({
        images: [],
        warning: error.message
      })),

      settings.useWebResearch
        ? tavily(
            env,
            `${title} ${year || ""} film plot filming locations cinematography reviews`
          ).catch(error => ({
            results: [],
            warning: error.message
          }))
        : Promise.resolve({ results: [] })
    ]);

  return {
    omdb: omdbData ? {
      imdbRating: omdbData.imdbRating || null,
      imdbVotes: omdbData.imdbVotes || null,
      imdbID: omdbData.imdbID || null,
      Year: omdbData.Year || null,
      Director: omdbData.Director || null
    } : null,
    wikidata: wikidataData,
    commons: commonsData,
    web: webData
  };
}

/* AI analiz önbelleği */

async function analyseBatch(env, movies, filters, settings) {
  const output = [];

  for (let offset = 0; offset < movies.length; offset += 4) {
    const batch = movies.slice(offset, offset + 4);
    const pending = [];

    for (const movie of batch) {
      const key = cacheKey(
        "analysis",
        JSON.stringify({
          id: movie.id,
          filters,
          useAI: settings.useAI,
          useWebResearch: settings.useWebResearch
        })
      );

      const cached = await cacheGet(env, key);

      if (cached?.result) {
        output.push(cached.result);
      } else {
        const sources = await researchOne(env, movie, settings);
        pending.push({ movie, sources, key });
      }
    }

    if (!pending.length) continue;

    let aiById = {};

    if (settings.useAI) {
      const prompt = `
Sen bir film araştırma asistanısın.
Yalnızca verilen kaynaklara dayan. Kanıt yoksa tahmin üretme.
Hikâyenin geçtiği yer ile gerçek çekim yerini birbirinden ayır.
Kaynakların doğrulamadığı bilgileri kesin bilgi olarak sunma.

Kullanıcı filtreleri:
${JSON.stringify(filters)}

Her film için aşağıdaki alanları mümkün olduğunca değerlendir:
- id
- night (gece sahnesi yüzdesi, 0-100 veya null)
- day (gündüz sahnesi yüzdesi, 0-100 veya null)
- confidence ("low", "medium", "high")
- visual_tone
- lighting_summary
- indoor_ratio (0-100 veya null)
- location_count
- dialogue_density (0-100 veya null)
- color_ratio (0-100 veya null)
- aspect_ratio
- season
- filter_match (true, false veya null)
- filter_reasons (dizi)
- evidence (dizi)
- related_films (dizi)
- original_work
- filming_locations (dizi)
- family_content (nesne)

Gece ve gündüz yüzdeleri toplamı yaklaşık 100 olmalı.
Yeterli kanıt yoksa ilgili yüzdeyi null döndür.
IMDb bilgileri mevcutsa onları kullan; uydurma.
Kaynak adreslerini koru.
Sadece JSON döndür:
{"movies":[{"id":123,"night":50,"day":50}]}

Film verileri ve araştırma kaynakları:
${JSON.stringify(pending.map(item => ({
  movie: item.movie,
  sources: item.sources
})))}
`;

      const raw = await callGemini(env, prompt);
      const parsed = extractJSON(raw);

      for (const item of parsed.movies || []) {
        const id = Number(item.id);
        if (Number.isFinite(id)) aiById[id] = item;
      }
    }

    for (const item of pending) {
      const movie = item.movie;
      const sources = item.sources;
      const ai = aiById[Number(movie.id)] || {};
      const imdb = sources.omdb || {};

      const analysis = {
        id: movie.id,
        night: ai.night ?? null,
        day: ai.day ?? null,
        confidence: ai.confidence || "low",
        visual_tone: ai.visual_tone || null,
        lighting_summary: ai.lighting_summary || null,
        indoor_ratio: ai.indoor_ratio ?? null,
        location_count: ai.location_count || null,
        dialogue_density: ai.dialogue_density ?? null,
        color_ratio: ai.color_ratio ?? null,
        aspect_ratio: ai.aspect_ratio || null,
        season: ai.season || null,
        filter_match: ai.filter_match ?? null,
        filter_reasons: ai.filter_reasons || [],
        evidence: ai.evidence || [],
        related_films: ai.related_films || [],
        original_work:
          ai.original_work ||
          sources.wikidata?.originalWork ||
          null,
        filming_locations:
          ai.filming_locations ||
          sources.wikidata?.filmingLocations ||
          [],
        family_content: ai.family_content || {},
        imdbRating: imdb.imdbRating || null,
        imdbVotes: imdb.imdbVotes || null,
        imdbID: imdb.imdbID || movie.imdb_id || null,
        imdbYear: imdb.Year || null,
        imdbDirector: imdb.Director || null,
        source_evidence: {
          web: sources.web?.results || [],
          wikidata: sources.wikidata || null,
          commons: sources.commons || { images: [] }
        },
        warnings: [
          sources.web?.warning,
          sources.wikidata?.warning,
          sources.commons?.warning
        ].filter(Boolean)
      };

      await cachePut(env, item.key, { result: analysis });
      output.push(analysis);
    }
  }

  return output;
}

/* İstek gövdesi ve uyumlu yanıt */

async function handleResearch(env, body) {
  const movies = Array.isArray(body.movies)
    ? body.movies.slice(0, 10)
    : [];

  if (!movies.length) {
    return { movies: [], analyses: [] };
  }

  const filters = body.filters || {};

  const settings = {
    useAI: body.useAI !== false,
    useWebResearch: body.useWebResearch === true
  };

  const analyses = await analyseBatch(
    env,
    movies,
    filters,
    settings
  );

  const byId = new Map(
    analyses.map(item => [String(item.id), item])
  );

  const enrichedMovies = movies.map(movie => ({
    ...movie,
    ...(byId.get(String(movie.id)) || {})
  }));

  return {
    movies: enrichedMovies,
    analyses
  };
}

/* Worker yönlendirmesi */

async function handleRequest(request, env) {
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: CORS
    });
  }

  const url = new URL(request.url);

  try {
    if (url.pathname === "/health") {
      return response({
        ok: true,
        model: env.GEMINI_MODEL || MODEL_DEFAULT,
        tmdb: !!env.TMDB_API_KEY,
        omdb: !!env.OMDB_API_KEY,
        tavily: !!env.TAVILY_API_KEY,
        geminiKeys: [
          !!env.GEMINI_API_KEY_1,
          !!env.GEMINI_API_KEY_2,
          !!env.GEMINI_API_KEY_3
        ],
        d1: !!env.DB
      });
    }

    if (url.pathname.startsWith("/tmdb/")) {
      return response(await tmdbRoute(env, url));
    }

    if (url.pathname === "/omdb") {
      const params = {};

      for (const key of ["i", "t", "y", "type"]) {
        if (url.searchParams.has(key)) {
          params[key] = url.searchParams.get(key);
        }
      }

      return response(await omdb(env, params));
    }

    if (url.pathname === "/wikidata") {
      const title = url.searchParams.get("title") || "";

      return response(await wikidata(env, {
        title,
        original_title: title,
        year: url.searchParams.get("year")
      }));
    }

    if (url.pathname === "/commons") {
      const title = url.searchParams.get("title") || "";

      return response(await commons(env, {
        title,
        original_title: title
      }));
    }

    if (
      url.pathname === "/research" ||
      url.pathname === "/gemini-interactions"
    ) {
      if (request.method !== "POST") {
        return jsonError(
          "Bu uç nokta POST isteği bekliyor.",
          405
        );
      }

      let body;

      try {
        body = await request.json();
      } catch {
        return jsonError("İstek gövdesi geçerli JSON değil.", 400);
      }

      return response(await handleResearch(env, body));
    }

    return jsonError("Uç nokta bulunamadı.", 404);
  } catch (error) {
    console.error("Worker hatası:", error.stack || error);

    const message = String(error.message || error);

    const status =
      /HTTP 429|quota|rate.?limit/i.test(message) ? 429 :
      /HTTP 401|HTTP 403/i.test(message) ? 502 :
      /tanımlı değil|tanımlanmalı/.test(message) ? 503 :
      500;

    return jsonError(message, status);
  }
}

export default {
  fetch(request, env) {
    return handleRequest(request, env);
  }
};
