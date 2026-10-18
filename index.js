import { FIELD_DEFS, GEMINI_FIELDS } from "./fields.config.js";

const MODEL_DEFAULT = "gemini-3.8-flash";
const MODEL_CHAIN = [
  "gemini-3.8-flash",
  "gemini-3.5-flash-lite",
  "gemini-3.1-flash-lite",
  "gemini-3.5-flash"
];
const TMDB_BASE = "https://api.themoviedb.org/3";
const GOOGLE_INTERACTIONS = "https://generativelanguage.googleapis.com/v1beta/interactions";
const GOOGLE_GENERATE = "https://generativelanguage.googleapis.com/v1beta/models";
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type,Authorization"
};

function response(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status, headers: { ...CORS, "Content-Type": "application/json; charset=utf-8" }
  });
}
function jsonError(message, status = 500, extra = {}) {
  return response({ error: String(message), ...extra }, status);
}
function safeJSON(text, fallback = null) { try { return JSON.parse(text); } catch { return fallback; } }
function wait(ms) { return new Promise(r => setTimeout(r, ms)); }
function norm(s) { return String(s || "").trim().toLowerCase().replace(/\s+/g, " "); }
function yearOf(m) { return Number(String(m.release_date || "").slice(0, 4)) || Number(m.year) || 0; }
function movieKey(m) { return String(m.id || m.tmdb_id || ""); }

// ---------- D1 ----------
async function getProfileRow(env, movieId) {
  if (!env.DB) return null;
  try {
    const row = await env.DB.prepare(
      "SELECT data_json, updated_at, last_refreshed_at FROM movie_profiles WHERE movie_id = ?"
    ).bind(movieId).first();
    if (!row) return null;
    return { data: safeJSON(row.data_json, {}) || {}, updatedAt: row.updated_at, lastRefreshedAt: row.last_refreshed_at };
  } catch (e) { console.error("profile read:", e.message); return null; }
}
async function putProfileRow(env, movieId, title, year, data, refreshed = false) {
  if (!env.DB) return;
  const now = Math.floor(Date.now() / 1000);
  const refreshedAt = refreshed ? now : null;
  try {
    await env.DB.prepare(
      `INSERT INTO movie_profiles (movie_id, title, year, data_json, created_at, updated_at, last_refreshed_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(movie_id) DO UPDATE SET
         data_json = excluded.data_json,
         updated_at = excluded.updated_at,
         last_refreshed_at = COALESCE(excluded.last_refreshed_at, movie_profiles.last_refreshed_at)`
    ).bind(movieId, title, year, JSON.stringify(data), now, now, refreshedAt).run();
  } catch (e) { console.error("profile write:", e.message); }
}
async function getFieldRows(env, movieId) {
  if (!env.DB) return [];
  try {
    const { results } = await env.DB.prepare(
      "SELECT field, source, fetched_at FROM movie_profile_fields WHERE movie_id = ?"
    ).bind(movieId).all();
    return results || [];
  } catch { return []; }
}
async function putFieldRow(env, movieId, field, source) {
  if (!env.DB) return;
  try {
    await env.DB.prepare(
      `INSERT INTO movie_profile_fields (movie_id, field, source, fetched_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(movie_id, field) DO UPDATE SET source = excluded.source, fetched_at = excluded.fetched_at`
    ).bind(movieId, field, source, Math.floor(Date.now() / 1000)).run();
  } catch (e) { console.error("field write:", e.message); }
}

function findStaleFields(profile, fieldRows, forceRefresh) {
  const now = Math.floor(Date.now() / 1000);
  const fetched = new Map(fieldRows.map(r => [r.field, Number(r.fetched_at)]));
  const stale = [];
  for (const [field, def] of Object.entries(FIELD_DEFS)) {
    const hasValue = profile[field] !== undefined && profile[field] !== null;
    if (!hasValue) { stale.push(field); continue; }
    if (forceRefresh) { stale.push(field); continue; }
    if (def.ttl === null) continue;
    const at = fetched.get(field) || 0;
    if (now - at > def.ttl) stale.push(field);
  }
  return stale;
}

// ---------- Dış servisler ----------
async function fetchJSON(url, options = {}, label = "Uzak servis", timeoutMs = 18000) {
  const res = await fetch(url, { ...options, signal: AbortSignal.timeout ? AbortSignal.timeout(timeoutMs) : undefined });
  const body = await res.text();
  const data = safeJSON(body, null);
  if (!res.ok) throw new Error(`${label}: HTTP ${res.status} ${body.slice(0, 300)}`);
  if (!data) throw new Error(`${label}: JSON yanıtı alınamadı`);
  return data;
}
async function tmdb(env, path, params = {}) {
  if (!env.TMDB_API_KEY) throw new Error("TMDB_API_KEY tanımlı değil.");
  const url = new URL(TMDB_BASE + path);
  url.searchParams.set("api_key", env.TMDB_API_KEY);
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== "") url.searchParams.set(k, String(v));
  return fetchJSON(url.toString(), {}, "TMDB");
}
async function omdb(env, params) {
  if (!env.OMDB_API_KEY) throw new Error("OMDB_API_KEY tanımlı değil.");
  const url = new URL("https://www.omdbapi.com/");
  url.searchParams.set("apikey", env.OMDB_API_KEY);
  for (const [k, v] of Object.entries(params)) if (v) url.searchParams.set(k, v);
  const data = await fetchJSON(url.toString(), {}, "OMDb");
  if (data.Response === "False") throw new Error(data.Error || "OMDb sonucu bulunamadı.");
  return data;
}

// ---------- Wikidata: toplu sorgu (sadeleştirilmiş) ----------
function buildWikidataBatchQuery(movies) {
  const rows = movies.map(m => {
    const title = (m.original_title || m.title || "").replace(/\\/g, "\\\\").replace(/"/g, '\\"');
    return `("${title}" ${m.id})`;
  }).join(" ");
  return `
SELECT ?movieId ?item ?itemLabel ?originalWorkLabel ?filmingLocationLabel WHERE {
  VALUES (?title ?movieId) { ${rows} }
  ?item wdt:P31 wd:Q11424; rdfs:label ?label.
  FILTER(LANG(?label)="en" && LCASE(STR(?label))=LCASE(?title))
  OPTIONAL {?item wdt:P144 ?originalWork.}
  OPTIONAL {?item wdt:P915 ?filmingLocation.}
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en,tr". }
}
LIMIT 200`;
}

async function wikidataBatch(env, movies) {
  const results = new Map();
  if (!movies.length) return results;
  const query = buildWikidataBatchQuery(movies);
  const url = "https://query.wikidata.org/sparql?query=" + encodeURIComponent(query);
  try {
    const data = await fetchJSON(url, {
      headers: { "Accept": "application/sparql-results+json", "User-Agent": "FilmKesifMotoru/1.0" }
    }, "Wikidata", 40000);
    const bindings = data.results?.bindings || [];
    const byId = new Map();
    for (const b of bindings) {
      const id = b.movieId?.value || "";
      if (!byId.has(id)) byId.set(id, { originalWork: null, filmingLocations: new Set() });
      const rec = byId.get(id);
      if (b.originalWorkLabel?.value) rec.originalWork = b.originalWorkLabel.value;
      if (b.filmingLocationLabel?.value) rec.filmingLocations.add(b.filmingLocationLabel.value);
    }
    for (const [id, rec] of byId) {
      results.set(id, { originalWork: rec.originalWork, filmingLocations: [...rec.filmingLocations] });
    }
  } catch (e) {
    console.warn("wikidata batch:", e.message);
  }
  return results;
}

function isUsefulGalleryImage(img) {
  const text = `${img.title || ""} ${img.pageUrl || ""} ${img.license || ""}`.toLowerCase();
  // Oyuncu portresi, afiş, logo, kapak gibi görselleri atla
  if (/(poster|portrait|headshot|actor|actress|cast|logo|cover|headshot)/.test(text)) return false;
  return true;
}

async function commons(env, movie) {
  const title = movie.original_title || movie.title || "";
  if (!title) return { images: [] };
  const url = new URL("https://commons.wikimedia.org/w/api.php");
  url.searchParams.set("action", "query");
  url.searchParams.set("format", "json");
  url.searchParams.set("generator", "search");
  url.searchParams.set("gsrsearch", `filetype:bitmap "${title}" film still OR scene`);
  url.searchParams.set("gsrnamespace", "6");
  url.searchParams.set("gsrlimit", "20");
  url.searchParams.set("prop", "imageinfo");
  url.searchParams.set("iiprop", "url|extmetadata");
  url.searchParams.set("iiurlwidth", "320");
  const data = await fetchJSON(url.toString(), { headers: { "User-Agent": "FilmKesifMotoru/1.0" } }, "Wikimedia Commons");
  const pages = Object.values(data.query?.pages || {});
  return { images: pages.map(p => {
    const i = p.imageinfo?.[0] || {}, meta = i.extmetadata || {};
    return {
      title: p.title || "", url: i.thumburl || i.url || "", pageUrl: i.descriptionurl || "",
      license: meta.LicenseShortName?.value || "", artist: meta.Artist?.value || "", attribution: meta.Attribution?.value || ""
    };
  }).filter(x => x.url && isUsefulGalleryImage(x)).slice(0, 10) };
}
async function tavily(env, query) {
  if (!env.TAVILY_API_KEY) return { results: [], warning: "TAVILY_API_KEY ayarlanmamış." };
  const data = await fetchJSON("https://api.tavily.com/search", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ api_key: env.TAVILY_API_KEY, query, search_depth: "basic", max_results: 5, include_answer: false, include_raw_content: false })
  }, "Tavily");
  return { results: (data.results || []).map(x => ({ title: x.title || "", url: x.url || "", content: (x.content || "").slice(0, 1800), score: x.score || 0 })) };
}

// ---------- Gemini ----------
function extractText(data) {
  if (typeof data?.output_text === "string") return data.output_text;
  if (typeof data?.text === "string") return data.text;
  const cand = data?.candidates?.[0];
  if (cand) {
    const parts = cand?.content?.parts || [];
    const texts = parts.map(p => (typeof p?.text === "string" ? p.text : "")).filter(Boolean);
    if (texts.length) return texts.join("\n");
  }
  const outputs = data?.outputs || data?.output || [];
  const list = Array.isArray(outputs) ? outputs : [outputs];
  const texts = [];
  for (const o of list) {
    if (typeof o?.text === "string") texts.push(o.text);
    for (const c of o?.content || []) if (typeof c?.text === "string") texts.push(c.text);
    for (const s of o?.steps || []) if (typeof s?.text === "string") texts.push(s.text);
  }
  return texts.join("\n");
}

function isKeyRetryable(msg) {
  const m = String(msg || "").toLowerCase();
  return /(http\s*(400|401|403|404|408|409|425|429|500|502|503|504))/.test(m)
    || /quota|rate.?limit|resource.?exhausted|too many requests|exceeded/.test(m)
    || /temporar|timeout|timed out|network|fetch failed|connection|econn|socket|abort/.test(m)
    || /api.?key|permission|unauthor|forbidden|invalid.?key|not.?authorized/.test(m)
    || /model.?not.?found|not.?found|unsupported|unknown.?model/.test(m)
    || /invalid argument|unknown field|unknown name|unrecognized/.test(m);
}

function normalizeModelName(m) {
  return String(m || "").trim().toLowerCase().replace(/^models\//, "");
}
function buildModelChain(env) {
  const seen = new Set();
  const chain = [];
  const push = (m) => {
    const n = normalizeModelName(m);
    if (!n || seen.has(n)) return;
    seen.add(n);
    chain.push(n);
  };
  push(env.GEMINI_MODEL);
  for (const m of MODEL_CHAIN) push(m);
  return chain;
}

async function callInteractions(env, key, model, prompt, useThinkingLow) {
  const body = { model, input: prompt };
  if (useThinkingLow) body.thinking_level = "low";
  const data = await fetchJSON(GOOGLE_INTERACTIONS, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": key },
    body: JSON.stringify(body)
  }, `Gemini Interactions ${model}`, 60000);
  const text = extractText(data);
  if (!text) {
    console.warn(`gemini: interactions ${model} yanıtında metin yok — gövde: ${JSON.stringify(data).slice(0, 2000)}`);
    throw new Error(`Gemini Interactions ${model} yanıtında metin yok.`);
  }
  return text;
}

async function callGenerateContent(env, key, model, prompt) {
  const url = `${GOOGLE_GENERATE}/${encodeURIComponent(model)}:generateContent`;
  const data = await fetchJSON(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": key },
    body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
  }, `Gemini generateContent ${model}`, 60000);
  const text = extractText(data);
  if (!text) {
    console.warn(`gemini: generateContent ${model} yanıtında metin yok — gövde: ${JSON.stringify(data).slice(0, 2000)}`);
    throw new Error(`Gemini generateContent ${model} yanıtında metin yok.`);
  }
  return text;
}

async function callGemini(env, prompt) {
  const keys = [env.GEMINI_API_KEY_1, env.GEMINI_API_KEY_2, env.GEMINI_API_KEY_3]
    .map((k, i) => ({ key: k, index: i + 1 }))
    .filter(x => x.key);
  if (!keys.length) throw new Error("GEMINI_API_KEY_1/2/3 Secret'larından en az biri gerekli.");

  const models = buildModelChain(env);
  const exhaustedKeys = new Set();
  const errors = [];

  for (const model of models) {
    for (const { key, index } of keys) {
      if (exhaustedKeys.has(index)) continue;

      try {
        const text = await callInteractions(env, key, model, prompt, true);
        return text;
      } catch (e) {
        const msg = String(e.message || e);
        if (/thinking_level|unknown field|invalid argument|unknown name/i.test(msg)) {
          try {
            const text = await callInteractions(env, key, model, prompt, false);
            return text;
          } catch (e2) {
            const m2 = String(e2.message || e2);
            errors.push(`interactions model=${model} key=${index}: ${m2}`);
            console.warn(`gemini: interactions model=${model} key=${index} başarısız — ${m2}`);
            if (/429|quota|rate.?limit|exceeded/i.test(m2)) exhaustedKeys.add(index);
          }
        } else {
          errors.push(`interactions model=${model} key=${index}: ${msg}`);
          console.warn(`gemini: interactions model=${model} key=${index} başarısız — ${msg}`);
          if (/429|quota|rate.?limit|exceeded/i.test(msg)) exhaustedKeys.add(index);
        }
      }

      if (exhaustedKeys.has(index)) continue;

      try {
        const text = await callGenerateContent(env, key, model, prompt);
        return text;
      } catch (e) {
        const msg = String(e.message || e);
        errors.push(`generateContent model=${model} key=${index}: ${msg}`);
        console.warn(`gemini: generateContent model=${model} key=${index} başarısız — ${msg}`);
        if (/429|quota|rate.?limit|exceeded/i.test(msg)) exhaustedKeys.add(index);
        await wait(200);
      }
    }
  }
  throw new Error(`Gemini tüm model/anahtarlarda başarısız: ${errors.join(" | ")}`);
}

function extractJSON(text) {
  const clean = String(text).replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/,"").trim();
  const start = clean.indexOf("{"), end = clean.lastIndexOf("}");
  if (start < 0 || end < start) throw new Error("Gemini geçerli JSON döndürmedi.");
  return JSON.parse(clean.slice(start, end + 1));
}
function extractJSONArray(text) {
  const clean = String(text).replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/,"").trim();
  const start = clean.indexOf("["), end = clean.lastIndexOf("]");
  if (start < 0 || end < start) return null;
  try { return JSON.parse(clean.slice(start, end + 1)); } catch { return null; }
}

function buildBatchGeminiPrompt(movies, fieldsByMovie, knownByMovie, filters) {
  const f = filters || {};
  const payload = movies.map(m => ({
    id: m.id,
    title: m.title,
    original_title: m.original_title,
    year: yearOf(m),
    fields: fieldsByMovie[m.id] || [],
    known: knownByMovie[m.id] || {}
  }));
  return `Sen bir film araştırma asistanısın. Yalnızca sağlanan kaynaklardan hareket et; kanıt yoksa düşük güvenli olarak işaretle, uydurma.
Kullanıcı filtreleri (include = olumlu, exclude = olumsuz): ${JSON.stringify(f).slice(0, 3000)}
Her film için, "fields" listesindeki alanları doldur.
Sayısal alanlar 0-100 veya null; location_count string; family_content nesne; related_films string[]; story_locations/story_geography/character_traits/narrative_style/production_process/sound/reality/story_dimensions string[]; story_period string[]; aspect_ratio string; season string[].
Yanıt biçimi yalnızca şu JSON dizisi: [{"id": <film_id>, "<alan>": <değer>, ...}, ...]
Filmler: ${JSON.stringify(payload).slice(0, 12000)}`;
}

function buildSearchQuery(movie, fields) {
  const title = movie.original_title || movie.title || "";
  const year = yearOf(movie) || "";
  const hints = [];
  if (fields.includes("filming_locations")) hints.push("filming location");
  if (fields.includes("season")) hints.push("season");
  if (fields.includes("original_work")) hints.push("based on");
  if (fields.includes("night_ratio")) hints.push("night scenes");
  return `${title} ${year} film ${hints.join(" ")}`.trim();
}
function extractCoveredFields(results, need) {
  const covered = new Set();
  const text = (results || []).map(r => `${r.title} ${r.content}`).join(" ").toLowerCase();
  const rules = {
    filming_locations: /(filmed|filming|shot) (in|at|on)/,
    season: /(winter|summer|spring|autumn|fall)/,
    original_work: /(based on|adapted from|novel by)/,
    night_ratio: /(night|dark|nocturnal)/,
    dialogue_density: /(dialogue|conversation)/
  };
  for (const f of need) if (rules[f] && rules[f].test(text)) covered.add(f);
  return covered;
}

// ---------- Zenginleştirme ----------
async function enrichClassic(env, movie, staleFields, settings, filters) {
  const need = new Set(staleFields);
  const updates = {};
  const covered = new Set();
  let webAvailable = null;

  const tmdbNeeded = ["genres", "spoken_languages", "production_countries", "runtime"].filter(f => need.has(f));
  if (tmdbNeeded.length && movie.id) {
    try {
      const detail = await tmdb(env, `/movie/${movie.id}`, { language: "tr-TR" });
      if (need.has("genres")) {
        updates.genres = Array.isArray(detail.genres) ? detail.genres.map(g => g.name) : [];
        covered.add("genres");
      }
      if (need.has("spoken_languages")) {
        updates.spoken_languages = Array.isArray(detail.spoken_languages)
          ? detail.spoken_languages.map(l => l.name || l.english_name || l.iso_639_1) : [];
        covered.add("spoken_languages");
      }
      if (need.has("production_countries")) {
        updates.production_countries = Array.isArray(detail.production_countries)
          ? detail.production_countries.map(c => c.name || c.iso_3166_1) : [];
        covered.add("production_countries");
      }
      if (need.has("runtime")) {
        updates.runtime = Number(detail.runtime) || null;
        covered.add("runtime");
      }
    } catch (e) { console.warn("tmdb detail enrich:", e.message); }
  }

  if (["imdbRating","imdbVotes","imdbID","directors"].some(f => need.has(f))) {
    try {
      const data = await omdb(env, { t: movie.original_title || movie.title, y: String(yearOf(movie) || "") });
      const clean = (v) => (v === "N/A" || v === undefined ? null : v);
      for (const f of ["imdbRating","imdbVotes","imdbID","directors"]) {
        if (need.has(f)) { updates[f] = clean(data[f]); covered.add(f); }
      }
    } catch (e) { console.warn("omdb enrich:", e.message); }
  }

  if (need.has("commons_images")) {
    try {
      const c = await commons(env, movie);
      updates.commons_images = c.images || []; covered.add("commons_images");
    } catch (e) { console.warn("commons enrich:", e.message); }
  }

  const remainingAfterClassic = [...need].filter(f => !covered.has(f));
  if (settings.useWebResearch && remainingAfterClassic.length) {
    webAvailable = false;
    try {
      const freeTerms = [];
      const f = filters || {};
      for (const key of Object.keys(f)) {
        const val = f[key];
        if (!val || typeof val !== "object") continue;
        for (const x of val.include || []) if (x && x.id === null && x.label) freeTerms.push(x.label);
      }
      const baseQuery = buildSearchQuery(movie, remainingAfterClassic);
      const fullQuery = freeTerms.length ? `${baseQuery} ${freeTerms.join(" ")}` : baseQuery;
      const w = await tavily(env, fullQuery);
      updates.web_evidence = w.results || [];
      if (Array.isArray(w.results) && w.results.length) webAvailable = true;
      for (const f2 of extractCoveredFields(w.results, remainingAfterClassic)) covered.add(f2);
    } catch (e) { console.warn("tavily enrich:", e.message); }
  }

  return { updates, covered, webAvailable };
}

// ---------- Filtre değerlendirme ----------
function toNum(v) {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "string" && /^n\/?a$/i.test(v.trim())) return null;
  const n = Number(String(v).replace(/[^\d.-]/g, ""));
  return Number.isFinite(n) ? n : null;
}

function evalSet(profile, field, f, label, state) {
  if (!f) return;
  const raw = profile[field];
  const have = Array.isArray(raw) ? raw.map(norm) : (raw ? [norm(raw)] : []);
  if (f.include?.length) {
    const missing = f.include.filter(x => !have.includes(norm(x.label || x)));
    if (missing.length) { state.match = false; state.reasons.push(`${label}: eksik ${missing.map(x => x.label || x).join(", ")}`); }
    else state.reasons.push(`${label}: dahil edilenler tamam`);
  }
  if (f.exclude?.length) {
    const hit = f.exclude.filter(x => have.includes(norm(x.label || x)));
    if (hit.length) {
      state.match = false;
      state.reasons.push(`${label}: hariç tutulanlar mevcut ${hit.map(x => x.label || x).join(", ")}`);
      state.conflicts = true;
    }
  }
}
function evalRange(profile, field, min, max, label, state, strict = false) {
  if (min == null && max == null) return;
  const v = toNum(profile[field]);
  if (v === null) {
    if (strict) { state.match = false; state.reasons.push(`${label}: bilinmiyor (elendi)`); }
    else { state.unknown = true; state.reasons.push(`${label}: bilinmiyor`); }
    return;
  }
  if ((min != null && v < min) || (max != null && v > max)) { state.match = false; state.reasons.push(`${label}: ${v} aralık dışı`); }
  else state.reasons.push(`${label}: ${v} uygun`);
}
function evaluateFilters(profile, filters) {
  const state = { match: true, reasons: [], unknown: false, conflicts: false };
  evalRange(profile, "imdbRating", filters.imdbMin, filters.imdbMax, "IMDb puanı", state, true);
  evalRange(profile, "vote_average", filters.tmdbMin, filters.tmdbMax, "TMDB puanı", state, true);
  const iv = toNum(profile.imdbVotes);
  if (filters.imdbVotesMin != null && filters.imdbVotesMin > 0) {
    if (iv === null) { state.match = false; state.reasons.push("IMDb oy: bilinmiyor (elendi)"); }
    else if (iv < filters.imdbVotesMin) { state.match = false; state.reasons.push(`IMDb oy ${iv} < ${filters.imdbVotesMin}`); }
  }
  const tv = toNum(profile.vote_count);
  if (filters.tmdbVotesMin != null && filters.tmdbVotesMin > 0) {
    if (tv === null) { state.match = false; state.reasons.push("TMDB oy: bilinmiyor (elendi)"); }
    else if (tv < filters.tmdbVotesMin) { state.match = false; state.reasons.push(`TMDB oy ${tv} < ${filters.tmdbVotesMin}`); }
  }
  if (filters.yearMin != null || filters.yearMax != null) {
    const y = yearOf(profile) || null;
    if (y === null) { state.match = false; state.reasons.push("Yıl: bilinmiyor (elendi)"); }
    else if ((filters.yearMin != null && y < filters.yearMin) || (filters.yearMax != null && y > filters.yearMax)) {
      state.match = false; state.reasons.push(`Yıl ${y} aralık dışı`);
    }
  }
  evalRange(profile, "runtime", filters.runtimeMin, filters.runtimeMax, "Süre", state);
  if (filters.characterDensity) {
    const c = filters.characterDensity;
    const fc = profile.family_content || {};
    evalRange(fc, "main_characters", c.mainMin, c.mainMax, "Ana karakter", state);
    evalRange(fc, "supporting_characters", c.supportMin, c.supportMax, "Yan karakter", state);
    evalRange(fc, "extras", c.extraMin, c.extraMax, "Figüran", state);
  }
  if (filters.nightRatioMin != null || filters.nightRatioMax != null) evalRange(profile, "night_ratio", filters.nightRatioMin, filters.nightRatioMax, "Gece oranı", state);
  if (filters.indoorRatioMin != null || filters.indoorRatioMax != null) evalRange(profile, "indoor_ratio", filters.indoorRatioMin, filters.indoorRatioMax, "İç mekân oranı", state);
  if (filters.dialogueDensityMin != null || filters.dialogueDensityMax != null) evalRange(profile, "dialogue_density", filters.dialogueDensityMin, filters.dialogueDensityMax, "Diyalog yoğunluğu", state);
  if (filters.colorRatioMin != null || filters.colorRatioMax != null) evalRange(profile, "color_ratio", filters.colorRatioMin, filters.colorRatioMax, "Renk oranı", state);
  if (filters.locationCountMin != null || filters.locationCountMax != null) {
    const v = toNum(profile.location_count);
    if (v === null) { state.unknown = true; state.reasons.push("Mekân sayısı: bilinmiyor"); }
    else if ((filters.locationCountMin != null && v < filters.locationCountMin) || (filters.locationCountMax != null && v > filters.locationCountMax)) {
      state.match = false; state.reasons.push(`Mekân sayısı ${v} aralık dışı`);
    }
  }
  evalSet(profile, "genres", filters.genres, "Tür", state);
  evalSet(profile, "spoken_languages", filters.original_language, "Dil", state);
  evalSet(profile, "production_countries", filters.production_countries, "Ülke", state);
  evalSet(profile, "story_locations", filters.story_locations, "Hikâye yeri", state);
  evalSet(profile, "filming_locations", filters.filming_locations, "Çekim yeri", state);
  evalSet(profile, "story_period", filters.story_period, "Dönem", state);
  evalSet(profile, "story_geography", filters.story_geography, "Coğrafya", state);
  evalSet(profile, "season", filters.season, "Mevsim", state);
  evalSet(profile, "character_traits", filters.character_traits, "Karakter niteliği", state);
  evalSet(profile, "aspect_ratio", filters.aspect_ratio, "En-boy oranı", state);
  evalSet(profile, "narrative_style", filters.narrative_style, "Anlatım tarzı", state);
  evalSet(profile, "production_process", filters.production_process, "Çekim süreci", state);
  evalSet(profile, "sound", filters.sound, "Ses", state);
  evalSet(profile, "reality", filters.reality, "Gerçeklik", state);
  evalSet(profile, "story_dimensions", filters.story_dimensions, "Hikâye boyutları", state);

  const conflictKeys = ["genres","original_language","production_countries","story_locations","filming_locations","story_period","story_geography","season","character_traits","aspect_ratio","narrative_style","production_process","sound","reality","story_dimensions"];
  for (const k of conflictKeys) {
    const f = filters[k];
    if (!f || f.conflict) continue;
    if (!f.include?.length || !f.exclude?.length) continue;
    const profileVals = (profile[k === "original_language" ? "spoken_languages" : k] || []).map(norm);
    const incSet = new Set(f.include.map(x => norm(x.label || x)));
    const excSet = new Set(f.exclude.map(x => norm(x.label || x)));
    const hasInc = [...incSet].some(x => profileVals.includes(x));
    const hasExc = [...excSet].some(x => profileVals.includes(x));
    if (hasInc && hasExc) { state.match = false; state.reasons.push(`${k}: çakışan dahil/hariç (izin verilmedi)`); }
  }
  return state;
}

// ---------- /research (SSE) ----------
async function handleResearchStream(env, body, controller) {
  const enc = new TextEncoder();
  const send = (obj) => controller.enqueue(enc.encode(`data: ${JSON.stringify(obj)}\n\n`));

  const movies = Array.isArray(body.movies) ? body.movies.slice(0, 8) : [];
  const total = movies.length;
  if (!total) { send({ type: "done", movies: [] }); controller.close(); return; }

  const filters = body.filters || {};
  const settings = { useAI: body.useAI === true, useWebResearch: body.useWebResearch === true };
  const forceRefresh = body.refresh === true;

  send({ type: "start", total });

  const prepared = [];
  for (let i = 0; i < movies.length; i++) {
    const movie = movies[i];
    const movieId = movieKey(movie);
    const title = movie.original_title || movie.title || movieId;
    send({ type: "step", index: i, total, title, stage: "okunuyor" });

    const existing = await getProfileRow(env, movieId);
    const fieldRows = await getFieldRows(env, movieId);
    const profile = existing?.data || {};

    if (!profile.vote_average && movie.vote_average != null) profile.vote_average = movie.vote_average;
    if (!profile.vote_count && movie.vote_count != null) profile.vote_count = movie.vote_count;
    if (!profile.overview && movie.overview) profile.overview = movie.overview;
    if (!profile.poster_path && movie.poster_path) profile.poster_path = movie.poster_path;
    if (!profile.release_date && movie.release_date) profile.release_date = movie.release_date;

    const stale = findStaleFields(profile, fieldRows, forceRefresh);
    prepared.push({ movie, movieId, profile, stale, webAvailable: null, aiNeeded: [] });
  }

  for (let i = 0; i < prepared.length; i++) {
    const p = prepared[i];
    send({ type: "step", index: i, total, title: p.movie.original_title || p.movie.title, stage: p.stale.length ? "zenginleştiriliyor" : "önbellekten", fields: p.stale.slice(0, 6) });
    const classic = await enrichClassic(env, p.movie, p.stale, settings, filters);
    Object.assign(p.profile, classic.updates);
    for (const f of classic.covered) if (p.profile[f] !== undefined && p.profile[f] !== null) await putFieldRow(env, p.movieId, f, FIELD_DEFS[f].source);
    p.webAvailable = classic.webAvailable;
  }

  const wikiNeeded = prepared.filter(p => p.stale.includes("original_work") || p.stale.includes("filming_locations"));
  if (wikiNeeded.length) {
    const wikiResults = await wikidataBatch(env, wikiNeeded.map(p => p.movie));
    for (const p of wikiNeeded) {
      const rec = wikiResults.get(String(p.movie.id));
      if (!rec) continue;
      if (p.stale.includes("original_work") && rec.originalWork) { p.profile.original_work = rec.originalWork; await putFieldRow(env, p.movieId, "original_work", "wikidata"); }
      if (p.stale.includes("filming_locations") && rec.filmingLocations.length) { p.profile.filming_locations = rec.filmingLocations; await putFieldRow(env, p.movieId, "filming_locations", "wikidata"); }
    }
  }

  for (const p of prepared) {
    const coveredNow = new Set();
    for (const f of p.stale) {
      if (p.profile[f] !== undefined && p.profile[f] !== null) coveredNow.add(f);
    }
    p.aiNeeded = [...p.stale].filter(f => !coveredNow.has(f) && FIELD_DEFS[f].source === "gemini");
  }

  let aiAvailable = false;
  const aiRequested = settings.useAI && prepared.some(p => p.aiNeeded.length);
  if (aiRequested) {
    const aiMovies = prepared.filter(p => p.aiNeeded.length);
    const fieldsByMovie = {};
    const knownByMovie = {};
    for (const p of aiMovies) {
      fieldsByMovie[p.movie.id] = p.aiNeeded;
      knownByMovie[p.movie.id] = { ...p.profile };
    }
    try {
      const prompt = buildBatchGeminiPrompt(aiMovies.map(p => p.movie), fieldsByMovie, knownByMovie, filters);
      const raw = await callGemini(env, prompt);
      const arr = extractJSONArray(raw) || (() => {
        try { const obj = extractJSON(raw); return obj.movies || []; } catch { return []; }
      })();
      const byId = new Map();
      for (const item of arr) {
        const id = item && (item.id ?? item.movie_id);
        if (id != null) byId.set(String(id), item);
      }
      for (const p of aiMovies) {
        const item = byId.get(String(p.movie.id));
        if (item) {
          for (const f of p.aiNeeded) {
            if (item[f] !== undefined && item[f] !== null) p.profile[f] = item[f];
          }
        }
      }
      aiAvailable = true;
    } catch (e) {
      console.warn("gemini toplu enrich:", e.message);
      aiAvailable = false;
    }
  } else if (settings.useAI) {
    aiAvailable = true;
  }

  const results = [];
  for (const p of prepared) {
    if (p.stale.length) {
      await putProfileRow(env, p.movieId, p.movie.title, yearOf(p.movie), p.profile, forceRefresh);
    }
    const evalResult = evaluateFilters(p.profile, filters);
    const result = {
      id: p.movie.id, ...p.movie, ...p.profile,
      filter_match: evalResult.match, filter_reasons: evalResult.reasons,
      unknown: evalResult.unknown, conflicts: evalResult.conflicts,
      ai_available: aiAvailable,
      web_available: p.webAvailable,
      _fromCache: p.stale.length === 0
    };
    results.push(result);
    send({ type: "movie", index: results.length - 1, total, movie: result });
  }

  send({ type: "done", movies: results });
  controller.close();
}

// ---------- Yönlendirme ----------
async function tmdbRoute(env, url) {
  const path = url.pathname.replace(/^\/tmdb/, "");
  if (path === "/genre/movie/list") return tmdb(env, path, { language: url.searchParams.get("language") || "tr-TR" });
  if (path === "/configuration/languages") return tmdb(env, path);
  if (path === "/configuration/countries") return tmdb(env, path, { language: url.searchParams.get("language") || "tr-TR" });
  if (path === "/discover/movie") {
    const allowed = ["language","sort_by","vote_average.gte","vote_average.lte","vote_count.gte","page","primary_release_date.gte","primary_release_date.lte","with_genres","without_genres","with_original_language","with_origin_country","with_runtime.gte","with_runtime.lte","with_text_query"];
    const params = {};
    for (const key of allowed) if (url.searchParams.has(key)) params[key] = url.searchParams.get(key);
    return tmdb(env, path, params);
  }
  if (path === "/search/movie") return tmdb(env, path, { query: url.searchParams.get("query") || "", language: url.searchParams.get("language") || "tr-TR", page: url.searchParams.get("page") || 1, include_adult: "false" });
  if (path === "/movie/details") {
    const id = url.searchParams.get("id");
    if (!id || !/^\d+$/.test(id)) throw new Error("TMDB film ID geçersiz.");
    const lang = url.searchParams.get("language") || "tr-TR";
    const [movie, credits] = await Promise.all([tmdb(env, `/movie/${id}`, { language: lang }), tmdb(env, `/movie/${id}/credits`)]);
    const imdb = await omdb(env, { i: movie.imdb_id || "" }).catch(() => null);
    return { ...movie, credits, imdbRating: imdb?.imdbRating || null, imdbVotes: imdb?.imdbVotes || null };
  }
  throw new Error("Bilinmeyen TMDB uç noktası.");
}

async function handleRequest(request, env) {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  const url = new URL(request.url);
  try {
    if (url.pathname === "/health") {
      return response({
        ok: true, model: env.GEMINI_MODEL || MODEL_DEFAULT,
        models: buildModelChain(env),
        tmdb: !!env.TMDB_API_KEY, omdb: !!env.OMDB_API_KEY, tavily: !!env.TAVILY_API_KEY,
        geminiKeys: [!!env.GEMINI_API_KEY_1, !!env.GEMINI_API_KEY_2, !!env.GEMINI_API_KEY_3],
        d1: !!env.DB
      });
    }
    if (url.pathname.startsWith("/tmdb/")) return response(await tmdbRoute(env, url));
    if (url.pathname === "/omdb") {
      const params = {};
      for (const k of ["i","t","y","type"]) if (url.searchParams.has(k)) params[k] = url.searchParams.get(k);
      return response(await omdb(env, params));
    }
    if (url.pathname === "/wikidata") {
      const movie = { id: url.searchParams.get("id"), title: url.searchParams.get("title"), original_title: url.searchParams.get("title"), year: url.searchParams.get("year") };
      const res = await wikidataBatch(env, [movie]);
      return response({ items: [], ...(res.get(String(movie.id)) || { originalWork: null, filmingLocations: [] }) });
    }
    if (url.pathname === "/commons") {
      const movie = { title: url.searchParams.get("title"), original_title: url.searchParams.get("title") };
      return response(await commons(env, movie));
    }
    if (url.pathname === "/research" || url.pathname === "/gemini-interactions") {
      if (request.method !== "POST") return jsonError("Bu uç nokta POST bekliyor.", 405);
      let body;
      try { body = await request.json(); } catch { return jsonError("Geçersiz JSON gövdesi.", 400); }

      const { readable, writable } = new TransformStream();
      const writer = writable.getWriter();
      const controller = {
        enqueue: (chunk) => writer.write(chunk),
        close: () => writer.close()
      };
      handleResearchStream(env, body, controller).catch(err => {
        try { controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify({ type: "error", message: String(err.message || err) })}\n\n`)); } catch {}
        try { controller.close(); } catch {}
      });

      return new Response(readable, {
        headers: {
          ...CORS,
          "Content-Type": "text/event-stream; charset=utf-8",
          "Cache-Control": "no-cache",
          "Connection": "keep-alive"
        }
      });
    }
    return jsonError("Uç nokta bulunamadı.", 404);
  } catch (e) {
    console.error(e.stack || e);
    const message = String(e.message || e);
    const status = /API_KEY|Secret .*tanımlı değil|gerekli/.test(message) ? 503 : 500;
    return jsonError(message, status);
  }
}

export default { fetch(request, env) { return handleRequest(request, env); } };
