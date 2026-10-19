import { FIELD_DEFS, LLM_FIELDS, FIELD_RULES, SEMANTIC_FIELDS } from "./fields.config.js";

const GROQ_MODEL_CHAIN = ["openai/gpt-oss-120b", "openai/gpt-oss-20b"];
const GROQ_MODEL_DEFAULT = "openai/gpt-oss-120b";
const GEMINI_MODEL_CHAIN = ["gemini-3.8-flash", "gemini-3.7-flash", "gemini-3.6-flash", "gemini-3.5-flash-lite", "gemini-3.1-flash-lite"];
const GEMINI_MODEL_DEFAULT = "gemini-3.8-flash";
const GROQ_BASE = "https://api.groq.com/openai/v1";
const GOOGLE_INTERACTIONS = "https://generativelanguage.googleapis.com/v1beta/interactions";
const GOOGLE_GENERATE = "https://generativelanguage.googleapis.com/v1beta/models";
const TMDB_BASE = "https://api.themoviedb.org/3";
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type,Authorization"
};
const GROQ_TPM_BUDGET = 7000;
const GROQ_MAX_OUTPUT_TOKENS = 1000;
const GROQ_MAX_MOVIES_PER_CALL = 5;
const GROQ_MAX_PROMPT_CHARS = 7000;
const LLM_DEADLINE_MS = 90000;
const VERDICT_TTL = 86400;

const DEFAULT_STAGE1 = `Sen bir film sınıflandırma uzmanısın. Yalnızca verilen bilgilerden hareket et; emin değilsen "unknown" de, uydurma.

ARANAN FİLM:
{{FILTER_SENTENCE}}

FİLTRE BAĞLAMLARI:
{{FILTER_CONTEXT}}

Her film için tek soru: "Bu film ARANAN FİLM tanımına uyuyor mu?"

Filmler:
{{MOVIES}}

Yanıt YALNIZCA: [{"id": <film_id>, "match": "yes"|"no"|"unknown", "reason": "<max 12 kelime>"}]`;

const DEFAULT_STAGE2 = `Sen bir film veri uzmanısın. Aşağıdaki filmler hakkında veri doldur.
Yalnızca kanıtlanabilir bilgiyi yaz; bilmiyorsan null bırak.

Filmler:
{{MOVIES}}

Doldurulacak alanlar:
{{RULES}}

Yanıt YALNIZCA: [{"id": <film_id>, "<alan>": <değer>, ...}]`;

const INTENSITY_TR = { none: "hiç yok", few: "bir veya birkaç sahnede var", side: "yan konu (yoğun)", main: "ana konu (çok yoğun)" };
const APPROACH_TR = { bad: "kötü gösteriyor", neutral: "tarafsız kalıyor", legit: "meşrulaştırıyor" };
const TRAIT_TR = {
  tobacco: "tütün kullanımı", alcohol: "alkol kullanımı", drugs: "uyuşturucu kullanımı",
  sex_nudity: "cinsellik ve çıplaklık", violence: "şiddet ve kan",
  crimes_against_humanity: "insanlığa karşı suçlar", terror: "terör",
  illegal: "yasadışı eylemler", lgbt: "LGBT+ içeriği",
  pedophilia: "pedofili/ensest", unmarried: "nikahsız ilişkiler",
  profanity: "argo ve küfür", disturbing: "ürkütücü sahneler",
  racism: "ırkçılık/ayrımcılık"
};

let geminiRR = 0;
let groqRR = 0;
let deadKeysCache = { ts: 0, gemini: new Set(), groq: new Set() };
const promptCache = { stage1: { ts: 0, template: null }, stage2: { ts: 0, template: null } };

function response(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { ...CORS, "Content-Type": "application/json; charset=utf-8" } });
}
function jsonError(message, status = 500, extra = {}) { return response({ error: String(message), ...extra }, status); }
function safeJSON(text, fallback = null) { try { return JSON.parse(text); } catch { return fallback; } }
function norm(s) {
  return String(s || "").trim().toLowerCase()
    .replace(/İ/g, "i").replace(/I/g, "ı").replace(/Ş/g, "ş").replace(/Ğ/g, "ğ")
    .replace(/Ü/g, "ü").replace(/Ö/g, "ö").replace(/Ç/g, "ç")
    .replace(/Â/g, "a").replace(/Î/g, "i").replace(/Û/g, "u").replace(/\s+/g, " ");
}
function yearOf(m) { return Number(String(m.release_date || "").slice(0, 4)) || Number(m.year) || 0; }
function movieKey(m) { return String(m.id || m.tmdb_id || ""); }
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
function simpleHash(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = ((h << 5) - h + str.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}
function isAdmin(request, env) { return !!env.ADMIN_TOKEN && (request.headers.get("Authorization") || "") === `Bearer ${env.ADMIN_TOKEN}`; }

// ---------- D1: profiles ----------
async function getProfileRow(env, movieId) {
  if (!env.DB) return null;
  try {
    const row = await env.DB.prepare("SELECT data_json, updated_at, last_refreshed_at FROM movie_profiles WHERE movie_id = ?").bind(movieId).first();
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
       ON CONFLICT(movie_id) DO UPDATE SET title = excluded.title, year = excluded.year, data_json = excluded.data_json,
         updated_at = excluded.updated_at, last_refreshed_at = COALESCE(excluded.last_refreshed_at, movie_profiles.last_refreshed_at)`
    ).bind(movieId, title, year, JSON.stringify(data), now, now, refreshedAt).run();
  } catch (e) { console.error("profile write:", e.message); }
}
async function getFieldRows(env, movieId) {
  if (!env.DB) return [];
  try {
    const { results } = await env.DB.prepare("SELECT field, source, fetched_at FROM movie_profile_fields WHERE movie_id = ?").bind(movieId).all();
    return results || [];
  } catch { return []; }
}
async function putFieldRows(env, movieId, fields, sourceLookup) {
  if (!env.DB || !fields.length) return;
  const now = Math.floor(Date.now() / 1000);
  try {
    const stmts = fields.map(f => env.DB.prepare(
      `INSERT INTO movie_profile_fields (movie_id, field, source, fetched_at) VALUES (?, ?, ?, ?)
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

// ---------- D1: dead keys + telemetry + config + verdicts ----------
async function loadDeadKeys(env) {
  const now = Date.now();
  if (now - deadKeysCache.ts < 30000) return deadKeysCache;
  if (!env.DB) return deadKeysCache;
  try {
    const { results } = await env.DB.prepare("SELECT provider, key_index FROM dead_keys WHERE until_ts > ?").bind(Math.floor(now / 1000)).all();
    const gemini = new Set(), groq = new Set();
    for (const r of results || []) { if (r.provider === "gemini") gemini.add(r.key_index); else if (r.provider === "groq") groq.add(r.key_index); }
    deadKeysCache = { ts: now, gemini, groq };
    return deadKeysCache;
  } catch (e) { console.warn("dead_keys read:", e.message); return deadKeysCache; }
}
async function markDeadKey(env, provider, keyIndex, untilTs, reason) {
  deadKeysCache.ts = 0;
  if (!env.DB) return;
  try {
    await env.DB.prepare(
      `INSERT INTO dead_keys (provider, key_index, until_ts, reason) VALUES (?, ?, ?, ?)
       ON CONFLICT(provider, key_index) DO UPDATE SET until_ts = excluded.until_ts, reason = excluded.reason`
    ).bind(provider, keyIndex, untilTs, reason || "").run();
  } catch (e) { console.warn("dead_keys write:", e.message); }
}
function logLlmCall(env, provider, model, keyIndex, ok, latencyMs, errSnippet) {
  if (!env.DB) return;
  const now = Math.floor(Date.now() / 1000);
  env.DB.prepare("INSERT INTO llm_calls (ts, provider, model, key_index, ok, latency_ms, error_snippet) VALUES (?, ?, ?, ?, ?, ?, ?)")
    .bind(now, provider, model, keyIndex, ok ? 1 : 0, latencyMs, errSnippet || null).run()
    .catch(e => console.warn("llm_calls:", e.message));
}
async function getPromptTemplate(env, key) {
  const cache = promptCache[key === "prompt_template.stage2" ? "stage2" : "stage1"];
  const now = Date.now();
  if (now - cache.ts < 60000 && cache.template) return cache.template;
  const fallback = key === "prompt_template.stage2" ? DEFAULT_STAGE2 : DEFAULT_STAGE1;
  if (!env.DB) return fallback;
  try {
    const row = await env.DB.prepare("SELECT value FROM app_config WHERE key = ?").bind(key).first();
    if (row?.value) { cache.ts = now; cache.template = row.value; return row.value; }
  } catch (e) { console.warn("prompt read:", e.message); }
  return fallback;
}
async function setConfig(env, key, value) {
  if (!env.DB) throw new Error("DB yok");
  if (key === "prompt_template.stage1") promptCache.stage1.ts = 0;
  if (key === "prompt_template.stage2") promptCache.stage2.ts = 0;
  await env.DB.prepare(
    `INSERT INTO app_config (key, value, updated_at) VALUES (?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
  ).bind(key, value, Math.floor(Date.now() / 1000)).run();
}
async function getVerdict(env, movieId, signature) {
  if (!env.DB) return null;
  try {
    const row = await env.DB.prepare("SELECT verdict, reason, created_at FROM filter_verdicts WHERE movie_id = ? AND filter_signature = ?").bind(movieId, signature).first();
    if (!row) return null;
    if (Math.floor(Date.now() / 1000) - row.created_at > VERDICT_TTL) return null;
    return { verdict: row.verdict, reason: row.reason || "" };
  } catch { return null; }
}
async function putVerdict(env, movieId, signature, verdict, reason) {
  if (!env.DB) return;
  try {
    await env.DB.prepare(
      `INSERT INTO filter_verdicts (movie_id, filter_signature, verdict, reason, created_at) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(movie_id, filter_signature) DO UPDATE SET verdict = excluded.verdict, reason = excluded.reason, created_at = excluded.created_at`
    ).bind(movieId, signature, verdict, reason || "", Math.floor(Date.now() / 1000)).run();
  } catch (e) { console.warn("verdict write:", e.message); }
}

// ---------- Signals + fetch ----------
function combineSignals(...sources) {
  const signals = [];
  for (const s of sources) {
    if (!s) continue;
    if (typeof s === "number") signals.push(AbortSignal.timeout(s));
    else if (typeof s.aborted === "boolean" && typeof s.addEventListener === "function") signals.push(s);
  }
  if (signals.length === 0) return undefined;
  if (signals.length === 1) return signals[0];
  if (typeof AbortSignal.any === "function") return AbortSignal.any(signals);
  const ac = new AbortController();
  for (const s of signals) { if (s.aborted) { ac.abort(); break; } s.addEventListener("abort", () => ac.abort(), { once: true }); }
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
    const err = new Error(`${label}: HTTP 429 rate limit (retry-after=${retryAfter || "yok"})`);
    err.retryAfterMs = retryAfter > 0 ? retryAfter * 1000 : 60000;
    throw err;
  }
  if (!res.ok) throw new Error(`${label}: HTTP ${res.status} ${body.slice(0, 300)}`);
  if (!data) throw new Error(`${label}: JSON yanıtı alınamadı`);
  return data;
}

// ---------- External APIs ----------
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
  if (title) { try { return await omdb(env, { t: title, y: year }, outerSignal); } catch (e) { lastErr = e; } }
  if (movie.imdb_id) { try { return await omdb(env, { i: movie.imdb_id }, outerSignal); } catch (e) { lastErr = e; } }
  throw lastErr || new Error("OMDb: arama yapılamadı");
}
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
    results.set(id, { originalWork: rec.originalWork, filmingLocations: [...rec.locations], filmingCountries: [...rec.countries] });
  }
  return results;
}
async function wikidataBatch(env, movies, outerSignal) {
  try { return await wikidataBatchOnce(env, movies, 30000, outerSignal); }
  catch (e) { console.warn("wikidata batch:", e.message); return new Map(); }
}
function isLikelySceneImage(img) {
  const text = `${img.title || ""} ${img.description || ""} ${img.categories || ""}`.toLowerCase();
  if (/(poster|portrait|headshot|actor|actress|cast|logo|cover|selfie|signature)/.test(text)) return false;
  return /(still|scene|screenshot|frame|film)/.test(text);
}
async function commonsScenes(env, movie, outerSignal) {
  const title = movie.original_title || movie.title || "";
  if (!title) return [];
  const url = new URL("https://commons.wikimedia.org/w/api.php");
  url.searchParams.set("action", "query"); url.searchParams.set("format", "json");
  url.searchParams.set("generator", "search");
  url.searchParams.set("gsrsearch", `filetype:bitmap "${title}" film still OR scene`);
  url.searchParams.set("gsrnamespace", "6"); url.searchParams.set("gsrlimit", "20");
  url.searchParams.set("prop", "imageinfo"); url.searchParams.set("iiprop", "url|extmetadata"); url.searchParams.set("iiurlwidth", "640");
  const data = await fetchJSON(url.toString(), { headers: { "User-Agent": "FilmKesifMotoru/1.0" } }, "Wikimedia Commons", 18000, outerSignal);
  const pages = Object.values(data.query?.pages || {});
  return pages.map(p => {
    const i = p.imageinfo?.[0] || {}, meta = i.extmetadata || {};
    return { source: "commons", title: p.title || "", url: i.thumburl || i.url || "", pageUrl: i.descriptionurl || "", description: meta.ImageDescription?.value || "", categories: meta.Categories?.value || "", license: meta.LicenseShortName?.value || "", vote_average: 0 };
  }).filter(x => x.url && isLikelySceneImage(x));
}
async function tmdbBackdrops(env, movie, outerSignal) {
  if (!movie.id) return [];
  const data = await tmdb(env, `/movie/${movie.id}/images`, { include_image_language: "en,tr,null" }, outerSignal);
  const backdrops = Array.isArray(data.backdrops) ? data.backdrops : [];
  return backdrops.map(b => ({
    source: "tmdb", title: movie.original_title || movie.title || "",
    url: `https://image.tmdb.org/t/p/w780${b.file_path}`,
    pageUrl: `https://www.themoviedb.org/movie/${movie.id}`,
    license: "TMDB", description: "", vote_average: b.vote_average || 0
  })).filter(x => x.url);
}
async function tavily(env, query, outerSignal) {
  if (!env.TAVILY_API_KEY) return { results: [], warning: "TAVILY_API_KEY ayarlanmamış." };
  const data = await fetchJSON("https://api.tavily.com/search", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ api_key: env.TAVILY_API_KEY, query, search_depth: "basic", max_results: 5, include_answer: false, include_raw_content: false })
  }, "Tavily", 20000, outerSignal);
  return { results: (data.results || []).map(x => ({ title: x.title || "", url: x.url || "", content: (x.content || "").slice(0, 1800), score: x.score || 0 })) };
}

// ---------- LLM helpers ----------
function estimateTokens(text) { return Math.ceil(String(text || "").length / 4); }
function normalizeModelName(m) { return String(m || "").trim().toLowerCase().replace(/^models\//, ""); }
function buildGroqChain(env) {
  const seen = new Set(), chain = [];
  const push = (m) => { const n = normalizeModelName(m); if (!n || seen.has(n)) return; seen.add(n); chain.push(n); };
  push(env.GROQ_MODEL); for (const m of GROQ_MODEL_CHAIN) push(m); return chain;
}
function buildGeminiChain(env) {
  const seen = new Set(), chain = [];
  const push = (m) => { const n = normalizeModelName(m); if (!n || seen.has(n)) return; seen.add(n); chain.push(n); };
  push(env.GEMINI_MODEL); for (const m of GEMINI_MODEL_CHAIN) push(m); return chain;
}
function rotateKeys(keys, counter) {
  if (keys.length <= 1) return keys;
  const i = counter % keys.length;
  return [...keys.slice(i), ...keys.slice(0, i)];
}
function orderGeminiModels(chain, promptLen) {
  const short = promptLen < 3000;
  const lite = ["gemini-3.1-flash-lite", "gemini-3.5-flash-lite"];
  const flash = ["gemini-3.8-flash", "gemini-3.7-flash", "gemini-3.6-flash"];
  const first = short ? lite : flash, second = short ? flash : lite;
  const seen = new Set(), result = [];
  for (const m of [...first, ...second]) if (chain.includes(m) && !seen.has(m)) { seen.add(m); result.push(m); }
  for (const m of chain) if (!seen.has(m)) { seen.add(m); result.push(m); }
  return result;
}
function orderGroqModels(chain, promptLen) {
  const short = promptLen < 2500;
  const first = short ? ["openai/gpt-oss-20b"] : ["openai/gpt-oss-120b"];
  const second = short ? ["openai/gpt-oss-120b"] : ["openai/gpt-oss-20b"];
  const seen = new Set(), result = [];
  for (const m of [...first, ...second]) if (chain.includes(m) && !seen.has(m)) { seen.add(m); result.push(m); }
  for (const m of chain) if (!seen.has(m)) { seen.add(m); result.push(m); }
  return result;
}
function quotaCooldown(msg) {
  if (/per day|daily/i.test(msg)) return 3600;
  if (/per minute|rpm/i.test(msg)) return 60;
  return 300;
}

function extractGeminiText(data) {
  if (typeof data?.output_text === "string") return data.output_text;
  if (typeof data?.text === "string") return data.text;
  const cand = data?.candidates?.[0];
  if (cand) {
    const parts = cand?.content?.parts || [];
    const texts = parts.map(p => typeof p?.text === "string" ? p.text : "").filter(Boolean);
    if (texts.length) return texts.join("\n");
  }
  const outputs = data?.outputs || data?.output || [];
  const list = Array.isArray(outputs) ? outputs : [outputs];
  const texts = []; const push = (v) => { if (typeof v === "string" && v) texts.push(v); };
  const walk = (obj, depth = 0) => {
    if (!obj || depth > 6) return;
    if (typeof obj === "string") { push(obj); return; }
    if (Array.isArray(obj)) { for (const x of obj) walk(x, depth + 1); return; }
    if (typeof obj === "object") for (const k of ["text", "content", "output", "parts", "result", "response", "value", "message"]) if (obj[k] !== undefined) walk(obj[k], depth + 1);
  };
  for (const o of list) walk(o);
  const steps = data?.steps;
  if (Array.isArray(steps)) for (const s of steps) walk(s);
  return texts.length ? texts.join("\n") : "";
}
async function callGeminiInteractions(env, key, model, prompt, outerSignal) {
  const data = await fetchJSON(GOOGLE_INTERACTIONS, {
    method: "POST", headers: { "Content-Type": "application/json", "x-goog-api-key": key },
    body: JSON.stringify({ model, input: prompt })
  }, `Gemini Interactions ${model}`, 10000, outerSignal);
  const text = extractGeminiText(data);
  if (!text) throw new Error(`Gemini Interactions ${model} yanıtında metin yok.`);
  return text;
}
async function callGeminiGenerate(env, key, model, prompt, outerSignal) {
  const url = `${GOOGLE_GENERATE}/${encodeURIComponent(model)}:generateContent`;
  const data = await fetchJSON(url, {
    method: "POST", headers: { "Content-Type": "application/json", "x-goog-api-key": key },
    body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
  }, `Gemini generateContent ${model}`, 8000, outerSignal);
  const text = extractGeminiText(data);
  if (!text) throw new Error(`Gemini generateContent ${model} yanıtında metin yok.`);
  return text;
}
async function callGeminiModel(env, key, model, prompt, outerSignal) {
  const ac = new AbortController();
  const errors = [];
  const attempt = async (fn, label) => {
    try { return await fn(combineSignals(outerSignal, ac.signal)); }
    catch (e) { const msg = String(e.message || e); errors.push(`${label}: ${msg}`); if (/HTTP 40[13]|invalid.?key|forbidden|unauthor/i.test(msg)) ac.abort(); throw e; }
  };
  try {
    return await Promise.any([
      attempt(s => callGeminiInteractions(env, key, model, prompt, s), "interactions"),
      attempt(s => callGeminiGenerate(env, key, model, prompt, s), "generateContent")
    ]);
  } catch (e) { if (e instanceof AggregateError) throw new Error(errors.join(" | ")); throw e; }
  finally { ac.abort(); }
}
async function callGroq(env, key, model, prompt, maxOutputTokens, useSearch, outerSignal) {
  const promptTokens = estimateTokens(prompt);
  const safeOutput = Math.max(256, Math.min(maxOutputTokens, GROQ_TPM_BUDGET - promptTokens));
  const body = { model, messages: [{ role: "user", content: prompt }], temperature: 0.2, max_completion_tokens: safeOutput };
  if (useSearch) { body.tools = [{ type: "browser_search" }]; body.tool_choice = "required"; }
  else { body.response_format = { type: "json_object" }; }
  const data = await fetchGroqJSON(`${GROQ_BASE}/chat/completions`, {
    method: "POST", headers: { "Content-Type": "application/json", "Authorization": `Bearer ${key}` },
    body: JSON.stringify(body)
  }, `Groq ${model}`, 30000, outerSignal);
  const text = data?.choices?.[0]?.message?.content || "";
  if (!text) throw new Error(`Groq ${model} yanıtında metin yok.`);
  return text;
}
async function callGroqModel(env, key, model, prompt, maxOutputTokens, useSearch, outerSignal) {
  if (!useSearch) return callGroq(env, key, model, prompt, maxOutputTokens, false, outerSignal);
  const ac = new AbortController(); const errors = [];
  const attempt = async (search) => {
    try { return await callGroq(env, key, model, prompt, maxOutputTokens, search, combineSignals(outerSignal, ac.signal)); }
    catch (e) { errors.push(`${search ? "search" : "no-search"}: ${String(e.message || e)}`); throw e; }
  };
  try { return await Promise.any([attempt(true), attempt(false)]); }
  catch (e) { if (e instanceof AggregateError) throw new Error(errors.join(" | ")); throw e; }
  finally { ac.abort(); }
}
async function callLLMWithFallback(env, prompt, maxOutputTokens, useSearch, outerSignal) {
  const deadline = Date.now() + LLM_DEADLINE_MS;
  const errors = [];
  const promptLen = estimateTokens(prompt);
  const dead = await loadDeadKeys(env);
  const nowSec = () => Math.floor(Date.now() / 1000);

  const geminiKeys = [env.GEMINI_API_KEY_1, env.GEMINI_API_KEY_2, env.GEMINI_API_KEY_3].map((k, i) => ({ key: k, index: i + 1 })).filter(x => x.key);
  const rotatedG = rotateKeys(geminiKeys, geminiRR++);
  const geminiModels = orderGeminiModels(buildGeminiChain(env), promptLen);
  let geminiTried = false;

  for (const model of geminiModels) {
    if (Date.now() > deadline) break;
    for (const { key, index } of rotatedG) {
      if (dead.gemini.has(index)) continue;
      if (Date.now() > deadline) break;
      if (outerSignal?.aborted) throw new Error("İstemci isteği iptal etti.");
      geminiTried = true;
      const start = Date.now();
      try {
        const result = await callGeminiModel(env, key, model, prompt, outerSignal);
        logLlmCall(env, "gemini", model, index, true, Date.now() - start, null);
        return result;
      } catch (e) {
        const msg = String(e.message || e);
        logLlmCall(env, "gemini", model, index, false, Date.now() - start, msg.slice(0, 200));
        errors.push(`gemini ${model} key=${index}: ${msg}`);
        console.warn(`gemini: model=${model} key=${index} başarısız — ${msg}`);
        if (/429|quota|rate.?limit|exceeded/i.test(msg)) await markDeadKey(env, "gemini", index, nowSec() + quotaCooldown(msg), msg.slice(0, 200));
        else if (/aborted due to timeout|timed? ?out|network|fetch failed|socket|forbidden|unauthor|invalid.?key/i.test(msg)) await markDeadKey(env, "gemini", index, nowSec() + 300, msg.slice(0, 200));
      }
    }
  }

  const groqKeys = [env.GROQ_API_KEY_1, env.GROQ_API_KEY_2, env.GROQ_API_KEY_3].map((k, i) => ({ key: k, index: i + 1 })).filter(x => x.key);
  const rotatedQ = rotateKeys(groqKeys, groqRR++);
  const groqModels = orderGroqModels(buildGroqChain(env), promptLen);
  let groqTried = false;

  if (groqKeys.length) {
    console.warn("Gemini başarısız, Groq yedek sağlayıcısına geçiliyor...");
    for (const model of groqModels) {
      if (Date.now() > deadline) break;
      for (const { key, index } of rotatedQ) {
        if (dead.groq.has(index)) continue;
        if (Date.now() > deadline) break;
        if (outerSignal?.aborted) throw new Error("İstemci isteği iptal etti.");
        groqTried = true;
        const start = Date.now();
        try {
          const result = await callGroqModel(env, key, model, prompt, maxOutputTokens, useSearch, outerSignal);
          logLlmCall(env, "groq", model, index, true, Date.now() - start, null);
          return result;
        } catch (e) {
          const msg = String(e.message || e);
          logLlmCall(env, "groq", model, index, false, Date.now() - start, msg.slice(0, 200));
          errors.push(`groq ${model} key=${index}: ${msg}`);
          console.warn(`groq: model=${model} key=${index} başarısız — ${msg}`);
          if (e.retryAfterMs) await markDeadKey(env, "groq", index, nowSec() + Math.ceil(e.retryAfterMs / 1000), msg.slice(0, 200));
          else if (/429|quota|rate.?limit|exceeded|aborted due to timeout|timed? ?out|network|fetch failed|socket|forbidden|unauthor|invalid.?key/i.test(msg)) await markDeadKey(env, "groq", index, nowSec() + 300, msg.slice(0, 200));
        }
      }
    }
  }

  const providers = [];
  if (geminiTried) providers.push("Gemini");
  if (groqTried) providers.push("Groq");
  throw new Error(`${providers.join(" + ") || "LLM"} tüm modellerde başarısız: ${errors.join(" | ")}`);
}
// ---------- JSON ayıklama ----------
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

// ---------- Stage 1: filtre cümlesi + context ----------
function buildFilterSentence(filters) {
  const f = filters || {};
  const parts = [];

  if (f.genres?.include?.length) {
    const names = f.genres.include.map(x => x.label || x).filter(Boolean);
    if (names.length) parts.push(`türü ${names.join(" veya ")} olan`);
  }
  if (f.genres?.exclude?.length) {
    const names = f.genres.exclude.map(x => x.label || x).filter(Boolean);
    if (names.length) parts.push(`${names.join(", ")} türünde olmamalı`);
  }

  const setInclude = (field, prefix) => {
    const v = f[field];
    if (!v?.include?.length) return;
    const names = v.include.map(x => x.label || x).filter(Boolean);
    if (names.length) parts.push(`${prefix}: ${names.join(" veya ")}`);
  };
  const setExclude = (field, suffix) => {
    const v = f[field];
    if (!v?.exclude?.length) return;
    const names = v.exclude.map(x => x.label || x).filter(Boolean);
    if (names.length) parts.push(`${suffix} ${names.join(", ")} olmamalı`);
  };

  setInclude("season", "hikâyesi şu mevsimde geçen"); setExclude("season", "hikâyesi şu mevsimlerde geçmemeli:");
  setInclude("reality", "gerçeklik"); setExclude("reality", "gerçeklik açısından:");
  setInclude("production_process", "yapım süreci"); setExclude("production_process", "yapım süreci şunlardan olmamalı:");
  setInclude("narrative_style", "anlatım tarzı"); setExclude("narrative_style", "anlatım tarzı şunlardan olmamalı:");
  setInclude("sound", "ses özelliği"); setExclude("sound", "ses özelliği şunlardan olmamalı:");
  setInclude("story_geography", "coğrafya"); setExclude("story_geography", "coğrafya şunlardan olmamalı:");
  setInclude("story_period", "dönem"); setExclude("story_period", "dönem şunlardan olmamalı:");
  setInclude("story_locations", "hikâye yeri"); setExclude("story_locations", "hikâye yeri şunlardan olmamalı:");
  setInclude("character_traits", "karakter özellikleri"); setExclude("character_traits", "karakter özellikleri şunlardan olmamalı:");
  setInclude("story_dimensions", "hikâye boyutları"); setExclude("story_dimensions", "hikâye boyutları şunlardan olmamalı:");
  setInclude("aspect_ratio", "en-boy oranı"); setExclude("aspect_ratio", "en-boy oranı şunlardan olmamalı:");

  if (f.nightRatioMin != null) parts.push(`gece oranı en az %${f.nightRatioMin}`);
  if (f.indoorRatioMin != null) parts.push(`iç mekân oranı en az %${f.indoorRatioMin}`);
  if (f.locationCountMin != null) parts.push(`mekân sayısı en az ${f.locationCountMin}`);
  if (f.dialogueDensityMin != null) parts.push(`diyalog yoğunluğu en az %${f.dialogueDensityMin}`);
  if (f.colorRatioMin != null) parts.push(`renkli oranı en az %${f.colorRatioMin}`);

  if (f.family_content) {
    for (const [key, val] of Object.entries(f.family_content)) {
      if (!val) continue;
      const label = TRAIT_TR[key] || key;
      const intensity = INTENSITY_TR[val.intensity];
      if (intensity) {
        const clause = `${label} içeriği ${intensity}`;
        parts.push(clause);
        if (val.approach && APPROACH_TR[val.approach]) parts.push(`${label} yaklaşımı ${APPROACH_TR[val.approach]}`);
      }
    }
  }

  if (f.characterDensity) {
    const c = f.characterDensity;
    const clauses = [];
    if (c.mainMin != null || c.mainMax != null) clauses.push(`ana karakter sayısı ${c.mainMin ?? "?"}-${c.mainMax ?? "?"}`);
    if (c.supportMin != null || c.supportMax != null) clauses.push(`yan karakter sayısı ${c.supportMin ?? "?"}-${c.supportMax ?? "?"}`);
    if (c.extraMin != null || c.extraMax != null) clauses.push(`figüran sayısı ${c.extraMin ?? "?"}-${c.extraMax ?? "?"}`);
    if (clauses.length) parts.push(clauses.join(", "));
  }

  if (!parts.length) return "";
  return parts.join(". ") + ".";
}

function buildFilterContext(filters, configAll) {
  const f = filters || {};
  const lines = [];
  const activeFields = new Set();
  for (const field of SEMANTIC_FIELDS) {
    if (f[field] && (f[field].include?.length || f[field].exclude?.length)) activeFields.add(field);
  }
  if (f.family_content && Object.keys(f.family_content).length) activeFields.add("family_content");
  if (f.characterDensity) activeFields.add("characterDensity");

  for (const field of activeFields) {
    const key = `filter_info.${field}`;
    const info = configAll[key];
    if (!info) continue;
    const usedSlugs = new Set();
    if (f[field]?.include) for (const x of f[field].include) if (x.id) usedSlugs.add(x.id);
    if (f[field]?.exclude) for (const x of f[field].exclude) if (x.id) usedSlugs.add(x.id);

    const yzIdx = info.indexOf("[YZ bağlamı]");
    let contextPart = yzIdx >= 0 ? info.slice(yzIdx + "[YZ bağlamı]".length).trim() : "";
    if (!contextPart) continue;

    if (usedSlugs.size > 0) {
      const lines_ = contextPart.split("\n").filter(l => {
        const m = l.trim().match(/^[-•]\s*([a-z_0-9]+):/i);
        return !m || usedSlugs.has(m[1].toLowerCase());
      });
      contextPart = lines_.join("\n").trim();
    }

    if (contextPart) lines.push(`${field}:\n${contextPart}`);
  }
  return lines.join("\n\n");
}

function semanticSignature(filters) {
  const f = filters || {};
  const active = {};
  for (const field of SEMANTIC_FIELDS) {
    if (f[field] && (f[field].include?.length || f[field].exclude?.length)) active[field] = f[field];
  }
  if (f.nightRatioMin != null) active.nightRatioMin = f.nightRatioMin;
  if (f.indoorRatioMin != null) active.indoorRatioMin = f.indoorRatioMin;
  if (f.locationCountMin != null) active.locationCountMin = f.locationCountMin;
  if (f.dialogueDensityMin != null) active.dialogueDensityMin = f.dialogueDensityMin;
  if (f.colorRatioMin != null) active.colorRatioMin = f.colorRatioMin;
  if (f.family_content && Object.keys(f.family_content).length) active.family_content = f.family_content;
  if (f.characterDensity) active.characterDensity = f.characterDensity;
  const sorted = Object.keys(active).sort().reduce((o, k) => { o[k] = active[k]; return o; }, {});
  return simpleHash(JSON.stringify(sorted));
}

function hasSemanticFilters(filters) {
  return semanticSignature(filters) !== simpleHash("{}");
}

async function classifyBatch(env, movies, filterSentence, filterContext, signal) {
  const payload = movies.map(m => ({
    id: m.id,
    title: m.original_title || m.title || "",
    year: yearOf(m),
    overview: (m.overview || "").slice(0, 300)
  }));
  const template = await getPromptTemplate(env, "prompt_template.stage1");
  const prompt = template
    .replace(/\{\{FILTER_SENTENCE\}\}/g, filterSentence)
    .replace(/\{\{FILTER_CONTEXT\}\}/g, filterContext || "(bağlam yok)")
    .replace(/\{\{MOVIES\}\}/g, JSON.stringify(payload));
  const raw = await callLLMWithFallback(env, prompt, 800, false, signal);
  const arr = extractJSONArray(raw) || [];
  const byId = new Map();
  for (const item of arr) {
    if (!item || item.id == null) continue;
    const match = String(item.match || "").toLowerCase();
    const verdict = ["yes", "no", "unknown"].includes(match) ? match : "unknown";
    byId.set(String(item.id), { verdict, reason: String(item.reason || "").slice(0, 200) });
  }
  return byId;
}

// ---------- Stage 2: detay alanları doldurma ----------
function buildStage2Rules(fields) {
  const rules = [];
  for (const f of fields) {
    if (FIELD_RULES[f]) rules.push(FIELD_RULES[f]);
    else if (["night_ratio","day_ratio","indoor_ratio","dialogue_density","color_ratio"].includes(f)) rules.push(`${f}: 0-100 sayı (yüzde) veya null`);
    else if (f === "location_count") rules.push(`location_count: integer (mekân sayısı) veya null`);
    else if (f === "family_content") rules.push(`family_content: {"main_characters": <int>, "supporting_characters": <int>, "extras": <int>, "<trait>": {"intensity": "none|few|side|main", "approach": "bad|neutral|legit"}}`);
    else if (f === "related_films") rules.push(`related_films: string[] (film adları)`);
    else if (f === "story_period") rules.push(`story_period: string[] (dönem etiketleri)`);
    else if (f === "story_locations") rules.push(`story_locations: string[] (yer adları)`);
    else if (f === "aspect_ratio") rules.push(`aspect_ratio: string (ör. "2.39:1")`);
    else rules.push(`${f}: uygun değer`);
  }
  return rules.join("\n");
}

async function fillDetails(env, movie, staleLLMFields, signal) {
  if (!staleLLMFields.length) return {};
  const template = await getPromptTemplate(env, "prompt_template.stage2");
  const moviePayload = [{ id: movie.id, title: movie.title, original_title: movie.original_title, year: yearOf(movie), overview: (movie.overview || "").slice(0, 500) }];
  const rules = buildStage2Rules(staleLLMFields);
  const prompt = template
    .replace(/\{\{MOVIES\}\}/g, JSON.stringify(moviePayload))
    .replace(/\{\{RULES\}\}/g, rules);
  const raw = await callLLMWithFallback(env, prompt, 1500, false, signal);
  const arr = extractJSONArray(raw) || (() => { try { const o = extractJSON(raw); return o.movies || []; } catch { return []; } })();
  const item = arr[0] || {};
  const updates = {};
  for (const f of staleLLMFields) if (item[f] !== undefined && item[f] !== null) updates[f] = item[f];
  return updates;
}

// ---------- Stage 0b: enrichClassic (TMDB + OMDb, LLM'siz) ----------
async function enrichClassic(env, movie, staleFields, outerSignal) {
  const need = new Set(staleFields);
  const updates = {};
  const covered = new Set();

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
      const credits = detail.credits;
      if (credits) {
        const crew = credits.crew || [];
        if (need.has("director")) { updates.director = crew.filter(c => c.job === "Director").map(c => ({ name: c.name, profile_path: c.profile_path || null })); covered.add("director"); }
        if (need.has("writers")) { updates.writers = crew.filter(c => c.department === "Writing" || c.job === "Writer").map(c => ({ name: c.name, profile_path: c.profile_path || null })); covered.add("writers"); }
        if (need.has("producers")) { updates.producers = crew.filter(c => c.job === "Producer").map(c => ({ name: c.name, profile_path: c.profile_path || null })); covered.add("producers"); }
        if (need.has("cast")) { updates.cast = (credits.cast || []).slice(0, 8).map(c => ({ name: c.name, profile_path: c.profile_path || null, character: c.character || "" })); covered.add("cast"); }
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
      if (need.has("actors")) { updates.actors = data.Actors && data.Actors !== "N/A" ? data.Actors.split(",").map(s => s.trim()).filter(Boolean) : []; covered.add("actors"); }
      if (need.has("rated")) { updates.rated = clean(data.Rated); covered.add("rated"); }
      if (need.has("awards")) { updates.awards = clean(data.Awards); covered.add("awards"); }
      if (need.has("metascore")) { updates.metascore = clean(data.Metascore); covered.add("metascore"); }
      if (need.has("boxOffice")) { updates.boxOffice = clean(data.BoxOffice); covered.add("boxOffice"); }
    } catch (e) { console.warn("omdb enrich:", e.message); }
  }

  return { updates, covered };
}

// ---------- Stage 0c: lokal kesin filtre ----------
function passesLocalFilters(profile, filters) {
  const imdb = Number(String(profile.imdbRating || "").replace(/[^\d.]/g, "")) || null;
  if (filters.imdbMin > 0 && imdb != null && imdb < filters.imdbMin) return false;
  if (filters.imdbMax < 10 && imdb != null && imdb > filters.imdbMax) return false;
  if (filters.imdbVotesMin > 0 && imdb != null) {
    const iv = Number(String(profile.imdbVotes || "").replace(/[^\d]/g, ""));
    if (iv && iv < filters.imdbVotesMin) return false;
  }
  return true;
}

function evalFilmingLocations(profile, f) {
  if (!f) return { match: true, unknown: false, reason: null };
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
      if (empty) return { match: true, unknown: true, reason: "Çekim yeri: bilinmiyor" };
      return { match: false, unknown: false, reason: `Çekim yeri eksik: ${missing.map(x => x.label || x).join(", ")}` };
    }
  }
  if (f.exclude?.length) {
    const hit = f.exclude.filter(x => matches(x));
    if (hit.length) return { match: false, unknown: false, reason: `Çekim yeri hariç tutuldu: ${hit.map(x => x.label || x).join(", ")}` };
  }
  return { match: true, unknown: false, reason: null };
                                                                 }
// ---------- SSE: handleResearchStream (Stage 0 + Stage 1) ----------
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
      const deterministicFields = stale.filter(f => FIELD_DEFS[f]?.source !== "llm");
      prepared.push({ movie, movieId, profile, staleDeterministic: deterministicFields, webAvailable: null });
    }

    // Stage 0b: TMDB + OMDb (deterministic, LLM'siz)
    for (let i = 0; i < prepared.length; i++) {
      if (signal?.aborted) return;
      const p = prepared[i];
      send({ type: "step", index: i, total, title: p.movie.original_title || p.movie.title, stage: p.staleDeterministic.length ? "zenginleştiriliyor" : "önbellekten", fields: p.staleDeterministic.slice(0, 6) });
      const classic = await enrichClassic(env, p.movie, p.staleDeterministic, signal);
      Object.assign(p.profile, classic.updates);
      const covered = [...classic.covered].filter(f => p.profile[f] !== undefined && p.profile[f] !== null);
      await putFieldRows(env, p.movieId, covered, Object.fromEntries(covered.map(f => [f, FIELD_DEFS[f]?.source || "unknown"])));
    }

    // Wikidata (yalnızca filming_locations veya original_work filtresi varsa)
    const needWiki = !!(filters.original_work?.include?.length || filters.original_work?.exclude?.length
      || filters.filming_locations?.include?.length || filters.filming_locations?.exclude?.length);
    if (needWiki) {
      const wikiNeeded = prepared.filter(p => p.staleDeterministic.includes("original_work") || p.staleDeterministic.includes("filming_locations"));
      if (wikiNeeded.length) {
        const wikiResults = await wikidataBatch(env, wikiNeeded.map(p => p.movie), signal);
        for (const p of wikiNeeded) {
          const rec = wikiResults.get(String(p.movie.id));
          if (!rec) continue;
          const covered = [];
          if (p.staleDeterministic.includes("original_work") && rec.originalWork) { p.profile.original_work = rec.originalWork; covered.push("original_work"); }
          if (p.staleDeterministic.includes("filming_locations") && rec.filmingLocations.length) { p.profile.filming_locations = rec.filmingLocations; covered.push("filming_locations"); }
          if (rec.filmingCountries && rec.filmingCountries.length) p.profile.filming_countries = rec.filmingCountries;
          await putFieldRows(env, p.movieId, covered, Object.fromEntries(covered.map(f => [f, "wikidata"])));
        }
      }
    }

    // Stage 0c: lokal kesin filtre (imdb rating/votes, filming_locations)
    const afterLocal = [];
    for (const p of prepared) {
      if (!passesLocalFilters(p.profile, filters)) continue;
      const filmLoc = evalFilmingLocations(p.profile, filters.filming_locations);
      if (!filmLoc.match) continue;
      p.localVerdict = filmLoc;
      afterLocal.push(p);
    }

    // Stage 1: semantik filtre verdict
    const useSemantic = settings.useAI && hasSemanticFilters(filters);
    let semanticVerdicts = new Map();
    let stage1Error = null;
    if (useSemantic && afterLocal.length) {
      send({ type: "step", index: 0, total: afterLocal.length, title: "Semantik filtre uygulanıyor", stage: "sınıflandırılıyor", fields: [] });
      const signature = semanticSignature(filters);
      const cacheMisses = [];
      for (const p of afterLocal) {
        const cached = await getVerdict(env, p.movieId, signature);
        if (cached) semanticVerdicts.set(p.movieId, cached);
        else cacheMisses.push(p);
      }
      if (cacheMisses.length) {
        try {
          const configAll = await getAllConfig(env);
          const sentence = buildFilterSentence(filters);
          const context = buildFilterContext(filters, configAll);
          const batchSize = Math.min(GROQ_MAX_MOVIES_PER_CALL, cacheMisses.length);
          for (let start = 0; start < cacheMisses.length; start += batchSize) {
            if (signal?.aborted) break;
            const chunk = cacheMisses.slice(start, start + batchSize);
            try {
              const verdicts = await classifyBatch(env, chunk.map(p => p.movie), sentence, context, signal);
              for (const p of chunk) {
                const v = verdicts.get(String(p.movie.id)) || { verdict: "unknown", reason: "LLM yanıt vermedi" };
                semanticVerdicts.set(p.movieId, v);
                await putVerdict(env, p.movieId, signature, v.verdict, v.reason);
              }
            } catch (e) {
              console.warn("stage1 chunk:", e.message);
              stage1Error = e.message;
              for (const p of chunk) {
                if (!semanticVerdicts.has(p.movieId)) semanticVerdicts.set(p.movieId, { verdict: "unknown", reason: "LLM başarısız" });
              }
            }
          }
        } catch (e) {
          console.warn("stage1 fail:", e.message);
          stage1Error = e.message;
        }
      }
    }

    // Sonuçları hazırla
    const results = [];
    for (const p of afterLocal) {
      let filter_match = true;
      let unknown = false;
      let reasons = [];

      if (useSemantic) {
        const v = semanticVerdicts.get(p.movieId);
        if (!v) { unknown = true; reasons.push("Semantik sınıflandırma yok"); }
        else if (v.verdict === "no") { filter_match = false; reasons.push(v.reason || "Semantik filtre uyuşmadı"); }
        else if (v.verdict === "unknown") { unknown = true; reasons.push(v.reason || "Bilinmiyor"); }
        else reasons.push(v.reason || "Eşleşti");
      }
      if (p.localVerdict?.unknown) unknown = true;

      if (p.staleDeterministic.length) {
        await putProfileRow(env, p.movieId, p.movie.title, yearOf(p.movie), p.profile, forceRefresh);
      }

      const result = {
        id: p.movie.id, ...p.movie, ...p.profile,
        filter_match, filter_reasons: reasons,
        unknown, conflicts: false,
        ai_available: useSemantic && semanticVerdicts.size > 0,
        ai_requested: useSemantic,
        stage1_error: stage1Error,
        web_available: p.webAvailable,
        _fromCache: p.staleDeterministic.length === 0
      };
      results.push(result);
      send({ type: "movie", index: results.length - 1, total, movie: result });
    }

    send({ type: "done", movies: results });
  } catch (err) {
    console.error("handleResearchStream fatal:", err);
    try { controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify({ type: "error", message: String(err.message || err) })}\n\n`)); } catch {}
  } finally { try { controller.close(); } catch {} }
}

// ---------- Stage 2: /movie/details ----------
async function handleMovieDetails(env, body, signal) {
  const movie = body?.movie;
  if (!movie || !movie.id) throw Object.assign(new Error("movie gerekli"), { status: 400 });
  const forceAll = body.forceAll === true;
  const movieId = movieKey(movie);
  const existing = await getProfileRow(env, movieId);
  const fieldRows = await getFieldRows(env, movieId);
  const profile = existing?.data || {};
  if (!profile.vote_average && movie.vote_average != null) profile.vote_average = movie.vote_average;
  if (!profile.vote_count && movie.vote_count != null) profile.vote_count = movie.vote_count;
  if (!profile.overview && movie.overview) profile.overview = movie.overview;
  if (!profile.poster_path && movie.poster_path) profile.poster_path = movie.poster_path;
  if (!profile.release_date && movie.release_date) profile.release_date = movie.release_date;

  let stale = findStaleFields(profile, fieldRows, forceAll);
  const staleLLM = stale.filter(f => FIELD_DEFS[f]?.source === "llm");

  if (staleLLM.length) {
    try {
      const updates = await fillDetails(env, movie, staleLLM, signal);
      Object.assign(profile, updates);
      const covered = Object.keys(updates).filter(f => profile[f] !== undefined && profile[f] !== null);
      await putFieldRows(env, movieId, covered, Object.fromEntries(covered.map(f => [f, "llm"])));
    } catch (e) {
      console.warn("stage2 fail:", e.message);
      throw Object.assign(new Error("Detay doldurma başarısız: " + e.message), { status: 503 });
    }
  }

  await putProfileRow(env, movieId, movie.title, yearOf(movie), profile, forceAll);
  return { movie: { ...movie, ...profile } };
}

// ---------- Images ----------
async function handleImages(env, url, signal) {
  const id = url.searchParams.get("id");
  const title = url.searchParams.get("title") || "";
  const originalTitle = url.searchParams.get("original_title") || title;
  const movie = { id, title, original_title: originalTitle };
  const [tmdbList, commonsList] = await Promise.all([
    tmdbBackdrops(env, movie, signal).catch(e => { console.warn("tmdb backdrops:", e.message); return []; }),
    commonsScenes(env, movie, signal).catch(e => { console.warn("commons scenes:", e.message); return []; })
  ]);
  const tmdbSorted = [...tmdbList].sort((a, b) => (b.vote_average || 0) - (a.vote_average || 0));
  const seen = new Set(); const merged = [];
  for (const img of [...tmdbSorted, ...commonsList]) {
    const key = String(img.url || "").split("/").pop().split("?")[0].toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key); merged.push(img);
    if (merged.length >= 8) break;
  }
  return { images: merged };
}

// ---------- Admin helpers ----------
async function getAllConfig(env) {
  if (!env.DB) return {};
  try {
    const { results } = await env.DB.prepare("SELECT key, value FROM app_config ORDER BY key").all();
    const obj = {};
    for (const r of results || []) obj[r.key] = r.value;
    return obj;
  } catch (e) { console.warn("config read all:", e.message); return {}; }
}
async function getLlmStats(env) {
  if (!env.DB) return [];
  try {
    const since = Math.floor(Date.now() / 1000) - 86400;
    const { results } = await env.DB.prepare(
      `SELECT provider, model, SUM(CASE WHEN ok=1 THEN 1 ELSE 0 END) AS ok, SUM(CASE WHEN ok=0 THEN 1 ELSE 0 END) AS fail, MAX(ts) AS last_ts
       FROM llm_calls WHERE ts > ? GROUP BY provider, model ORDER BY provider, model`
    ).bind(since).all();
    return results || [];
  } catch (e) { console.warn("stats:", e.message); return []; }
}
async function getActiveDeadKeys(env) {
  if (!env.DB) return [];
  try {
    const now = Math.floor(Date.now() / 1000);
    const { results } = await env.DB.prepare("SELECT provider, key_index, until_ts, reason FROM dead_keys WHERE until_ts > ? ORDER BY provider, key_index").bind(now).all();
    return results || [];
  } catch { return []; }
}
async function getFilterInfoAll(env) {
  if (!env.DB) return {};
  try {
    const { results } = await env.DB.prepare("SELECT key, value FROM app_config WHERE key LIKE 'filter_info.%'").all();
    const obj = {};
    for (const r of results || []) obj[r.key] = r.value;
    return obj;
  } catch { return {}; }
}

// ---------- Routes ----------
async function tmdbRoute(env, url, signal) {
  const path = url.pathname.replace(/^\/tmdb/, "");
  if (path === "/genre/movie/list") return tmdb(env, path, { language: url.searchParams.get("language") || "tr-TR" }, signal);
  if (path === "/configuration/languages") return tmdb(env, path, {}, signal);
  if (path === "/configuration/countries") return tmdb(env, path, { language: url.searchParams.get("language") || "tr-TR" }, signal);
  if (path === "/discover/movie") {
    const allowed = ["language","sort_by","vote_average.gte","vote_average.lte","vote_count.gte","page","primary_release_date.gte","primary_release_date.lte","with_genres","without_genres","with_original_language","with_origin_country","with_runtime.gte","with_runtime.lte","with_text_query"];
    const params = {};
    for (const k of allowed) if (url.searchParams.has(k)) params[k] = url.searchParams.get(k);
    return tmdb(env, path, params, signal);
  }
  if (path === "/search/movie") return tmdb(env, path, { query: url.searchParams.get("query") || "", language: url.searchParams.get("language") || "tr-TR", page: url.searchParams.get("page") || 1, include_adult: "false" }, signal);
  throw Object.assign(new Error("Bilinmeyen TMDB uç noktası."), { status: 404 });
}

async function handleRequest(request, env, ctx) {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  const url = new URL(request.url);
  try {
    if (url.pathname === "/health") {
      return response({
        ok: true,
        geminiModel: env.GEMINI_MODEL || GEMINI_MODEL_DEFAULT, geminiModels: buildGeminiChain(env),
        groqModel: env.GROQ_MODEL || GROQ_MODEL_DEFAULT, groqModels: buildGroqChain(env),
        tmdb: !!env.TMDB_API_KEY, omdb: !!env.OMDB_API_KEY, tavily: !!env.TAVILY_API_KEY,
        groqKeys: [!!env.GROQ_API_KEY_1, !!env.GROQ_API_KEY_2, !!env.GROQ_API_KEY_3],
        geminiKeys: [!!env.GEMINI_API_KEY_1, !!env.GEMINI_API_KEY_2, !!env.GEMINI_API_KEY_3],
        adminToken: !!env.ADMIN_TOKEN, d1: !!env.DB
      });
    }
    if (url.pathname === "/admin/config" && request.method === "GET") return response({ config: await getAllConfig(env) });
    if (url.pathname === "/admin/config" && request.method === "PUT") {
      if (!isAdmin(request, env)) return jsonError("Yetkisiz.", 401);
      let body; try { body = await request.json(); } catch { return jsonError("Geçersiz JSON.", 400); }
      if (!body.key || typeof body.value !== "string") return jsonError("key ve value gerekli.", 400);
      await setConfig(env, body.key, body.value);
      return response({ ok: true, key: body.key });
    }
    if (url.pathname === "/admin/filter_info" && request.method === "GET") return response({ config: await getFilterInfoAll(env) });
    if (url.pathname === "/admin/stats" && request.method === "GET") return response({ stats: await getLlmStats(env), deadKeys: await getActiveDeadKeys(env) });
    if (url.pathname === "/admin/dead_keys" && request.method === "DELETE") {
      if (!isAdmin(request, env)) return jsonError("Yetkisiz.", 401);
      if (env.DB) await env.DB.prepare("DELETE FROM dead_keys").run();
      deadKeysCache.ts = 0;
      return response({ ok: true });
    }
    if (url.pathname.startsWith("/tmdb/")) return response(await tmdbRoute(env, url, request.signal));
    if (url.pathname === "/omdb") {
      const params = {};
      for (const k of ["i","t","y","type"]) if (url.searchParams.has(k)) params[k] = url.searchParams.get(k);
      return response(await omdb(env, params, request.signal));
    }
    if (url.pathname === "/images") return response(await handleImages(env, url, request.signal));
    if (url.pathname === "/movie/details" && request.method === "POST") {
      let body; try { body = await request.json(); } catch { return jsonError("Geçersiz JSON.", 400); }
      return response(await handleMovieDetails(env, body, request.signal));
    }
    if (url.pathname === "/research" || url.pathname === "/llm-interactions") {
      if (request.method !== "POST") return jsonError("Bu uç nokta POST bekliyor.", 405);
      let body; try { body = await request.json(); } catch { return jsonError("Geçersiz JSON gövdesi.", 400); }
      const { readable, writable } = new TransformStream();
      const writer = writable.getWriter();
      const controller = { enqueue: (chunk) => writer.write(chunk), close: () => writer.close() };
      const task = handleResearchStream(env, body, controller, request.signal).catch(err => {
        try { controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify({ type: "error", message: String(err.message || err) })}\n\n`)); } catch {}
        try { controller.close(); } catch {}
      });
      if (ctx?.waitUntil) ctx.waitUntil(task);
      return new Response(readable, {
        headers: { ...CORS, "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-cache", "Connection": "keep-alive" }
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
