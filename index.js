import { FIELD_DEFS, LLM_FIELDS } from "./fields.config.js";

// ---------- Model zincirleri ----------
const GROQ_MODEL_CHAIN = [
  "openai/gpt-oss-120b",
  "openai/gpt-oss-20b"
];
const GROQ_MODEL_DEFAULT = "openai/gpt-oss-120b";

const GEMINI_MODEL_CHAIN = [
  "gemini-3.8-flash",
  "gemini-3.7-flash",
  "gemini-3.6-flash",
  "gemini-3.5-flash-lite",
  "gemini-3.1-flash-lite"
];
const GEMINI_MODEL_DEFAULT = "gemini-3.8-flash";

const GROQ_BASE = "https://api.groq.com/openai/v1";
const GOOGLE_INTERACTIONS = "https://generativelanguage.googleapis.com/v1beta/interactions";
const GOOGLE_GENERATE = "https://generativelanguage.googleapis.com/v1beta/models";
const TMDB_BASE = "https://api.themoviedb.org/3";
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type,Authorization"
};

const GROQ_TPM_BUDGET = 7000;
const GROQ_MAX_OUTPUT_TOKENS = 1500;
const GROQ_MAX_MOVIES_PER_CALL = 3;
const GROQ_MAX_PROMPT_CHARS = 9000;
const LLM_DEADLINE_MS = 50000;

function response(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status, headers: { ...CORS, "Content-Type": "application/json; charset=utf-8" }
  });
}
function jsonError(message, status = 500, extra = {}) {
  return response({ error: String(message), ...extra }, status);
}
function safeJSON(text, fallback = null) { try { return JSON.parse(text); } catch { return fallback; } }
function norm(s) {
  return String(s || "").trim().toLowerCase()
    .replace(/İ/g, "i").replace(/I/g, "ı")
    .replace(/Ş/g, "ş").replace(/Ğ/g, "ğ")
    .replace(/Ü/g, "ü").replace(/Ö/g, "ö").replace(/Ç/g, "ç")
    .replace(/Â/g, "a").replace(/Î/g, "i").replace(/Û/g, "u")
    .replace(/\s+/g, " ");
}
function yearOf(m) { return Number(String(m.release_date || "").slice(0, 4)) || Number(m.year) || 0; }
function movieKey(m) { return String(m.id || m.tmdb_id || ""); }
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

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
         title = excluded.title,
         year = excluded.year,
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
async function putFieldRows(env, movieId, fields, sourceLookup) {
  if (!env.DB || !fields.length) return;
  const now = Math.floor(Date.now() / 1000);
  try {
    const stmts = fields.map(f => env.DB.prepare(
      `INSERT INTO movie_profile_fields (movie_id, field, source, fetched_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(movie_id, field) DO UPDATE SET source = excluded.source, fetched_at = excluded.fetched_at`
    ).bind(movieId, f, sourceLookup[f] || "unknown", now));
    await env.DB.batch(stmts);
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
    if (def.ttl == null) continue;
    const at = fetched.get(field) || 0;
    if (now - at > def.ttl) stale.push(field);
  }
  return stale;
}

// ---------- Dış servisler ----------
function combineSignals(outerSignal, timeoutMs) {
  const signals = [];
  if (timeoutMs) signals.push(AbortSignal.timeout(timeoutMs));
  if (outerSignal) signals.push(outerSignal);
  if (signals.length === 0) return undefined;
  if (signals.length === 1) return signals[0];
  if (typeof AbortSignal.any === "function") return AbortSignal.any(signals);
  const ac = new AbortController();
  const abort = () => ac.abort();
  for (const s of signals) {
    if (s.aborted) { ac.abort(); return ac.signal; }
    s.addEventListener("abort", abort);
  }
  return ac.signal;
}

async function fetchJSON(url, options = {}, label = "Uzak servis", timeoutMs = 18000, outerSignal) {
  const signal = combineSignals(outerSignal, timeoutMs);
  const res = await fetch(url, { ...options, signal });
  const body = await res.text();
  const data = safeJSON(body, null);
  if (!res.ok) throw new Error(`${label}: HTTP ${res.status} ${body.slice(0, 300)}`);
  if (!data) throw new Error(`${label}: JSON yanıtı alınamadı`);
  return data;
}

async function fetchGroqJSON(url, options, label, timeoutMs, outerSignal) {
  const signal = combineSignals(outerSignal, timeoutMs);
  const res = await fetch(url, { ...options, signal });
  const body = await res.text();
  const data = safeJSON(body, null);
  if (res.status === 429) {
    const retryAfter = Number(res.headers.get("retry-after") || 0);
    const waitMs = retryAfter > 0 ? retryAfter * 1000 : 3000;
    const error = new Error(`${label}: HTTP 429 rate limit (retry-after=${retryAfter || "yok"})`);
    error.retryAfterMs = Math.min(waitMs, 60000);
    throw error;
  }
  if (!res.ok) throw new Error(`${label}: HTTP ${res.status} ${body.slice(0, 300)}`);
  if (!data) throw new Error(`${label}: JSON yanıtı alınamadı`);
  return data;
}

async function tmdb(env, path, params = {}, outerSignal) {
  if (!env.TMDB_API_KEY) throw new Error("TMDB_API_KEY tanımlı değil.");
  const url = new URL(TMDB_BASE + path);
  url.searchParams.set("api_key", env.TMDB_API_KEY);
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== "") url.searchParams.set(k, String(v));
  return fetchJSON(url.toString(), {}, "TMDB", 18000, outerSignal);
}
async function omdb(env, params, outerSignal) {
  if (!env.OMDB_API_KEY) throw new Error("OMDB_API_KEY tanımlı değil.");
  const url = new URL("https://www.omdbapi.com/");
  url.searchParams.set("apikey", env.OMDB_API_KEY);
  for (const [k, v] of Object.entries(params)) if (v) url.searchParams.set(k, v);
  const data = await fetchJSON(url.toString(), {}, "OMDb", 18000, outerSignal);
  if (data.Response === "False") throw new Error(data.Error || "OMDb sonucu bulunamadı.");
  return data;
}
async function omdbBest(env, movie, outerSignal) {
  const title = movie.original_title || movie.title || "";
  const year = String(yearOf(movie) || "");
  let lastErr = null;
  if (title) {
    try { return await omdb(env, { t: title, y: year }, outerSignal); } catch (e) { lastErr = e; }
  }
  if (movie.imdb_id) {
    try { return await omdb(env, { i: movie.imdb_id }, outerSignal); } catch (e) { lastErr = e; }
  }
  throw lastErr || new Error("OMDb: arama yapılamadı");
}

// ---------- Wikidata ----------
function buildWikidataBatchQuery(movies) {
  const rows = movies.map(m => {
    const title = (m.original_title || m.title || "").replace(/\\/g, "\\\\").replace(/"/g, '\\"');
    return `("${title}"@en ${m.id})`;
  }).join(" ");
  return `
SELECT ?movieId ?item ?originalWorkLabel ?filmingLocationLabel ?filmingCountryLabel WHERE {
  VALUES (?title ?movieId) { ${rows} }
  ?item rdfs:label ?title .
  ?item wdt:P31 wd:Q11424 .
  OPTIONAL { ?item wdt:P144 ?originalWork. }
  OPTIONAL { ?item wdt:P915 ?filmingLocation. }
  OPTIONAL { ?filmingLocation wdt:P17 ?filmingCountry. }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en,tr". }
}
LIMIT 200`;
}
async function wikidataBatchOnce(env, movies, timeoutMs, outerSignal) {
  const results = new Map();
  if (!movies.length) return results;
  const query = buildWikidataBatchQuery(movies);
  const url = "https://query.wikidata.org/sparql?query=" + encodeURIComponent(query);
  const data = await fetchJSON(url, {
    headers: { "Accept": "application/sparql-results+json", "User-Agent": "FilmKesifMotoru/1.0" }
  }, "Wikidata", timeoutMs, outerSignal);
  const bindings = data.results?.bindings || [];
  const byId = new Map();
  for (const b of bindings) {
    const id = b.movieId?.value || "";
    if (!byId.has(id)) byId.set(id, { originalWork: null, locations: new Set(), countries: new Set() });
    const rec = byId.get(id);
    if (b.originalWorkLabel?.value) rec.originalWork = b.originalWorkLabel.value;
    if (b.filmingLocationLabel?.value) rec.locations.add(b.filmingLocationLabel.value);
    if (b.filmingCountryLabel?.value) rec.countries.add(b.filmingCountryLabel.value);
  }
  for (const [id, rec] of byId) {
    results.set(id, {
      originalWork: rec.originalWork,
      filmingLocations: [...rec.locations],
      filmingCountries: [...rec.countries]
    });
  }
  return results;
}
async function wikidataBatch(env, movies, outerSignal) {
  try {
    return await wikidataBatchOnce(env, movies, 30000, outerSignal);
  } catch (e) {
    console.warn("wikidata batch:", e.message);
    return new Map();
  }
}

// ---------- Commons ----------
function isLikelySceneImage(img) {
  const text = `${img.title || ""} ${img.description || ""} ${img.categories || ""}`.toLowerCase();
  if (/(poster|portrait|headshot|actor|actress|cast|logo|cover|selfie|signature)/.test(text)) return false;
  return /(still|scene|screenshot|frame|film)/.test(text);
}
async function commonsScenes(env, movie, outerSignal) {
  const title = movie.original_title || movie.title || "";
  if (!title) return [];
  const url = new URL("https://commons.wikimedia.org/w/api.php");
  url.searchParams.set("action", "query");
  url.searchParams.set("format", "json");
  url.searchParams.set("generator", "search");
  url.searchParams.set("gsrsearch", `filetype:bitmap "${title}" film still OR scene`);
  url.searchParams.set("gsrnamespace", "6");
  url.searchParams.set("gsrlimit", "20");
  url.searchParams.set("prop", "imageinfo");
  url.searchParams.set("iiprop", "url|extmetadata");
  url.searchParams.set("iiurlwidth", "640");
  const data = await fetchJSON(url.toString(), { headers: { "User-Agent": "FilmKesifMotoru/1.0" } }, "Wikimedia Commons", 18000, outerSignal);
  const pages = Object.values(data.query?.pages || {});
  return pages.map(p => {
    const i = p.imageinfo?.[0] || {}, meta = i.extmetadata || {};
    return {
      source: "commons",
      title: p.title || "",
      url: i.thumburl || i.url || "",
      pageUrl: i.descriptionurl || "",
      description: meta.ImageDescription?.value || "",
      categories: meta.Categories?.value || "",
      license: meta.LicenseShortName?.value || ""
    };
  }).filter(x => x.url && isLikelySceneImage(x)).slice(0, 9);
}

// ---------- TMDB backdrops ----------
async function tmdbBackdrops(env, movie, outerSignal) {
  if (!movie.id) return [];
  const data = await tmdb(env, `/movie/${movie.id}/images`, { include_image_language: "en,tr,null" }, outerSignal);
  const backdrops = Array.isArray(data.backdrops) ? data.backdrops : [];
  return backdrops.slice(0, 9).map(b => ({
    source: "tmdb",
    title: movie.original_title || movie.title || "",
    url: `https://image.tmdb.org/t/p/w780${b.file_path}`,
    pageUrl: `https://www.themoviedb.org/movie/${movie.id}`,
    license: "TMDB",
    description: ""
  })).filter(x => x.url);
}

// ---------- Tavily ----------
async function tavily(env, query, outerSignal) {
  if (!env.TAVILY_API_KEY) return { results: [], warning: "TAVILY_API_KEY ayarlanmamış." };
  const data = await fetchJSON("https://api.tavily.com/search", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ api_key: env.TAVILY_API_KEY, query, search_depth: "basic", max_results: 5, include_answer: false, include_raw_content: false })
  }, "Tavily", 20000, outerSignal);
  return { results: (data.results || []).map(x => ({ title: x.title || "", url: x.url || "", content: (x.content || "").slice(0, 1800), score: x.score || 0 })) };
}

// ---------- LLM katmanı: Groq (birincil) + Gemini (yedek) ----------
function estimateTokens(text) {
  return Math.ceil(String(text || "").length / 4);
}

function normalizeModelName(m) {
  return String(m || "").trim().toLowerCase().replace(/^models\//, "");
}

function buildGroqModelChain(env) {
  const seen = new Set();
  const chain = [];
  const push = (m) => {
    const n = normalizeModelName(m);
    if (!n || seen.has(n)) return;
    seen.add(n);
    chain.push(n);
  };
  push(env.GROQ_MODEL);
  for (const m of GROQ_MODEL_CHAIN) push(m);
  return chain;
}

function buildGeminiModelChain(env) {
  const seen = new Set();
  const chain = [];
  const push = (m) => {
    const n = normalizeModelName(m);
    if (!n || seen.has(n)) return;
    seen.add(n);
    chain.push(n);
  };
  push(env.GEMINI_MODEL);
  for (const m of GEMINI_MODEL_CHAIN) push(m);
  return chain;
}

function extractGeminiText(data) {
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
  const push = (v) => { if (typeof v === "string" && v) texts.push(v); };
  const walk = (obj, depth = 0) => {
    if (!obj || depth > 6) return;
    if (typeof obj === "string") { push(obj); return; }
    if (Array.isArray(obj)) { for (const x of obj) walk(x, depth + 1); return; }
    if (typeof obj === "object") {
      for (const key of ["text", "content", "output", "parts", "result", "response", "value", "message"]) {
        if (obj[key] !== undefined) walk(obj[key], depth + 1);
      }
    }
  };
  for (const o of list) walk(o);
  const steps = data?.steps;
  if (Array.isArray(steps)) for (const s of steps) walk(s);
  if (texts.length) return texts.join("\n");
  return "";
}

async function callGroq(env, key, model, prompt, maxOutputTokens, useSearch, outerSignal) {
  const promptTokens = estimateTokens(prompt);
  const safeOutput = Math.max(256, Math.min(maxOutputTokens, GROQ_TPM_BUDGET - promptTokens));
  const body = {
    model,
    messages: [{ role: "user", content: prompt }],
    temperature: 0.2,
    max_completion_tokens: safeOutput
  };
  if (useSearch) {
    body.tools = [{ type: "browser_search" }];
    body.tool_choice = "required";
  } else {
    body.response_format = { type: "json_object" };
  }
  const data = await fetchGroqJSON(`${GROQ_BASE}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${key}`
    },
    body: JSON.stringify(body)
  }, `Groq ${model}`, 60000, outerSignal);
  const text = data?.choices?.[0]?.message?.content || "";
  if (!text) throw new Error(`Groq ${model} yanıtında metin yok.`);
  return text;
}

async function callGeminiInteractions(env, key, model, prompt, outerSignal) {
  const data = await fetchJSON(GOOGLE_INTERACTIONS, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": key },
    body: JSON.stringify({ model, input: prompt })
  }, `Gemini Interactions ${model}`, 25000, outerSignal);
  const text = extractGeminiText(data);
  if (!text) throw new Error(`Gemini Interactions ${model} yanıtında metin yok.`);
  return text;
}

async function callGeminiGenerate(env, key, model, prompt, outerSignal) {
  const url = `${GOOGLE_GENERATE}/${encodeURIComponent(model)}:generateContent`;
  const data = await fetchJSON(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": key },
    body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
  }, `Gemini generateContent ${model}`, 25000, outerSignal);
  const text = extractGeminiText(data);
  if (!text) throw new Error(`Gemini generateContent ${model} yanıtında metin yok.`);
  return text;
}

async function callGeminiModel(env, key, model, prompt, outerSignal) {
  const errors = [];
  try {
    return await callGeminiInteractions(env, key, model, prompt, outerSignal);
  } catch (e) {
    const msg = String(e.message || e);
    errors.push(`interactions: ${msg}`);
    console.warn(`gemini: interactions model=${model} başarısız — ${msg}`);
    if (/HTTP 40[13]|invalid.?key|forbidden|unauthor/i.test(msg)) {
      throw new Error(`Gemini ${model} anahtar geçersiz: ${msg}`);
    }
  }
  try {
    return await callGeminiGenerate(env, key, model, prompt, outerSignal);
  } catch (e) {
    const msg = String(e.message || e);
    errors.push(`generateContent: ${msg}`);
    console.warn(`gemini: generateContent model=${model} başarısız — ${msg}`);
    throw new Error(errors.join(" | "));
  }
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
async function callLLMWithFallback(env, prompt, maxOutputTokens, useSearch, outerSignal) {
  const deadline = Date.now() + LLM_DEADLINE_MS;
  const errors = [];

  const groqKeys = [env.GROQ_API_KEY_1, env.GROQ_API_KEY_2, env.GROQ_API_KEY_3]
    .map((k, i) => ({ key: k, index: i + 1 }))
    .filter(x => x.key);
  const groqDead = new Set();
  const groqModels = buildGroqModelChain(env);

  for (const model of groqModels) {
    if (Date.now() > deadline) break;
    for (const { key, index } of groqKeys) {
      if (groqDead.has(index)) continue;
      if (Date.now() > deadline) break;
      if (outerSignal?.aborted) throw new Error("İstemci isteği iptal etti.");
      try {
        return await callGroq(env, key, model, prompt, maxOutputTokens, false, outerSignal);
      } catch (e) {
        const msg = String(e.message || e);
        errors.push(`groq(no-search) ${model} key=${index}: ${msg}`);
        console.warn(`groq(no-search): model=${model} key=${index} başarısız — ${msg}`);
        if (e.retryAfterMs) { await sleep(Math.min(e.retryAfterMs, 5000)); continue; }
        if (/429|quota|rate.?limit|exceeded|aborted due to timeout|timed? ?out|network|fetch failed|socket|forbidden|unauthor|invalid.?key/i.test(msg)) {
          groqDead.add(index);
        }
      }
    }
  }

  if (useSearch && groqDead.size < groqKeys.length) {
    for (const model of groqModels) {
      if (Date.now() > deadline) break;
      for (const { key, index } of groqKeys) {
        if (groqDead.has(index)) continue;
        if (Date.now() > deadline) break;
        if (outerSignal?.aborted) throw new Error("İstemci isteği iptal etti.");
        try {
          return await callGroq(env, key, model, prompt, maxOutputTokens, true, outerSignal);
        } catch (e) {
          const msg = String(e.message || e);
          errors.push(`groq(search) ${model} key=${index}: ${msg}`);
          console.warn(`groq(search): model=${model} key=${index} başarısız — ${msg}`);
          if (e.retryAfterMs) { await sleep(Math.min(e.retryAfterMs, 5000)); continue; }
          if (/429|quota|rate.?limit|exceeded|aborted due to timeout|timed? ?out|network|fetch failed|socket|forbidden|unauthor|invalid.?key/i.test(msg)) {
            groqDead.add(index);
          }
        }
      }
    }
  }

  const geminiKeys = [env.GEMINI_API_KEY_1, env.GEMINI_API_KEY_2, env.GEMINI_API_KEY_3]
    .map((k, i) => ({ key: k, index: i + 1 }))
    .filter(x => x.key);
  const geminiDead = new Set();
  const geminiModels = buildGeminiModelChain(env);
  let geminiTried = false;

  if (geminiKeys.length) {
    console.warn("Groq başarısız, Gemini yedek sağlayıcısına geçiliyor...");
    for (const model of geminiModels) {
      if (Date.now() > deadline) break;
      for (const { key, index } of geminiKeys) {
        if (geminiDead.has(index)) continue;
        if (Date.now() > deadline) break;
        if (outerSignal?.aborted) throw new Error("İstemci isteği iptal etti.");
        geminiTried = true;
        try {
          return await callGeminiModel(env, key, model, prompt, outerSignal);
        } catch (e) {
          const msg = String(e.message || e);
          errors.push(`gemini ${model} key=${index}: ${msg}`);
          console.warn(`gemini: model=${model} key=${index} başarısız — ${msg}`);
          if (/429|quota|rate.?limit|exceeded|aborted due to timeout|timed? ?out|network|fetch failed|socket|forbidden|unauthor|invalid.?key/i.test(msg)) {
            geminiDead.add(index);
          }
        }
      }
    }
  }

  const providers = ["Groq"];
  if (geminiTried) providers.push("Gemini");
  throw new Error(`${providers.join(" + ")} tüm modellerde başarısız: ${errors.join(" | ")}`);
}

function extractJSON(text) {
  const clean = String(text).replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "").trim();
  const start = clean.indexOf("{"), end = clean.lastIndexOf("}");
  if (start < 0 || end < start) throw new Error("LLM geçerli JSON döndürmedi.");
  return JSON.parse(clean.slice(start, end + 1));
}
function extractJSONArray(text) {
  const clean = String(text).replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "").trim();
  const start = clean.indexOf("["), end = clean.lastIndexOf("]");
  if (start < 0 || end < start) return null;
  try { return JSON.parse(clean.slice(start, end + 1)); } catch { return null; }
}

function buildBatchLLMPrompt(movies, fieldsByMovie, knownByMovie, filters, useSearch) {
  const f = filters || {};
  const payload = movies.map(m => ({
    id: m.id,
    title: m.title,
    original_title: m.original_title,
    year: yearOf(m),
    fields: fieldsByMovie[m.id] || [],
    known: knownByMovie[m.id] || {}
  }));
  let payloadStr = JSON.stringify(payload);
  if (payloadStr.length > GROQ_MAX_PROMPT_CHARS) {
    payloadStr = JSON.stringify(payload.slice(0, 2));
  }
  const searchNote = useSearch
    ? "Web araması yapabilirsin; bulduğun bilgileri kullanarak yanıtla."
    : "Sağlanan bilgiler dışında kaynak kullanma; emin değilsen null bırak.";
  return `Sen bir film araştırma asistanısın. Yalnızca sağlanan kaynaklardan hareket et; kanıt yoksa düşük güvenli olarak işaretle, uydurma.
${searchNote}
Kullanıcı filtreleri (include = olumlu, exclude = olumsuz): ${JSON.stringify(f).slice(0, 1500)}
Her film için, "fields" listesindeki alanları doldur.
ÖNEMLİ — Kategori alanları için İngilizce slug/ID kullan, etiket değil:
- season: "winter"|"summer"|"spring"|"autumn"
- reality: "true"|"mostly_true"|"inspired"|"realistic"|"fictional"|"utopic"
- narrative_style: "multi"|"reverse"|"linear"|"flashback"|"end_first"|"mid_first"|"fast"|"slow"|"no_end"|"alt_end"|"alt_narr"
- production_process: "amateur"|"indie"|"art"|"big"|"bmovie"|"avant"|"studio"|"no_music"|"rare_music"|"handheld"|"propaganda"|"dogme"
- sound: "ambient"|"music"|"effects"|"voiceover_ext"|"voiceover_int"|"silent"|"dubbed"
- story_geography: "city"|"town"|"village"|"mountain"|"desert"|"steppe"|"forest"|"seaside"|"riverside"|"opensea"|"air"
- character_traits: "male_main"|"female_main"|"child_main"|"lgbt_main"|"male_support"|"female_support"|"child_support"|"lgbt_support"|"young_main"|"middle_main"|"old_main"|"disabled_main"|"animal" vb.
- story_dimensions: "has_sequel"|"is_sequel"|"series_tight"|"series_loose"|"concept"|"has_version"|"same_event"
Sayısal alanlar 0-100 veya null; location_count integer; family_content nesne; related_films string[]; aspect_ratio string.
Yanıt biçimi yalnızca şu JSON dizisi: [{"id": <film_id>, "<alan>": <değer>, ...}, ...]
Filmler: ${payloadStr}`;
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

async function enrichClassic(env, movie, staleFields, settings, filters, outerSignal) {
  const need = new Set(staleFields);
  const updates = {};
  const covered = new Set();
  let webAvailable = null;

  if (movie.id) {
    try {
      const detail = await tmdb(env, `/movie/${movie.id}`, { language: "tr-TR", append_to_response: "credits,images" }, outerSignal);
      const genres = Array.isArray(detail.genres) ? detail.genres : [];
      if (need.has("genres")) { updates.genres = genres.map(g => g.name); covered.add("genres"); }
      if (need.has("genres_ids")) { updates.genres_ids = genres.map(g => g.id); covered.add("genres_ids"); }
      const langs = Array.isArray(detail.spoken_languages) ? detail.spoken_languages : [];
      if (need.has("spoken_languages")) { updates.spoken_languages = langs.map(l => l.name || l.english_name || l.iso_639_1); covered.add("spoken_languages"); }
      if (need.has("spoken_languages_ids")) { updates.spoken_languages_ids = langs.map(l => l.iso_639_1); covered.add("spoken_languages_ids"); }
      const countries = Array.isArray(detail.production_countries) ? detail.production_countries : [];
      if (need.has("production_countries")) { updates.production_countries = countries.map(c => c.name || c.iso_3166_1); covered.add("production_countries"); }
      if (need.has("production_countries_ids")) { updates.production_countries_ids = countries.map(c => c.iso_3166_1); covered.add("production_countries_ids"); }
      if (need.has("runtime")) { updates.runtime = Number(detail.runtime) || null; covered.add("runtime"); }
      if (need.has("production_companies")) {
        updates.production_companies = Array.isArray(detail.production_companies) ? detail.production_companies.map(c => c.name) : [];
        covered.add("production_companies");
      }
      const posters = detail.images?.posters || [];
      const originalPoster = posters.find(p => !p.iso_639_1 || p.iso_639_1 === "en") || posters[0];
      if (originalPoster) updates.original_poster_path = originalPoster.file_path;
      const credits = detail.credits;
      if (credits) {
        const crew = credits.crew || [];
        if (need.has("director")) {
          updates.director = crew.filter(c => c.job === "Director").map(c => ({ name: c.name, profile_path: c.profile_path || null }));
          covered.add("director");
        }
        if (need.has("writers")) {
          updates.writers = crew.filter(c => c.department === "Writing" || c.job === "Writer").map(c => ({ name: c.name, profile_path: c.profile_path || null }));
          covered.add("writers");
        }
        if (need.has("producers")) {
          updates.producers = crew.filter(c => c.job === "Producer").map(c => ({ name: c.name, profile_path: c.profile_path || null }));
          covered.add("producers");
        }
        if (need.has("cast")) {
          updates.cast = (credits.cast || []).slice(0, 8).map(c => ({ name: c.name, profile_path: c.profile_path || null, character: c.character || "" }));
          covered.add("cast");
        }
      }
      if (!movie.imdb_id && detail.imdb_id) movie.imdb_id = detail.imdb_id;
    } catch (e) { console.warn("tmdb detail enrich:", e.message); }
  }

  if (["imdbRating","imdbVotes","imdbID","omdb_directors","actors","rated","awards","metascore","boxOffice"].some(f => need.has(f))) {
    try {
      const data = await omdbBest(env, movie, outerSignal);
      const clean = (v) => (v === "N/A" || v === undefined ? null : v);
      if (need.has("imdbRating")) { updates.imdbRating = clean(data.imdbRating); covered.add("imdbRating"); }
      if (need.has("imdbVotes")) { updates.imdbVotes = clean(data.imdbVotes); covered.add("imdbVotes"); }
      if (need.has("imdbID")) { updates.imdbID = clean(data.imdbID); covered.add("imdbID"); }
      if (need.has("omdb_directors")) { updates.omdb_directors = clean(data.Director); covered.add("omdb_directors"); }
      if (need.has("actors")) {
        updates.actors = data.Actors && data.Actors !== "N/A" ? data.Actors.split(",").map(s => s.trim()).filter(Boolean) : [];
        covered.add("actors");
      }
      if (need.has("rated")) { updates.rated = clean(data.Rated); covered.add("rated"); }
      if (need.has("awards")) { updates.awards = clean(data.Awards); covered.add("awards"); }
      if (need.has("metascore")) { updates.metascore = clean(data.Metascore); covered.add("metascore"); }
      if (need.has("boxOffice")) { updates.boxOffice = clean(data.BoxOffice); covered.add("boxOffice"); }
    } catch (e) { console.warn("omdb enrich:", e.message); }
  }

  const remainingAfterClassic = [...need].filter(f => !covered.has(f));
  if (settings.useWebResearch && remainingAfterClassic.length) {
    webAvailable = false;
    try {
      const freeTerms = [];
      const f = filters || {};
      for (const key of Object.keys(f)) {
        const val = f[key];
        if (!val || typeof val !== "object" || Array.isArray(val)) continue;
        for (const x of val.include || []) if (x && x.id === null && x.label) freeTerms.push(x.label);
      }
      const baseQuery = buildSearchQuery(movie, remainingAfterClassic);
      const fullQuery = freeTerms.length ? `${baseQuery} ${freeTerms.join(" ")}` : baseQuery;
      const w = await tavily(env, fullQuery, outerSignal);
      updates.web_evidence = w.results || [];
      if (Array.isArray(w.results) && w.results.length) webAvailable = true;
      for (const f2 of extractCoveredFields(w.results, remainingAfterClassic)) covered.add(f2);
    } catch (e) { console.warn("tavily enrich:", e.message); }
  }

  return { updates, covered, webAvailable };
}

function toNum(v) {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "string" && /^n\/?a$/i.test(v.trim())) return null;
  const n = Number(String(v).replace(/[^\d.-]/g, ""));
  return Number.isFinite(n) ? n : null;
}

function evalSet(profile, field, f, label, state, unknownIfEmpty = false) {
  if (!f) return;
  const labelData = profile[field];
  const idData = profile[field + "_ids"];
  const have = [
    ...(Array.isArray(labelData) ? labelData.map(norm) : (labelData ? [norm(labelData)] : [])),
    ...(Array.isArray(idData) ? idData.map(norm) : (idData ? [norm(idData)] : []))
  ];
  const empty = have.length === 0;

  const matches = (x) => {
    const labelNorm = norm(x.label || x);
    if (have.includes(labelNorm)) return true;
    if (x.id != null && x.id !== "" && x.id !== "__space__" && x.id !== "__studio__") {
      if (have.includes(norm(x.id))) return true;
    }
    return have.some(h => h.includes(labelNorm) || labelNorm.includes(h));
  };

  if (f.include?.length) {
    const missing = f.include.filter(x => !matches(x));
    if (missing.length) {
      if (empty && unknownIfEmpty) { state.unknown = true; state.reasons.push(`${label}: bilinmiyor (elendi değil)`); }
      else { state.match = false; state.reasons.push(`${label}: eksik ${missing.map(x => x.label || x).join(", ")}`); }
    } else state.reasons.push(`${label}: dahil edilenler tamam`);
  }
  if (f.exclude?.length) {
    const hit = f.exclude.filter(x => matches(x));
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

function evalFilmingLocations(profile, f, state) {
  if (!f) return;
  const locations = (profile.filming_locations || []).map(norm);
  const countries = (profile.filming_countries || []).map(norm);
  const empty = locations.length === 0 && countries.length === 0;
  const hasStudio = locations.some(x => /studio|stüdyo/.test(x));

  const matches = (x) => {
    const v = norm(x.label || x);
    if (v === "__studio__" || v === "stüdyo") return hasStudio;
    if (countries.includes(v)) return true;
    return locations.some(loc => loc.includes(v) || v.includes(loc));
  };

  if (f.include?.length) {
    const missing = f.include.filter(x => !matches(x));
    if (missing.length) {
      if (empty) { state.unknown = true; state.reasons.push("Çekim yeri: bilinmiyor (elendi değil)"); }
      else { state.match = false; state.reasons.push(`Çekim yeri: eksik ${missing.map(x => x.label || x).join(", ")}`); }
    } else state.reasons.push("Çekim yeri: dahil edilenler tamam");
  }
  if (f.exclude?.length) {
    const hit = f.exclude.filter(x => matches(x));
    if (hit.length) {
      state.match = false;
      state.reasons.push(`Çekim yeri: hariç tutulanlar mevcut ${hit.map(x => x.label || x).join(", ")}`);
      state.conflicts = true;
    }
  }
}

function evaluateFilters(profile, filters) {
  const state = { match: true, reasons: [], unknown: false, conflicts: false };
  const imdbActive = (filters.imdbMin != null && filters.imdbMin > 0) || (filters.imdbMax != null && filters.imdbMax < 10);
  evalRange(profile, "imdbRating", filters.imdbMin, filters.imdbMax, "IMDb puanı", state, imdbActive);
  const tmdbActive = (filters.tmdbMin != null && filters.tmdbMin > 0) || (filters.tmdbMax != null && filters.tmdbMax < 10);
  evalRange(profile, "vote_average", filters.tmdbMin, filters.tmdbMax, "TMDB puanı", state, tmdbActive);
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
  evalSet(profile, "genres_ids", filters.genres, "Tür", state, true);
  evalSet(profile, "spoken_languages_ids", filters.original_language, "Dil", state, true);
  evalSet(profile, "production_countries_ids", filters.production_countries, "Ülke", state, true);
  evalSet(profile, "story_locations", filters.story_locations, "Hikâye yeri", state, true);
  evalFilmingLocations(profile, filters.filming_locations, state);
  evalSet(profile, "story_period", filters.story_period, "Dönem", state, true);
  evalSet(profile, "story_geography", filters.story_geography, "Coğrafya", state, true);
  evalSet(profile, "season", filters.season, "Mevsim", state, true);
  evalSet(profile, "character_traits", filters.character_traits, "Karakter niteliği", state, true);
  evalSet(profile, "aspect_ratio", filters.aspect_ratio, "En-boy oranı", state, true);
  evalSet(profile, "narrative_style", filters.narrative_style, "Anlatım tarzı", state, true);
  evalSet(profile, "production_process", filters.production_process, "Çekim süreci", state, true);
  evalSet(profile, "sound", filters.sound, "Ses", state, true);
  evalSet(profile, "reality", filters.reality, "Gerçeklik", state, true);
  evalSet(profile, "story_dimensions", filters.story_dimensions, "Hikâye boyutları", state, true);

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
async function handleResearchStream(env, body, controller, signal) {
  const enc = new TextEncoder();
  const send = (obj) => controller.enqueue(enc.encode(`data: ${JSON.stringify(obj)}\n\n`));
  try {
    const movies = Array.isArray(body.movies) ? body.movies.slice(0, 5) : [];
    const total = movies.length;
    if (!total) { send({ type: "done", movies: [] }); return; }

    const filters = body.filters || {};
    const settings = { useAI: body.useAI === true, useWebResearch: body.useWebResearch === true };
    const forceRefresh = body.refresh === true || body.forceAll === true;
    const forceAll = body.forceAll === true;

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

      let stale = findStaleFields(profile, fieldRows, forceRefresh);
      if (forceAll) stale = Object.keys(FIELD_DEFS);
      prepared.push({ movie, movieId, profile, stale, webAvailable: null, aiNeeded: [] });
    }

    for (let i = 0; i < prepared.length; i++) {
      if (signal?.aborted) return;
      const p = prepared[i];
      send({ type: "step", index: i, total, title: p.movie.original_title || p.movie.title, stage: p.stale.length ? "zenginleştiriliyor" : "önbellekten", fields: p.stale.slice(0, 6) });
      const classic = await enrichClassic(env, p.movie, p.stale, settings, filters, signal);
      Object.assign(p.profile, classic.updates);
      const covered = [...classic.covered].filter(f => p.profile[f] !== undefined && p.profile[f] !== null);
      await putFieldRows(env, p.movieId, covered, Object.fromEntries(covered.map(f => [f, FIELD_DEFS[f]?.source || "unknown"])));
      p.webAvailable = classic.webAvailable;
    }

    const needWiki = !!(filters.original_work?.include?.length || filters.original_work?.exclude?.length
      || filters.filming_locations?.include?.length || filters.filming_locations?.exclude?.length);
    if (needWiki) {
      const wikiNeeded = prepared.filter(p => p.stale.includes("original_work") || p.stale.includes("filming_locations"));
      if (wikiNeeded.length) {
        const wikiResults = await wikidataBatch(env, wikiNeeded.map(p => p.movie), signal);
        for (const p of wikiNeeded) {
          const rec = wikiResults.get(String(p.movie.id));
          if (!rec) continue;
          const covered = [];
          if (p.stale.includes("original_work") && rec.originalWork) { p.profile.original_work = rec.originalWork; covered.push("original_work"); }
          if (p.stale.includes("filming_locations") && rec.filmingLocations.length) { p.profile.filming_locations = rec.filmingLocations; covered.push("filming_locations"); }
          if (rec.filmingCountries && rec.filmingCountries.length) { p.profile.filming_countries = rec.filmingCountries; }
          await putFieldRows(env, p.movieId, covered, Object.fromEntries(covered.map(f => [f, "wikidata"])));
        }
      }
    }

    for (const p of prepared) {
      const coveredNow = new Set();
      for (const f of p.stale) {
        if (p.profile[f] !== undefined && p.profile[f] !== null) coveredNow.add(f);
      }
      p.aiNeeded = [...p.stale].filter(f => !coveredNow.has(f) && FIELD_DEFS[f]?.source === "llm");
    }

    let aiAvailable = false;
    const aiRequested = settings.useAI && prepared.some(p => p.aiNeeded.length);
    const useLLMSearch = settings.useWebResearch;
    if (aiRequested) {
      const aiMovies = prepared.filter(p => p.aiNeeded.length);
      for (let start = 0; start < aiMovies.length; start += GROQ_MAX_MOVIES_PER_CALL) {
        const chunk = aiMovies.slice(start, start + GROQ_MAX_MOVIES_PER_CALL);
        if (signal?.aborted) break;
        const fieldsByMovie = {};
        const knownByMovie = {};
        for (const p of chunk) {
          fieldsByMovie[p.movie.id] = p.aiNeeded;
          knownByMovie[p.movie.id] = { title: p.movie.title, original_title: p.movie.original_title, year: yearOf(p.movie) };
        }
        try {
          const prompt = buildBatchLLMPrompt(chunk.map(p => p.movie), fieldsByMovie, knownByMovie, filters, useLLMSearch);
          const raw = await callLLMWithFallback(env, prompt, GROQ_MAX_OUTPUT_TOKENS, useLLMSearch, signal);
          const arr = extractJSONArray(raw) || (() => {
            try { const obj = extractJSON(raw); return obj.movies || []; } catch { return []; }
          })();
          const byId = new Map();
          for (const item of arr) {
            const id = item && (item.id ?? item.movie_id);
            if (id != null) byId.set(String(id), item);
          }
          for (const p of chunk) {
            const item = byId.get(String(p.movie.id));
            if (item) {
              const covered = [];
              for (const f of p.aiNeeded) {
                if (item[f] !== undefined && item[f] !== null) { p.profile[f] = item[f]; covered.push(f); }
              }
              await putFieldRows(env, p.movieId, covered, Object.fromEntries(covered.map(f => [f, "llm"])));
            }
          }
          aiAvailable = true;
        } catch (e) {
          console.warn("llm toplu enrich:", e.message);
          aiAvailable = false;
        }
      }
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
  } catch (err) {
    console.error("handleResearchStream fatal:", err);
    try { controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify({ type: "error", message: String(err.message || err) })}\n\n`)); } catch {}
  } finally {
    try { controller.close(); } catch {}
  }
}

async function handleImages(env, url, signal) {
  const id = url.searchParams.get("id");
  const title = url.searchParams.get("title") || "";
  const originalTitle = url.searchParams.get("original_title") || title;
  const movie = { id, title, original_title: originalTitle };
  const [tmdbList, commonsList] = await Promise.all([
    tmdbBackdrops(env, movie, signal).catch(e => { console.warn("tmdb backdrops:", e.message); return []; }),
    commonsScenes(env, movie, signal).catch(e => { console.warn("commons scenes:", e.message); return []; })
  ]);
  const merged = [...tmdbList, ...commonsList].slice(0, 9);
  return { images: merged };
}

async function tmdbRoute(env, url, signal) {
  const path = url.pathname.replace(/^\/tmdb/, "");
  if (path === "/genre/movie/list") return tmdb(env, path, { language: url.searchParams.get("language") || "tr-TR" }, signal);
  if (path === "/configuration/languages") return tmdb(env, path, {}, signal);
  if (path === "/configuration/countries") return tmdb(env, path, { language: url.searchParams.get("language") || "tr-TR" }, signal);
  if (path === "/discover/movie") {
    const allowed = ["language","sort_by","vote_average.gte","vote_average.lte","vote_count.gte","page","primary_release_date.gte","primary_release_date.lte","with_genres","without_genres","with_original_language","with_origin_country","with_runtime.gte","with_runtime.lte","with_text_query"];
    const params = {};
    for (const key of allowed) if (url.searchParams.has(key)) params[key] = url.searchParams.get(key);
    return tmdb(env, path, params, signal);
  }
  if (path === "/search/movie") return tmdb(env, path, { query: url.searchParams.get("query") || "", language: url.searchParams.get("language") || "tr-TR", page: url.searchParams.get("page") || 1, include_adult: "false" }, signal);
  if (path === "/movie/details") {
    const id = url.searchParams.get("id");
    if (!id || !/^\d+$/.test(id)) throw Object.assign(new Error("TMDB film ID geçersiz."), { status: 400 });
    const lang = url.searchParams.get("language") || "tr-TR";
    const [movie, credits] = await Promise.all([tmdb(env, `/movie/${id}`, { language: lang }, signal), tmdb(env, `/movie/${id}/credits`, {}, signal)]);
    const imdb = movie.imdb_id ? await omdb(env, { i: movie.imdb_id }, signal).catch(() => null) : null;
    return { ...movie, credits, imdbRating: imdb?.imdbRating || null, imdbVotes: imdb?.imdbVotes || null };
  }
  throw Object.assign(new Error("Bilinmeyen TMDB uç noktası."), { status: 404 });
}

async function handleRequest(request, env, ctx) {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  const url = new URL(request.url);
  try {
    if (url.pathname === "/health") {
      return response({
        ok: true,
        groqModel: env.GROQ_MODEL || GROQ_MODEL_DEFAULT,
        groqModels: buildGroqModelChain(env),
        geminiModel: env.GEMINI_MODEL || GEMINI_MODEL_DEFAULT,
        geminiModels: buildGeminiModelChain(env),
        tmdb: !!env.TMDB_API_KEY, omdb: !!env.OMDB_API_KEY, tavily: !!env.TAVILY_API_KEY,
        groqKeys: [!!env.GROQ_API_KEY_1, !!env.GROQ_API_KEY_2, !!env.GROQ_API_KEY_3],
        geminiKeys: [!!env.GEMINI_API_KEY_1, !!env.GEMINI_API_KEY_2, !!env.GEMINI_API_KEY_3],
        d1: !!env.DB
      });
    }
    if (url.pathname.startsWith("/tmdb/")) return response(await tmdbRoute(env, url, request.signal));
    if (url.pathname === "/omdb") {
      const params = {};
      for (const k of ["i","t","y","type"]) if (url.searchParams.has(k)) params[k] = url.searchParams.get(k);
      return response(await omdb(env, params, request.signal));
    }
    if (url.pathname === "/images") {
      return response(await handleImages(env, url, request.signal));
    }
    if (url.pathname === "/wikidata") {
      const movie = { id: url.searchParams.get("id"), title: url.searchParams.get("title"), original_title: url.searchParams.get("title"), year: url.searchParams.get("year") };
      const res = await wikidataBatch(env, [movie], request.signal);
      return response({ items: [], ...(res.get(String(movie.id)) || { originalWork: null, filmingLocations: [], filmingCountries: [] }) });
    }
    if (url.pathname === "/commons") {
      const movie = { title: url.searchParams.get("title"), original_title: url.searchParams.get("title") };
      return response({ images: await commonsScenes(env, movie, request.signal) });
    }
    if (url.pathname === "/research" || url.pathname === "/llm-interactions") {
      if (request.method !== "POST") return jsonError("Bu uç nokta POST bekliyor.", 405);
      let body;
      try { body = await request.json(); } catch { return jsonError("Geçersiz JSON gövdesi.", 400); }

      const { readable, writable } = new TransformStream();
      const writer = writable.getWriter();
      const controller = {
        enqueue: (chunk) => writer.write(chunk),
        close: () => writer.close()
      };
      const task = handleResearchStream(env, body, controller, request.signal).catch(err => {
        try { controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify({ type: "error", message: String(err.message || err) })}\n\n`)); } catch {}
        try { controller.close(); } catch {}
      });
      if (ctx?.waitUntil) ctx.waitUntil(task);

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
    const status = e.status || (/API_KEY|Secret .*tanımlı değil|gerekli/.test(message) ? 503 : 500);
    return jsonError(message, status);
  }
}

export default { fetch(request, env, ctx) { return handleRequest(request, env, ctx); } };
