import { FIELD_DEFS, GEMINI_FIELDS } from "./fields.config.js";

const MODEL_DEFAULT = "gemini-3.8-flash";
const TMDB_BASE = "https://api.themoviedb.org/3";
const GOOGLE_INTERACTIONS = "https://generativelanguage.googleapis.com/v1beta/interactions";
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
async function fetchJSON(url, options = {}, label = "Uzak servis") {
  const res = await fetch(url, { ...options, signal: AbortSignal.timeout ? AbortSignal.timeout(18000) : undefined });
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
async function wikidata(env, movie) {
  const title = movie.original_title || movie.title || "";
  const year = yearOf(movie);
  if (!title) return { items: [], filmingLocations: [], originalWork: null };
  const escaped = title.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  const query = `
SELECT ?item ?itemLabel ?itemDescription ?originalWorkLabel ?filmingLocationLabel WHERE {
  ?item wdt:P31 wd:Q11424; rdfs:label ?label.
  FILTER(LANG(?label)="en" && LCASE(STR(?label))=LCASE("${escaped}"))
  OPTIONAL {?item wdt:P144 ?originalWork.}
  OPTIONAL {?item wdt:P915 ?filmingLocation.}
  OPTIONAL {?item wdt:P577 ?date.}
  OPTIONAL {?item schema:description ?itemDescription. FILTER(LANG(?itemDescription)="en")}
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en,tr". }
  ${year ? `FILTER(!BOUND(?date) || YEAR(?date) >= ${year - 1} && YEAR(?date) <= ${year + 1})` : ""}
}
LIMIT 8`;
  const url = "https://query.wikidata.org/sparql?query=" + encodeURIComponent(query);
  const data = await fetchJSON(url, { headers: { "Accept": "application/sparql-results+json", "User-Agent": "FilmKesifMotoru/1.0" } }, "Wikidata");
  const bindings = data.results?.bindings || [];
  return {
    items: bindings.map(x => ({
      label: x.itemLabel?.value || "", description: x.itemDescription?.value || "",
      originalWork: x.originalWorkLabel?.value || "", filmingLocation: x.filmingLocationLabel?.value || ""
    })),
    originalWork: bindings.find(x => x.originalWorkLabel)?.originalWorkLabel?.value || null,
    filmingLocations: [...new Set(bindings.map(x => x.filmingLocationLabel?.value).filter(Boolean))]
  };
}
async function commons(env, movie) {
  const title = movie.original_title || movie.title || "";
  if (!title) return { images: [] };
  const url = new URL("https://commons.wikimedia.org/w/api.php");
  url.searchParams.set("action", "query");
  url.searchParams.set("format", "json");
  url.searchParams.set("generator", "search");
  url.searchParams.set("gsrsearch", `filetype:bitmap "${title}" film`);
  url.searchParams.set("gsrnamespace", "6");
  url.searchParams.set("gsrlimit", "5");
  url.searchParams.set("prop", "imageinfo");
  url.searchParams.set("iiprop", "url|extmetadata");
  url.searchParams.set("iiurlwidth", "640");
  const data = await fetchJSON(url.toString(), { headers: { "User-Agent": "FilmKesifMotoru/1.0" } }, "Wikimedia Commons");
  const pages = Object.values(data.query?.pages || {});
  return { images: pages.map(p => {
    const i = p.imageinfo?.[0] || {}, meta = i.extmetadata || {};
    return {
      title: p.title || "", url: i.thumburl || i.url || "", pageUrl: i.descriptionurl || "",
      license: meta.LicenseShortName?.value || "", artist: meta.Artist?.value || "", attribution: meta.Attribution?.value || ""
    };
  }).filter(x => x.url) };
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
async function callGemini(env, prompt) {
  const keys = [env.GEMINI_API_KEY_1, env.GEMINI_API_KEY_2, env.GEMINI_API_KEY_3].filter(Boolean);
  if (!keys.length) throw new Error("GEMINI_API_KEY_1/2/3 Secret'larından en az biri gerekli.");
  const model = env.GEMINI_MODEL || MODEL_DEFAULT;
  let lastError;
  for (let i = 0; i < keys.length; i++) {
    try {
      const data = await fetchJSON(GOOGLE_INTERACTIONS, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": keys[i] },
        body: JSON.stringify({ model, input: prompt })
      }, "Gemini Interactions");
      const text = extractText(data);
      if (!text) throw new Error("Gemini yanıtında metin bulunamadı.");
      return text;
    } catch (e) {
      lastError = e;
      const msg = String(e.message || e);
      const retryable = /HTTP (429|500|502|503|504)|quota|rate.?limit|temporar/i.test(msg);
      if (!retryable) throw e;
      if (i < keys.length - 1) await wait(1200 * (i + 1));
    }
  }
  throw lastError || new Error("Gemini isteği başarısız.");
}
function extractJSON(text) {
  const clean = String(text).replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/,"").trim();
  const start = clean.indexOf("{"), end = clean.lastIndexOf("}");
  if (start < 0 || end < start) throw new Error("Gemini geçerli JSON döndürmedi.");
  return JSON.parse(clean.slice(start, end + 1));
}
function buildGeminiPrompt(movie, fields, known) {
  return `Sen bir film araştırma asistanısın. Yalnızca sağlanan kaynaklardan hareket et; kanıt yoksa düşük güvenli olarak işaretle, uydurma.
Film: ${JSON.stringify({ id: movie.id, title: movie.title, original_title: movie.original_title, year: yearOf(movie) })}
Bilinen veriler: ${JSON.stringify(known).slice(0, 4000)}
Senden istenen alanlar: ${JSON.stringify(fields)}
Her alan için değer üret. night_ratio/day_ratio/indoor_ratio/dialogue_density/color_ratio 0-100 veya null; location_count string; family_content nesne; related_films string[]; story_locations/story_geography/character_traits/narrative_style/production_process/sound/reality/story_dimensions string[]; story_period string[]; aspect_ratio string; season string[].
Yanıt biçimi yalnızca şu JSON: {"<alan>": <değer>, ...} ve yalnızca istenen alanları içer.`;
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
async function enrichProfile(env, movie, staleFields, settings) {
  const need = new Set(staleFields);
  const updates = {};
  const covered = new Set();

  // 0. TMDB detay
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

  // 1. OMDb
  if (["imdbRating","imdbVotes","imdbID","directors"].some(f => need.has(f))) {
    try {
      const data = await omdb(env, { t: movie.original_title || movie.title, y: String(yearOf(movie) || "") });
      for (const f of ["imdbRating","imdbVotes","imdbID","directors"]) {
        if (need.has(f)) { updates[f] = data[f] ?? null; covered.add(f); }
      }
    } catch (e) { console.warn("omdb enrich:", e.message); }
  }

  // 2. Wikidata
  if (need.has("original_work") || need.has("filming_locations")) {
    try {
      const wd = await wikidata(env, movie);
      if (need.has("original_work")) { updates.original_work = wd.originalWork || null; covered.add("original_work"); }
      if (need.has("filming_locations")) { updates.filming_locations = wd.filmingLocations || []; covered.add("filming_locations"); }
    } catch (e) { console.warn("wikidata enrich:", e.message); }
  }

  // 3. Commons
  if (need.has("commons_images")) {
    try {
      const c = await commons(env, movie);
      updates.commons_images = c.images || []; covered.add("commons_images");
    } catch (e) { console.warn("commons enrich:", e.message); }
  }

  // 4. Web
  const remainingAfterClassic = [...need].filter(f => !covered.has(f));
  if (settings.useWebResearch && remainingAfterClassic.length) {
    try {
      const w = await tavily(env, buildSearchQuery(movie, remainingAfterClassic));
      updates.web_evidence = w.results || [];
      for (const f of extractCoveredFields(w.results, remainingAfterClassic)) covered.add(f);
    } catch (e) { console.warn("tavily enrich:", e.message); }
  }

  // 5. AI
  const aiNeeded = [...need].filter(f => !covered.has(f) && FIELD_DEFS[f].source === "gemini");
  if (settings.useAI && aiNeeded.length) {
    try {
      const raw = await callGemini(env, buildGeminiPrompt(movie, aiNeeded, updates));
      const parsed = extractJSON(raw);
      for (const f of aiNeeded) if (parsed[f] !== undefined) { updates[f] = parsed[f]; covered.add(f); }
    } catch (e) { console.warn("gemini enrich:", e.message); }
  }

  return { updates, covered };
}

// ---------- Filtre değerlendirme ----------
function toNum(v) { if (v === null || v === undefined || v === "") return null; const n = Number(String(v).replace(/[^\d.-]/g, "")); return Number.isFinite(n) ? n : null; }

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
  if (f.free?.length) {
    for (const t of f.free) {
      if (!have.includes(norm(t))) { state.unknown = true; state.reasons.push(`${label}: "${t}" bilinmiyor`); }
      else state.reasons.push(`${label}: "${t}" eşleşti`);
    }
  }
}

function evalRange(profile, field, min, max, label, state) {
  if (min == null && max == null) return;
  const v = toNum(profile[field]);
  if (v === null) { state.unknown = true; state.reasons.push(`${label}: bilinmiyor`); return; }
  if ((min != null && v < min) || (max != null && v > max)) { state.match = false; state.reasons.push(`${label}: ${v} aralık dışı`); }
  else state.reasons.push(`${label}: ${v} uygun`);
}

function evaluateFilters(profile, filters) {
  const state = { match: true, reasons: [], unknown: false, conflicts: false };

  // Puanlar
  evalRange(profile, "imdbRating", filters.imdbMin, filters.imdbMax, "IMDb puanı", state);
  evalRange(profile, "vote_average", filters.tmdbMin, filters.tmdbMax, "TMDB puanı", state);
  // Oy sayıları
  const iv = toNum(profile.imdbVotes);
  if (filters.imdbVotesMin != null && filters.imdbVotesMin > 0) {
    if (iv === null) { state.unknown = true; state.reasons.push("IMDb oy: bilinmiyor"); }
    else if (iv < filters.imdbVotesMin) { state.match = false; state.reasons.push(`IMDb oy ${iv} < ${filters.imdbVotesMin}`); }
  }
  const tv = toNum(profile.vote_count);
  if (filters.tmdbVotesMin != null && filters.tmdbVotesMin > 0) {
    if (tv === null) { state.unknown = true; state.reasons.push("TMDB oy: bilinmiyor"); }
    else if (tv < filters.tmdbVotesMin) { state.match = false; state.reasons.push(`TMDB oy ${tv} < ${filters.tmdbVotesMin}`); }
  }
  // Yıl
  if (filters.yearMin != null || filters.yearMax != null) {
    const y = yearOf(profile) || null;
    if (y === null) { state.unknown = true; state.reasons.push("Yıl: bilinmiyor"); }
    else if ((filters.yearMin != null && y < filters.yearMin) || (filters.yearMax != null && y > filters.yearMax)) {
      state.match = false; state.reasons.push(`Yıl ${y} aralık dışı`);
    }
  }
  // Süre
  evalRange(profile, "runtime", filters.runtimeMin, filters.runtimeMax, "Süre", state);
  // Karakter yoğunluğu
  if (filters.characterDensity) {
    const c = filters.characterDensity;
    const fc = profile.family_content || {};
    evalRange(fc, "main_characters", c.mainMin, c.mainMax, "Ana karakter", state);
    evalRange(fc, "supporting_characters", c.supportMin, c.supportMax, "Yan karakter", state);
    evalRange(fc, "extras", c.extraMin, c.extraMax, "Figüran", state);
  }
  // Oransal filtreler
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

  // Set filtreleri
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

  // Çakışma
  const conflictKeys = ["genres","original_language","production_countries","story_locations","filming_locations","story_period","story_geography","season","character_traits","aspect_ratio","narrative_style","production_process","sound","reality","story_dimensions"];
  for (const k of conflictKeys) {
    const f = filters[k];
    if (!f || !f.conflict) continue;
    if (f.include?.length && f.exclude?.length) {
      const incSet = new Set(f.include.map(x => norm(x.label || x)));
      const excSet = new Set(f.exclude.map(x => norm(x.label || x)));
      const profileVals = (profile[k === "original_language" ? "spoken_languages" : k] || []).map(norm);
      const hasInc = [...incSet].some(x => profileVals.includes(x));
      const hasExc = [...excSet].some(x => profileVals.includes(x));
      if (hasInc && hasExc) { state.match = false; state.reasons.push(`${k}: çakışan dahil/hariç (izin verilmedi)`); }
    }
  }

  return state;
}

// ---------- /research ----------
async function handleResearch(env, body) {
  const movies = Array.isArray(body.movies) ? body.movies.slice(0, 5) : [];
  if (!movies.length) return { movies: [] };
  const filters = body.filters || {};
  const settings = { useAI: body.useAI === true, useWebResearch: body.useWebResearch === true };
  const forceRefresh = body.refresh === true;

  const results = [];
  for (const movie of movies) {
    const movieId = movieKey(movie);
    const existing = await getProfileRow(env, movieId);
    const fieldRows = await getFieldRows(env, movieId);
    const profile = existing?.data || {};

    if (!profile.vote_average && movie.vote_average != null) profile.vote_average = movie.vote_average;
    if (!profile.vote_count && movie.vote_count != null) profile.vote_count = movie.vote_count;
    if (!profile.overview && movie.overview) profile.overview = movie.overview;
    if (!profile.poster_path && movie.poster_path) profile.poster_path = movie.poster_path;
    if (!profile.release_date && movie.release_date) profile.release_date = movie.release_date;

    const stale = findStaleFields(profile, fieldRows, forceRefresh);
    if (stale.length) {
      const { updates, covered } = await enrichProfile(env, movie, stale, settings);
      Object.assign(profile, updates);
      for (const f of covered) if (profile[f] !== undefined && profile[f] !== null) await putFieldRow(env, movieId, f, FIELD_DEFS[f].source);
      await putProfileRow(env, movieId, movie.title, yearOf(movie), profile, forceRefresh);
    }

    const evalResult = evaluateFilters(profile, filters);
    results.push({
      id: movie.id,
      ...movie,
      ...profile,
      filter_match: evalResult.match,
      filter_reasons: evalResult.reasons,
      unknown: evalResult.unknown,
      conflicts: evalResult.conflicts,
      _fromCache: stale.length === 0
    });
  }
  return { movies: results };
}

// ---------- Yönlendirme ----------
async function tmdbRoute(env, url) {
  const path = url.pathname.replace(/^\/tmdb/, "");
  if (path === "/genre/movie/list") return tmdb(env, path, { language: url.searchParams.get("language") || "tr-TR" });
  if (path === "/configuration/languages") return tmdb(env, path);
  if (path === "/configuration/countries") return tmdb(env, path, { language: url.searchParams.get("language") || "tr-TR" });
  if (path === "/discover/movie") {
    const allowed = ["language","sort_by","vote_average.gte","vote_average.lte","vote_count.gte","page","primary_release_date.gte","primary_release_date.lte","with_genres","without_genres","with_original_language","with_origin_country","with_text_query"];
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
      return response(await wikidata(env, movie));
    }
    if (url.pathname === "/commons") {
      const movie = { title: url.searchParams.get("title"), original_title: url.searchParams.get("title") };
      return response(await commons(env, movie));
    }
    if (url.pathname === "/research" || url.pathname === "/gemini-interactions") {
      if (request.method !== "POST") return jsonError("Bu uç nokta POST bekliyor.", 405);
      let body;
      try { body = await request.json(); } catch { return jsonError("Geçersiz JSON gövdesi.", 400); }
      return response(await handleResearch(env, body));
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
