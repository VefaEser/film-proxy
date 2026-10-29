import { FIELD_DEFS, LLM_FIELDS, FIELD_RULES, SEMANTIC_FIELDS } from "./fields.config.js";

const GEMINI_MODEL_CHAIN = ["gemini-3.8-flash", "gemini-3.7-flash", "gemini-3.6-flash", "gemini-3.5-flash-lite", "gemini-3.1-flash-lite"];
const GEMINI_MODEL_DEFAULT = "gemini-3.8-flash";
const GROQ_MODEL_CHAIN = ["openai/gpt-oss-120b", "openai/gpt-oss-20b"];
const GROQ_MODEL_DEFAULT = "openai/gpt-oss-120b";
const GROQ_BASE = "https://api.groq.com/openai/v1";
const GOOGLE_INTERACTIONS = "https://generativelanguage.googleapis.com/v1beta/interactions";
const GOOGLE_GENERATE = "https://generativelanguage.googleapis.com/v1beta/models";
const TMDB_BASE = "https://api.themoviedb.org/3";
const METATAKE_BASE = "https://metatake.net/api/v1";
const USER_AGENT = "FilmKesifMotoru/1.0 (https://github.com/VefaEser/film-proxy; contact: vefaeser@ornitonerenk.com)";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type,Authorization"
};
const GROQ_TPM_BUDGET = 7000;
const GROQ_MAX_OUTPUT_TOKENS = 1000;
const GROQ_MAX_MOVIES_PER_CALL = 5;
const GROQ_MAX_PROMPT_CHARS = 7000;
const LLM_DEADLINE_MS = 60000;
const VERDICT_TTL = 86400;
const DEFAULT_MIN_IMDB_VOTES = 100;

const DEFAULT_STAGE1 = [
  "Sen bir film sınıflandırma uzmanısın. Yalnızca verilen bilgilerden hareket et; emin değilsen unknown de, uydurma.",
  "",
  "ARANAN FİLM:",
  "{{FILTER_SENTENCE}}",
  "",
  "FİLTRE BAĞLAMLARI:",
  "{{FILTER_CONTEXT}}",
  "",
  "KARAR KURALI:",
  "- Film tanıma AÇIKÇA uymuyorsa no.",
  "- Film tanıma AÇIKÇA uyuyorsa yes.",
  "- Kısmen uyuyor ama emin değilsen unknown — bu durumda no DEME.",
  "- Sadece küçük bir detay eksikse unknown, temel özellik yoksa no.",
  "",
  "Filmler:",
  "{{MOVIES}}",
  "",
  "Yanıt YALNIZCA geçerli JSON: [{'id': <film_id>, 'match': 'yes'|'no'|'unknown', 'reason': '<max 12 kelime>'}]"
].join("\n");

const DEFAULT_STAGE2 = [
  "Sen bir film veri uzmanısın. Aşağıdaki filmler hakkında veri doldur.",
  "Yalnızca kanıtlanabilir bilgiyi yaz; bilmiyorsan null bırak.",
  "",
  "Filmler:",
  "{{MOVIES}}",
  "",
  "Doldurulacak alanlar:",
  "{{RULES}}",
  "",
  "Yanıt YALNIZCA geçerli JSON: [{'id': <film_id>, '<alan>': <değer>}]"
].join("\n");

const DEFAULT_FILTER_INFO = {
  "filter_info.season": "[YZ bağlamı]\n- winter: Hikâye kışın geçiyor.\n- summer: Hikâye yazın geçiyor.\n- spring: Hikâye ilkbaharda geçiyor.\n- autumn: Hikâye sonbaharda geçiyor.",
  "filter_info.reality": "[YZ bağlamı]\n- true: Gerçek olaylara birebir sadık.\n- mostly_true: Gerçek olaylara dayalı, sanatsal özgürlük var.\n- inspired: Gerçek olaylardan esinlenmiş.\n- realistic: Kurgusal ama gerçekçi.\n- fictional: Tamamen kurgusal.\n- utopic: Ütopik/distopik gelecek.",
  "filter_info.production_process": "[YZ bağlamı]\n- amateur: Çok düşük bütçe.\n- indie: Stüdyo dışı bağımsız.\n- art: Deneysel anlatım (Bergman, Tarkovsky).\n- big: 100M$+ bütçe.\n- bmovie: Düşük bütçeli tür sineması.\n- avant: Avangart.\n- studio: Klasik Hollywood.\n- no_music: Müzik yok.\n- rare_music: Az müzik.\n- handheld: El kamerası.\n- propaganda: İdeolojik mesaj.\n- dogme: Dogme 95.",
  "filter_info.narrative_style": "[YZ bağlamı]\n- multi: Bağımsız hikâyeler.\n- reverse: Sondan başa.\n- linear: Düz.\n- flashback: Geri dönüşlü.\n- end_first: Sonu önce.\n- mid_first: Orta önce.\n- fast: Hızlı tempolu.\n- slow: Durgun.\n- no_end: Açık uçlu.\n- alt_end: Alternatif son.\n- alt_narr: Alternatif anlatım.",
  "filter_info.sound": "[YZ bağlamı]\n- ambient: Doğal ortam sesi.\n- music: Yoğun müzik.\n- effects: Yoğun efekt.\n- voiceover_ext: Dış ses.\n- voiceover_int: İç ses.\n- silent: Sessiz film.\n- dubbed: Dublaj.",
  "filter_info.story_geography": "[YZ bağlamı]\n- city: Şehir.\n- town: Kasaba.\n- village: Köy.\n- mountain: Dağlık.\n- desert: Çöl.\n- steppe: Bozkır.\n- forest: Orman.\n- seaside: Deniz kenarı.\n- riverside: Nehir kenarı.\n- opensea: Açık deniz.\n- air: Havada.",
  "filter_info.character_traits": "[YZ bağlamı]\nKarakter ana/yan/figüran + cinsiyet/yaş/engel kombinasyonu.",
  "filter_info.story_dimensions": "[YZ bağlamı]\n- has_sequel: Devam filmi var.\n- is_sequel: Devam filmi.\n- series_tight: Diziyle sıkı bağlantılı.\n- series_loose: Diziyle alakalı.\n- concept: Konsept filmi.\n- has_version: Farklı versiyonu var.\n- same_event: Aynı olay farklı film.",
  "filter_info.story_period": "[YZ bağlamı]\nHikâyenin geçtiği dönem (d1940 = 1940'lar, c20 = 20. yüzyıl, bc = milattan önce, future = gelecek).",
  "filter_info.story_locations": "[YZ bağlamı]\n- city: Şehir.\n- town: Kasaba.\n- village: Köy.\n- mountain: Dağlık.\n- desert: Çöl.\n- steppe: Bozkır.\n- forest: Orman.\n- seaside: Deniz kenarı.\n- riverside: Nehir kenarı.\n- opensea: Açık deniz.\n- air: Havada.",
  "filter_info.family_content": "[YZ bağlamı]\nintensity: none=hiç yok, few=birkaç sahne, side=yan konu, main=ana konu. approach: bad=kötü, neutral=tarafsız, legit=meşrulaştırıyor."
};

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
let deadKeysCache = { ts: 0, gemini: new Map(), groq: new Set() };
const promptCache = { stage1: { ts: 0, template: null }, stage2: { ts: 0, template: null } };

const geminiCallLog = new Map();
function geminiMinGapMs(model) { return /lite/i.test(model) ? 4000 : 12000; }
function geminiTryAcquire(model, keyIndex) {
  const k = `${model}|${keyIndex}`;
  const now = Date.now();
  const last = geminiCallLog.get(k) || 0;
  if (now - last < geminiMinGapMs(model)) return false;
  geminiCallLog.set(k, now);
  return true;
}

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

function timingSafeEqualStr(a, b) {
  if (typeof a !== "string" || typeof b !== "string") return false;
  const len = Math.max(a.length, b.length);
  let diff = a.length ^ b.length;
  for (let i = 0; i < len; i++) {
    diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  }
  return diff === 0;
}
function isAdmin(request, env) {
  if (!env.ADMIN_TOKEN) return false;
  return timingSafeEqualStr(request.headers.get("Authorization") || "", `Bearer ${env.ADMIN_TOKEN}`);
}

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

function isBadDetailArray(val) {
  if (!Array.isArray(val)) return false;
  if (val.length === 0) return false;
  const looksLikeId = (s) => {
    if (typeof s !== "string") return false;
    const t = s.trim();
    if (!t) return true;
    return /^(nm|tt)\d+$/i.test(t)
      || /^\d+$/.test(t)
      || /^[QP]\d+$/i.test(t)
      || /^person[\/_-]\d+$/i.test(t)
      || /^id[\/_-]?\d+$/i.test(t)
      || /^@\d+$/.test(t)
      || /^\[object /i.test(t)
      || /^\{.*\}$/.test(t)
      || /^\[.*\]$/.test(t)
      || /":\s*"/.test(t)
      || /^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(t);
  };
  return val.some(v => {
    if (v == null) return true;
    if (typeof v === "string") return looksLikeId(v);
    if (typeof v === "number" || typeof v === "boolean") return true;
    if (typeof v === "object") {
      const candidates = [v.name, v.original_name];
      let valid = false;
      for (const c of candidates) {
        if (typeof c === "string" && c.trim() && !looksLikeId(c)) { valid = true; break; }
      }
      return !valid;
    }
    return true;
  });
}

function findStaleFields(profile, fieldRows, forceRefresh) {
  const now = Math.floor(Date.now() / 1000);
  const fetched = new Map(fieldRows.map(r => [r.field, Number(r.fetched_at)]));
  const stale = [];
  const detailFields = new Set(["writers", "writers_ids", "cast", "cast_ids", "director", "director_ids", "producers", "actors", "omdb_directors"]);
  // Array alanlar: boş array'ler stale sayılır (yeniden çekilsin).
  const arrayFields = new Set([
    "genres", "genres_ids", "spoken_languages", "spoken_languages_ids",
    "production_countries", "production_countries_ids", "production_companies", "production_companies_ids",
    "director", "director_ids", "writers", "writers_ids", "producers", "cast", "cast_ids",
    "keywords", "keywords_ids", "story_locations", "story_period", "story_geography",
    "season", "character_traits", "narrative_style", "production_process", "sound",
    "reality", "story_dimensions", "related_films", "filming_locations", "filming_countries",
    "awards_ids", "nominated_ids"
  ]);
  for (const [field, def] of Object.entries(FIELD_DEFS)) {
    const raw = profile[field];
    const isEmptyArray = Array.isArray(raw) && raw.length === 0;
    const hasValue = raw !== undefined && raw !== null && !isEmptyArray;
    const badData = hasValue && detailFields.has(field) && isBadDetailArray(raw);
    if (!hasValue || badData) { stale.push(field); continue; }
    if (arrayFields.has(field) && !Array.isArray(raw)) {
      // Yanlış tipte (string vs) — stale say.
      stale.push(field); continue;
    }
    if (forceRefresh) { stale.push(field); continue; }
    if (def.ttl == null) continue;
    const at = fetched.get(field) || 0;
    if (now - at > def.ttl) stale.push(field);
  }
  return stale;
}

async function loadDeadKeys(env) {
  const now = Date.now();
  if (now - deadKeysCache.ts < 30000) return deadKeysCache;
  if (!env.DB) return deadKeysCache;
  try {
    const { results } = await env.DB.prepare("SELECT provider, key_index, model FROM dead_keys WHERE until_ts > ?").bind(Math.floor(now / 1000)).all();
    const gemini = new Map();
    const groq = new Set();
    for (const r of results || []) {
      if (r.provider === "gemini") {
        if (!gemini.has(r.model)) gemini.set(r.model, new Set());
        gemini.get(r.model).add(r.key_index);
      } else if (r.provider === "groq") {
        groq.add(r.key_index);
      }
    }
    deadKeysCache = { ts: now, gemini, groq };
    return deadKeysCache;
  } catch (e) { console.warn("dead_keys read:", e.message); return deadKeysCache; }
}
function isKeyDeadForModel(dead, model, index) {
  const forModel = dead.gemini.get(model) || new Set();
  const forAll = dead.gemini.get("") || new Set();
  return forModel.has(index) || forAll.has(index);
}
async function markDeadKey(env, provider, keyIndex, untilTs, reason, model) {
  deadKeysCache.ts = 0;
  if (!env.DB) return;
  try {
    await env.DB.prepare(
      `INSERT INTO dead_keys (provider, key_index, model, until_ts, reason) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(provider, key_index, model) DO UPDATE SET until_ts = excluded.until_ts, reason = excluded.reason`
    ).bind(provider, keyIndex, model || "", untilTs, reason || "").run();
  } catch (e) { console.warn("dead_keys write:", e.message); }
}
function logLlmCall(env, provider, model, keyIndex, ok, latencyMs, errSnippet, context) {
  if (!env.DB) return;
  const now = Math.floor(Date.now() / 1000);
  const ctx = context || {};
  env.DB.prepare("INSERT INTO llm_calls (ts, provider, model, key_index, ok, latency_ms, error_snippet) VALUES (?, ?, ?, ?, ?, ?, ?)")
    .bind(now, provider, model, keyIndex, ok ? 1 : 0, latencyMs, errSnippet || null).run()
    .catch(e => console.warn("llm_calls:", e.message));
  if (ctx.movie_id || ctx.cache_hit !== undefined) {
    console.warn(JSON.stringify({ event: "llm_call", provider, model, key_index: keyIndex, ok, latency_ms: latencyMs, movie_id: ctx.movie_id || null, cache_hit: ctx.cache_hit ?? null, method: ctx.method || null }));
  }
}
async function getDailyModelCalls(env, provider, model) {
  if (!env.DB) return 0;
  try {
    const since = Math.floor(Date.now() / 1000) - 86400;
    const row = await env.DB.prepare(
      "SELECT COUNT(*) AS c FROM llm_calls WHERE provider = ? AND model = ? AND ok = 1 AND ts > ?"
    ).bind(provider, model, since).first();
    return Number(row?.c || 0);
  } catch { return 0; }
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
async function getMetatakeCache(env, movieId) {
  if (!env.DB) return null;
  try {
    const row = await env.DB.prepare("SELECT locations_json, fetched_at FROM metatake_cache WHERE movie_id = ?").bind(movieId).first();
    if (!row) return null;
    if (Math.floor(Date.now() / 1000) - row.fetched_at > 90 * 86400) return null;
    return safeJSON(row.locations_json, []);
  } catch { return null; }
}
async function putMetatakeCache(env, movieId, locations) {
  if (!env.DB) return;
  try {
    await env.DB.prepare(
      `INSERT INTO metatake_cache (movie_id, locations_json, fetched_at) VALUES (?, ?, ?)
       ON CONFLICT(movie_id) DO UPDATE SET locations_json = excluded.locations_json, fetched_at = excluded.fetched_at`
    ).bind(movieId, JSON.stringify(locations), Math.floor(Date.now() / 1000)).run();
  } catch (e) { console.warn("metatake cache:", e.message); }
}
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
  if (!res.ok) {
    const err = new Error(`${label}: HTTP ${res.status} ${body.slice(0, 300)}`);
    err.status = res.status;
    if (res.status === 429) {
      const retryAfter = Number(res.headers.get("retry-after") || 0);
      err.retryAfterMs = retryAfter > 0 ? retryAfter * 1000 : 60000;
    }
    throw err;
  }
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
  if (title) { try { return await omdb(env, { t: title, y: year }, outerSignal); } catch (e) { lastErr = e; } }
  if (movie.imdb_id) { try { return await omdb(env, { i: movie.imdb_id }, outerSignal); } catch (e) { lastErr = e; } }
  throw lastErr || new Error("OMDb: arama yapılamadı");
}

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
function orderGeminiModels(chain, promptLen, hasSemanticFilters) {
  const short = promptLen < 3000 && !hasSemanticFilters;
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

function classifyError(msg) {
  if (/HTTP 40[13]|invalid.?key|forbidden|unauthor/i.test(msg)) return { type: "invalid", cooldown: 3600, modelWide: false };
  if (/HTTP 429|rate.?limit|quota|exceeded/i.test(msg)) {
    if (/per day|daily|RPD|requests per day/i.test(msg)) return { type: "ratelimit-daily", cooldown: null, modelWide: false };
    if (/per minute|RPM|requests per minute/i.test(msg)) return { type: "ratelimit-minute", cooldown: 60, modelWide: false };
    return { type: "ratelimit", cooldown: null, modelWide: false };
  }
  if (/HTTP 400|invalid_argument|unknown parameter/i.test(msg)) return { type: "invalid-param", cooldown: 300, modelWide: true };
  if (/HTTP 503|service_unavailable|high demand/i.test(msg)) return { type: "model_down", cooldown: 300, modelWide: true };
  if (/aborted due to timeout|timed? ?out|network|fetch failed|socket/i.test(msg)) return { type: "network", cooldown: 60, modelWide: false };
  return { type: "unknown", cooldown: 120, modelWide: false };
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
  const texts = [];
  const walk = (obj, depth = 0) => {
    if (!obj || depth > 6) return;
    if (typeof obj === "string") { if (obj) texts.push(obj); return; }
    if (Array.isArray(obj)) { for (const x of obj) walk(x, depth + 1); return; }
    if (typeof obj === "object") {
      for (const k of ["text", "content", "output", "parts", "result", "response", "value", "message"]) {
        if (obj[k] !== undefined) walk(obj[k], depth + 1);
      }
    }
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
  }, `Gemini Interactions ${model}`, 20000, outerSignal);
  const text = extractGeminiText(data);
  if (!text) throw new Error(`Gemini Interactions ${model} yanıtında metin yok.`);
  return text;
}
async function callGeminiGenerate(env, key, model, prompt, outerSignal) {
  const url = `${GOOGLE_GENERATE}/${encodeURIComponent(model)}:generateContent`;
  const data = await fetchJSON(url, {
    method: "POST", headers: { "Content-Type": "application/json", "x-goog-api-key": key },
    body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
  }, `Gemini generateContent ${model}`, 20000, outerSignal);
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
    const cls = classifyError(msg);
    errors.push(`interactions: ${msg.slice(0, 150)}`);
    if (cls.type === "invalid" || cls.type === "model_down") throw e;
    if (cls.type === "ratelimit") throw e;
  }
  try {
    return await callGeminiGenerate(env, key, model, prompt, outerSignal);
  } catch (e) {
    const msg = String(e.message || e);
    errors.push(`generateContent: ${msg.slice(0, 150)}`);
    throw new Error(errors.join(" | "));
  }
}

async function callGroq(env, key, model, prompt, maxOutputTokens, useSearch, outerSignal) {
  const promptTokens = estimateTokens(prompt);
  const safeOutput = Math.max(256, Math.min(maxOutputTokens, GROQ_TPM_BUDGET - promptTokens));
  const content = /json/i.test(prompt) ? prompt : `${prompt}\n\nYanıtı yalnızca geçerli JSON formatında ver.`;
  const body = { model, messages: [{ role: "user", content }], temperature: 0.2, max_completion_tokens: safeOutput };
  if (useSearch) { body.tools = [{ type: "browser_search" }]; body.tool_choice = "required"; }
  else { body.response_format = { type: "json_object" }; }
  const data = await fetchJSON(`${GROQ_BASE}/chat/completions`, {
    method: "POST", headers: { "Content-Type": "application/json", "Authorization": `Bearer ${key}` },
    body: JSON.stringify(body)
  }, `Groq ${model}`, 30000, outerSignal);
  const text = data?.choices?.[0]?.message?.content || "";
  if (!text) throw new Error(`Groq ${model} yanıtında metin yok.`);
  return text;
}
async function callGroqModel(env, key, model, prompt, maxOutputTokens, useSearch, outerSignal) {
  if (!useSearch) return callGroq(env, key, model, prompt, maxOutputTokens, false, outerSignal);
  try {
    return await callGroq(env, key, model, prompt, maxOutputTokens, true, outerSignal);
  } catch (e) {
    const msg = String(e.message || e);
    console.warn(`groq: search başarısız, no-search denenecek — ${msg.slice(0, 120)}`);
    return await callGroq(env, key, model, prompt, maxOutputTokens, false, outerSignal);
  }
}

async function callLLMWithFallback(env, prompt, maxOutputTokens, useSearch, outerSignal, context = {}) {
  const deadlineMs = context.timeoutMs ? Math.min(context.timeoutMs, LLM_DEADLINE_MS) : LLM_DEADLINE_MS;
  const deadline = Date.now() + deadlineMs;
  const errors = [];
  const promptLen = estimateTokens(prompt);
  const dead = await loadDeadKeys(env);
  const nowSec = () => Math.floor(Date.now() / 1000);
  const hasSemantic = context.hasSemantic === true;
  const maxAttempts = Math.max(1, Math.min(context.maxAttempts ?? 4, 6));
  let attempts = 0;

  const geminiKeys = [env.GEMINI_API_KEY_1, env.GEMINI_API_KEY_2, env.GEMINI_API_KEY_3].map((k, i) => ({ key: k, index: i + 1 })).filter(x => x.key);
  const rotatedG = rotateKeys(geminiKeys, geminiRR++);
  const geminiModels = orderGeminiModels(buildGeminiChain(env), promptLen, hasSemantic);
  let geminiTried = false;

  outer: for (const model of geminiModels) {
    if (Date.now() > deadline || attempts >= maxAttempts) break;
    let rpdSkip = false;
    try {
      const daily = await getDailyModelCalls(env, "gemini", model);
      const rpdLimit = /lite/i.test(model) ? 500 : 20;
      if (daily >= rpdLimit - 2) { rpdSkip = true; }
    } catch {}
    if (rpdSkip) continue;
    let modelWideIssue = false;
    for (const { key, index } of rotatedG) {
      if (attempts >= maxAttempts) break outer;
      if (modelWideIssue || isKeyDeadForModel(dead, model, index)) continue;
      if (Date.now() > deadline) break outer;
      if (outerSignal?.aborted) throw new Error("İstemci isteği iptal etti.");
      if (!geminiTryAcquire(model, index)) continue;
      geminiTried = true;
      attempts++;
      const start = Date.now();
      try {
        const result = await callGeminiModel(env, key, model, prompt, outerSignal);
        logLlmCall(env, "gemini", model, index, true, Date.now() - start, null, { ...context, method: context.method || "unknown" });
        return result;
      } catch (e) {
        const msg = String(e.message || e);
        const cls = classifyError(msg);
        logLlmCall(env, "gemini", model, index, false, Date.now() - start, msg.slice(0, 200), context);
        errors.push(`gemini ${model} key=${index}: ${msg.slice(0, 120)}`);
        console.warn(`gemini: model=${model} key=${index} type=${cls.type} — ${msg.slice(0, 200)}`);
        if (cls.modelWide) { modelWideIssue = true; errors.push(`[${model} ${cls.type} model-wide]`); }
        else if (cls.type === "ratelimit-daily") {
          const tomorrow = new Date(); tomorrow.setUTCHours(0, 0, 0, 0); tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
          await markDeadKey(env, "gemini", index, Math.floor(tomorrow.getTime() / 1000) + 3600, msg.slice(0, 200), model);
        }
        else if (cls.type === "ratelimit-minute" || cls.type === "ratelimit") {
          const waitSec = e.retryAfterMs ? Math.ceil(e.retryAfterMs / 1000) : 60;
          await markDeadKey(env, "gemini", index, nowSec() + waitSec, msg.slice(0, 200), model);
        }
        else if (cls.cooldown) { await markDeadKey(env, "gemini", index, nowSec() + cls.cooldown, msg.slice(0, 200), model); }
      }
    }
  }

  const groqKeys = [env.GROQ_API_KEY_1, env.GROQ_API_KEY_2, env.GROQ_API_KEY_3].map((k, i) => ({ key: k, index: i + 1 })).filter(x => x.key);
  const rotatedQ = rotateKeys(groqKeys, groqRR++);
  const groqModels = orderGroqModels(buildGroqChain(env), promptLen);
  let groqTried = false;

  if (groqKeys.length) {
    if (geminiTried) console.warn("Gemini başarısız, Groq yedek sağlayıcısına geçiliyor...");
    outerQ: for (const model of groqModels) {
      if (attempts >= maxAttempts) break;
      if (Date.now() > deadline) break;
      for (const { key, index } of rotatedQ) {
        if (attempts >= maxAttempts) break outerQ;
        if (dead.groq.has(index)) continue;
        if (Date.now() > deadline) break outerQ;
        if (outerSignal?.aborted) throw new Error("İstemci isteği iptal etti.");
        groqTried = true;
        attempts++;
        const start = Date.now();
        try {
          const result = await callGroqModel(env, key, model, prompt, maxOutputTokens, useSearch, outerSignal);
          logLlmCall(env, "groq", model, index, true, Date.now() - start, null, context);
          return result;
        } catch (e) {
          const msg = String(e.message || e);
          const cls = classifyError(msg);
          logLlmCall(env, "groq", model, index, false, Date.now() - start, msg.slice(0, 200), context);
          errors.push(`groq ${model} key=${index}: ${msg.slice(0, 120)}`);
          console.warn(`groq: model=${model} key=${index} type=${cls.type} — ${msg.slice(0, 200)}`);
          if (cls.type === "ratelimit-daily") {
            const tomorrow = new Date(); tomorrow.setUTCHours(0, 0, 0, 0); tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
            await markDeadKey(env, "groq", index, Math.floor(tomorrow.getTime() / 1000) + 3600, msg.slice(0, 200));
          }
          else if (cls.type === "ratelimit-minute" || cls.type === "ratelimit") {
            const waitSec = e.retryAfterMs ? Math.ceil(e.retryAfterMs / 1000) : 60;
            await markDeadKey(env, "groq", index, nowSec() + waitSec, msg.slice(0, 200));
          }
          else if (cls.cooldown) await markDeadKey(env, "groq", index, nowSec() + cls.cooldown, msg.slice(0, 200));
        }
      }
    }
  }

  const providers = [];
  if (geminiTried) providers.push("Gemini");
  if (groqTried) providers.push("Groq");
  throw new Error(`${providers.join(" + ") || "LLM"} tüm modellerde başarısız: ${errors.join(" | ")}`);
  }
async function getFilmmapCache(env, movieId) {
  if (!env.DB) return null;
  try {
    const row = await env.DB.prepare("SELECT locations_json, fetched_at FROM filmmap_cache WHERE movie_id = ?").bind(movieId).first();
    if (!row) return null;
    if (Math.floor(Date.now() / 1000) - row.fetched_at > 90 * 86400) return null;
    return safeJSON(row.locations_json, []);
  } catch { return null; }
}
async function putFilmmapCache(env, movieId, locations) {
  if (!env.DB) return;
  try {
    await env.DB.prepare(
      `INSERT INTO filmmap_cache (movie_id, locations_json, fetched_at) VALUES (?, ?, ?)
       ON CONFLICT(movie_id) DO UPDATE SET locations_json = excluded.locations_json, fetched_at = excluded.fetched_at`
    ).bind(movieId, JSON.stringify(locations), Math.floor(Date.now() / 1000)).run();
  } catch (e) { console.warn("filmmap cache:", e.message); }
}

async function getMetatakeExtendedCache(env, movieId) {
  if (!env.DB) return null;
  try {
    const row = await env.DB.prepare("SELECT * FROM metatake_extended WHERE movie_id = ?").bind(movieId).first();
    if (!row) return null;
    if (Math.floor(Date.now() / 1000) - row.fetched_at > 90 * 86400) return null;
    return {
      narrative_setting: safeJSON(row.narrative_setting_json, []) || [],
      kindred_films: safeJSON(row.kindred_films_json, []) || [],
      awards: safeJSON(row.awards_json, []) || [],
      confidence: row.confidence,
      locations: safeJSON(row.locations_json, []) || []
    };
  } catch { return null; }
}
async function putMetatakeExtendedCache(env, movieId, data) {
  if (!env.DB) return;
  try {
    await env.DB.prepare(
      `INSERT INTO metatake_extended (movie_id, narrative_setting_json, kindred_films_json, awards_json, confidence, locations_json, fetched_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(movie_id) DO UPDATE SET
         narrative_setting_json = excluded.narrative_setting_json,
         kindred_films_json = excluded.kindred_films_json,
         awards_json = excluded.awards_json,
         confidence = excluded.confidence,
         locations_json = excluded.locations_json,
         fetched_at = excluded.fetched_at`
    ).bind(
      movieId,
      JSON.stringify(data.narrative_setting || []),
      JSON.stringify(data.kindred_films || []),
      JSON.stringify(data.awards || []),
      data.confidence ?? null,
      JSON.stringify(data.locations || []),
      Math.floor(Date.now() / 1000)
    ).run();
  } catch (e) { console.warn("metatake extended cache:", e.message); }
}

async function filmmapLocations(env, movie, outerSignal) {
  const movieId = movieKey(movie);
  const cached = await getFilmmapCache(env, movieId);
  if (cached) return { locations: cached, fromCache: true };
  const title = movie.original_title || movie.title || "";
  if (!title) return { locations: [], fromCache: false };
  try {
    const body = {
      jsonrpc: "2.0", id: 1, method: "tools/call",
      params: { name: "where_was_it_filmed", arguments: { title, limit: 100 } }
    };
    const signal = combineSignals(outerSignal, 10000);
    const res = await fetch("https://moviescenemap.com/mcp", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Accept": "application/json, text/event-stream" },
      body: JSON.stringify(body), signal
    });
    if (!res.ok) return { locations: [], fromCache: false, error: `HTTP ${res.status}` };
    const raw = await res.text();
    let data = safeJSON(raw, null);
    if (!data) {
      const lines = raw.split(/\r?\n/).filter(l => l.startsWith("data: "));
      for (const l of lines) { const parsed = safeJSON(l.slice(6), null); if (parsed) { data = parsed; break; } }
    }
    if (!data) return { locations: [], fromCache: false, error: "parse fail" };
    if (data.error) return { locations: [], fromCache: false, error: data.error.message || "rpc error" };
    let payload = null;
    const content = data?.result?.content;
    if (Array.isArray(content)) {
      for (const c of content) {
        if (c?.type === "text" && typeof c.text === "string") { const arr = safeJSON(c.text, null); if (arr) { payload = arr; break; } }
      }
    }
    if (!payload && data?.result) payload = data.result;
    if (!payload) return { locations: [], fromCache: false, error: "no payload" };
    const rawPlaces = payload.places || payload.locations || payload.films || payload.results || payload.data || [];
    const places = Array.isArray(rawPlaces) ? rawPlaces : [];
    const locations = places.map(p => ({
      name: String(p.place || p.name || p.location || p.title || "").trim(),
      country: String(p.country || "").trim(),
      city: String(p.city || "").trim(),
      relation: String(p.relation || p.layer || "filmed"),
      confidence: p.confidence != null ? Number(p.confidence) : null,
      lat: p.lat != null ? Number(p.lat) : (p.latitude != null ? Number(p.latitude) : null),
      lng: p.lng != null ? Number(p.lng) : (p.longitude != null ? Number(p.longitude) : null)
    })).filter(l => l.name);
    const seen = new Set(); const unique = [];
    for (const loc of locations) {
      const key = `${norm(loc.name)}|${norm(loc.country)}`;
      if (seen.has(key)) continue;
      seen.add(key); unique.push(loc);
    }
    await putFilmmapCache(env, movieId, unique);
    return { locations: unique, fromCache: false, countriesOnly: payload.countries_only || [] };
  } catch (e) {
    console.warn("filmmap:", e.message);
    return { locations: [], fromCache: false, error: e.message };
  }
}

async function metatakeExtended(env, movie, outerSignal) {
  const movieId = movieKey(movie);
  const cached = await getMetatakeExtendedCache(env, movieId);
  if (cached) return cached;
  const title = movie.original_title || movie.title || "";
  if (!title) return null;
  const headers = { "Accept": "application/json", "User-Agent": USER_AGENT };
  try {
    const searchUrl = `https://metatake.net/api/v1/films?q=${encodeURIComponent(title)}&limit=5`;
    const searchData = await fetchJSON(searchUrl, { headers }, "Metatake search", 10000, outerSignal);
    const films = Array.isArray(searchData?.films) ? searchData.films : [];
    if (!films.length) return null;
    const year = yearOf(movie);
    const match = (year && films.find(f => Number(f.year) === Number(year))) || films[0];
    const slug = match.slug;
    if (!slug) return null;

    let film = null;
    try { film = await fetchJSON(`https://metatake.net/api/v1/films/${encodeURIComponent(slug)}`, { headers }, "Metatake film", 10000, outerSignal); } catch (e) { console.warn("metatake film:", e.message); }

    let locations = [];
    try {
      const locData = await fetchJSON(`https://metatake.net/api/v1/locations?film=${encodeURIComponent(slug)}&limit=100`, { headers }, "Metatake locations", 10000, outerSignal);
      const locList = Array.isArray(locData?.locations) ? locData.locations : [];
      locations = locList.map(loc => ({
        name: String(loc.name || "").trim(),
        country: String(loc.country || "").trim(),
        city: "",
        layer: String(loc.layer || "filmed"),
        kind: String(loc.role || ""),
        lat: loc.lat != null ? Number(loc.lat) : null,
        lng: loc.lng != null ? Number(loc.lng) : null,
        precision: loc.precision || null
      })).filter(l => l.name);
    } catch (e) { console.warn("metatake locations:", e.message); }

    const settings = locations.filter(l => String(l.layer).toLowerCase() === "setting").map(l => l.name);
    const filmingPlaces = locations.filter(l => String(l.layer).toLowerCase() !== "setting").map(l => l.name);
    const kindred = Array.isArray(film?.kindred) ? film.kindred.map(k => ({ title: String(k.title || "").trim(), year: k.year != null ? Number(k.year) : null, slug: k.slug || null })).filter(k => k.title) : [];
    const takescore = film?.takescore || null;
    const lowConfidence = takescore?.low_confidence === true;
    const confidence = takescore ? (lowConfidence ? 0.4 : 0.85) : (match.analyzed ? 0.6 : null);

    const result = {
      narrative_setting: settings,
      filming_places: filmingPlaces,
      kindred_films: kindred.map(k => k.title),
      kindred_full: kindred,
      awards: [],
      confidence,
      low_confidence: lowConfidence,
      locations,
      takescore: takescore ? { score: takescore.score ?? null, value: takescore.value ?? null, cost: takescore.cost ?? null, risk: takescore.risk ?? null } : null,
      url: film?.url || match.url || null,
      cite_as: film?.cite_as || null
    };
    await putMetatakeExtendedCache(env, movieId, result);
    return result;
  } catch (e) { console.warn("metatake extended:", e.message); return null; }
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

function buildFilterSentence(filters) {
  const f = filters || {};
  const parts = [];
  if (f.genres?.include?.length) { const names = f.genres.include.map(x => x.label || x).filter(Boolean); if (names.length) parts.push(`türü ${names.join(" veya ")} olan`); }
  if (f.genres?.exclude?.length) { const names = f.genres.exclude.map(x => x.label || x).filter(Boolean); if (names.length) parts.push(`${names.join(", ")} türünde olmamalı`); }
  const setInclude = (field, prefix) => { const v = f[field]; if (!v?.include?.length) return; const names = v.include.map(x => x.label || x).filter(Boolean); if (names.length) parts.push(`${prefix}: ${names.join(" veya ")}`); };
  const setExclude = (field, suffix) => { const v = f[field]; if (!v?.exclude?.length) return; const names = v.exclude.map(x => x.label || x).filter(Boolean); if (names.length) parts.push(`${suffix} ${names.join(", ")} olmamalı`); };
  setInclude("season", "hikâyesi şu mevsimde geçen"); setExclude("season", "hikâyesi şu mevsimlerde geçmemeli:");
  setInclude("reality", "gerçeklik"); setExclude("reality", "gerçeklik açısından:");
  setInclude("production_process", "yapım süreci"); setExclude("production_process", "yapım süreci şunlardan olmamalı:");
  setInclude("narrative_style", "anlatım tarzı"); setExclude("narrative_style", "anlatım tarzı şunlardan olmamalı:");
  setInclude("sound", "ses özelliği"); setExclude("sound", "ses özelliği şunlardan olmamalı:");
  setInclude("story_geography", "coğrafya"); setExclude("story_geography", "coğrafya şunlardan olmamalı:");
  setInclude("story_period", "dönem"); setExclude("story_period", "dönem şunlardan olmamalı:");
  setInclude("character_traits", "karakter özellikleri"); setExclude("character_traits", "karakter özellikleri şunlardan olmamalı:");
  setInclude("story_dimensions", "hikâye boyutları"); setExclude("story_dimensions", "hikâye boyutları şunlardan olmamalı:");
  setInclude("aspect_ratio", "en-boy oranı"); setExclude("aspect_ratio", "en-boy oranı şunlardan olmamalı:");
  if (f.family_content) {
    for (const [key, val] of Object.entries(f.family_content)) {
      if (!val) continue;
      const label = TRAIT_TR[key] || key;
      const intensity = INTENSITY_TR[val.intensity];
      if (intensity) {
        parts.push(`${label} içeriği ${intensity}`);
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
  if (f.locationMin != null || f.locationMax != null) parts.push(`mekân sayısı ${f.locationMin ?? "?"}-${f.locationMax ?? "?"}`);
  return parts.length ? parts.join(". ") + "." : "";
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
      const filtered = contextPart.split("\n").filter(l => {
        const m = l.trim().match(/^[-•]\s*([a-z_0-9]+):/i);
        return !m || usedSlugs.has(m[1].toLowerCase());
      });
      contextPart = filtered.join("\n").trim();
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
  if (f.family_content && Object.keys(f.family_content).length) active.family_content = f.family_content;
  if (f.characterDensity) active.characterDensity = f.characterDensity;
  const sorted = Object.keys(active).sort().reduce((o, k) => { o[k] = active[k]; return o; }, {});
  return simpleHash(JSON.stringify(sorted));
}
function hasSemanticFilters(filters) {
  return semanticSignature(filters) !== simpleHash("{}");
}
function ratioFieldsNeeded(filters) {
  const f = filters || {};
  const fields = [];
  if (f.dayRatioMin != null) fields.push("day_ratio");
  if (f.outdoorRatioMin != null) fields.push("indoor_ratio");
  if (f.dialogueDensityMin != null) fields.push("dialogue_density");
  if (f.colorRatioMin != null) fields.push("color_ratio");
  return fields;
}
function locationFieldsNeeded(filters) {
  const f = filters || {};
  if (f.locationMin != null || f.locationMax != null) return ["location_count"];
  return [];
}

async function classifyBatch(env, movies, filterSentence, filterContext, useSearch, signal, context = {}) {
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
  const raw = await callLLMWithFallback(env, prompt, 800, useSearch, signal, { ...context, method: "stage1", hasSemantic: true, maxAttempts: 3 });
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

function buildStage2Rules(fields) {
  const rules = [];
  for (const f of fields) {
    if (FIELD_RULES[f]) rules.push(FIELD_RULES[f]);
    else if (f === "day_ratio") rules.push(`day_ratio: 0-100 tam sayı — filmde gündüz geçen sahnelerin yüzdesi`);
    else if (f === "night_ratio") rules.push(`night_ratio: 0-100 tam sayı — filmde gece geçen sahnelerin yüzdesi`);
    else if (f === "indoor_ratio") rules.push(`indoor_ratio: 0-100 tam sayı — filmde iç mekânda geçen sahnelerin yüzdesi`);
    else if (f === "dialogue_density") rules.push(`dialogue_density: 0-100 tam sayı — diyalog yoğunluğu yüzdesi`);
    else if (f === "color_ratio") rules.push(`color_ratio: 0-100 tam sayı — renkli çekim yüzdesi`);
    else if (f === "family_content") rules.push(`family_content: {"main_characters": <int>, "supporting_characters": <int>, "extras": <int>, "<trait>": {"intensity": "none|few|side|main", "approach": "bad|neutral|legit"}}`);
    else if (f === "story_period") rules.push(`story_period: string[] (dönem etiketleri)`);
    else if (f === "story_locations") rules.push(`story_locations: string[] (yer adları)`);
    else if (f === "aspect_ratio") rules.push(`aspect_ratio: string (ör. "2.39:1")`);
    else if (f === "location_count") rules.push(`location_count: 1-100 arası tam sayı — hikâyede geçen farklı mekân sayısı.`);
    else rules.push(`${f}: uygun değer`);
  }
  return rules.join("\n");
}

async function fillDetailsBatch(env, movies, staleFields, signal, context = {}) {
  const out = new Map();
  if (!staleFields.length || !movies.length) return out;
  const template = await getPromptTemplate(env, "prompt_template.stage2");
  const moviePayload = movies.map(m => ({
    id: m.id, title: m.title, original_title: m.original_title,
    year: yearOf(m), overview: (m.overview || "").slice(0, 400)
  }));
  const rules = buildStage2Rules(staleFields);
  const prompt = template
    .replace(/\{\{MOVIES\}\}/g, JSON.stringify(moviePayload))
    .replace(/\{\{RULES\}\}/g, rules);
  let raw;
  try {
    raw = await callLLMWithFallback(env, prompt, 2000, false, signal, { ...context, method: "stage2", hasSemantic: true, maxAttempts: 3, timeoutMs: context.timeoutMs });
  } catch (e) {
    console.warn("fillDetailsBatch:", String(e.message || e).slice(0, 200));
    return out;
  }
  const arr = extractJSONArray(raw) || (() => { try { const o = extractJSON(raw); return o.movies || []; } catch { return []; } })();
  for (const item of arr) {
    if (!item || item.id == null) continue;
    const updates = {};
    for (const f of staleFields) if (item[f] !== undefined && item[f] !== null) updates[f] = item[f];
    if (Object.keys(updates).length) out.set(String(item.id), updates);
  }
  return out;
}

async function fillDetails(env, movie, staleLLMFields, signal, context = {}) {
  const map = await fillDetailsBatch(env, [movie], staleLLMFields, signal, { ...context, maxAttempts: 2, timeoutMs: 20000 });
  return map.get(String(movie.id)) || {};
                               }
function buildWikidataBatchQuery(movies) {
  const rows = movies.map(m => {
    const title = (m.original_title || m.title || "").replace(/\\/g, "\\\\").replace(/"/g, '\\"');
    return `("${title}"@en ${m.id})`;
  }).join(" ");
  return `
SELECT ?movieId ?item ?originalWorkLabel ?filmingLocationLabel ?filmingCountryLabel ?award ?awardLabel ?nominatedLabel WHERE {
  VALUES (?title ?movieId) { ${rows} }
  ?item rdfs:label ?title .
  ?item wdt:P31 wd:Q11424 .
  OPTIONAL { ?item wdt:P144 ?originalWork. }
  OPTIONAL { ?item wdt:P915 ?filmingLocation. }
  OPTIONAL { ?filmingLocation wdt:P17 ?filmingCountry. }
  OPTIONAL { ?item wdt:P166 ?award. }
  OPTIONAL { ?item wdt:P1411 ?nominated. }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en,tr". }
}
LIMIT 300`;
}
async function wikidataBatchOnce(env, movies, timeoutMs, outerSignal) {
  const results = new Map();
  if (!movies.length) return results;
  const query = buildWikidataBatchQuery(movies);
  const url = "https://query.wikidata.org/sparql?query=" + encodeURIComponent(query);
  const data = await fetchJSON(url, {
    headers: { "Accept": "application/sparql-results+json", "User-Agent": USER_AGENT }
  }, "Wikidata", timeoutMs, outerSignal);
  const bindings = data.results?.bindings || [];
  const byId = new Map();
  for (const b of bindings) {
    const id = b.movieId?.value || "";
    if (!byId.has(id)) byId.set(id, { originalWork: null, locations: new Set(), countries: new Set(), awards: new Set(), nominations: new Set() });
    const rec = byId.get(id);
    if (b.originalWorkLabel?.value) rec.originalWork = b.originalWorkLabel.value;
    if (b.filmingLocationLabel?.value) rec.locations.add(b.filmingLocationLabel.value);
    if (b.filmingCountryLabel?.value) rec.countries.add(b.filmingCountryLabel.value);
    const awardUri = b.award?.value || "";
    if (awardUri) { const qid = awardUri.split("/").pop(); if (/^Q\d+$/.test(qid)) rec.awards.add(qid); }
    const nomUri = b.nominated?.value || "";
    if (nomUri) { const qid = nomUri.split("/").pop(); if (/^Q\d+$/.test(qid)) rec.nominations.add(qid); }
  }
  for (const [id, rec] of byId) {
    results.set(id, {
      originalWork: rec.originalWork,
      filmingLocations: [...rec.locations],
      filmingCountries: [...rec.countries],
      awards: [...rec.awards],
      nominations: [...rec.nominations]
    });
  }
  return results;
}
async function wikidataBatch(env, movies, outerSignal) {
  try { return await wikidataBatchOnce(env, movies, 25000, outerSignal); }
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
  const data = await fetchJSON(url.toString(), { headers: { "User-Agent": USER_AGENT } }, "Wikimedia Commons", 18000, outerSignal);
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
    url: `https://image.tmdb.org/t/p/w342${b.file_path}`,
    pageUrl: `https://www.themoviedb.org/movie/${movie.id}`,
    license: "TMDB", description: "", vote_average: b.vote_average || 0
  })).filter(x => x.url);
}

async function enrichClassic(env, movie, staleFields, outerSignal) {
  const need = new Set(staleFields);
  const updates = {};
  const covered = new Set();
  if (movie.id) {
    try {
      const detail = await tmdb(env, `/movie/${movie.id}`, { language: "tr-TR", append_to_response: "credits,images,keywords" }, outerSignal);
      const genres = Array.isArray(detail.genres) ? detail.genres : [];
      if (need.has("genres") && genres.length) { updates.genres = genres.map(g => g.name); covered.add("genres"); }
      if (need.has("genres_ids") && genres.length) { updates.genres_ids = genres.map(g => g.id); covered.add("genres_ids"); }
      const langs = Array.isArray(detail.spoken_languages) ? detail.spoken_languages : [];
      if (need.has("spoken_languages")) { updates.spoken_languages = langs.map(l => l.name || l.english_name || l.iso_639_1); covered.add("spoken_languages"); }
      if (need.has("spoken_languages_ids")) { updates.spoken_languages_ids = langs.map(l => l.iso_639_1); covered.add("spoken_languages_ids"); }
      const countries = Array.isArray(detail.production_countries) ? detail.production_countries : [];
      if (need.has("production_countries")) { updates.production_countries = countries.map(c => c.name || c.iso_3166_1); covered.add("production_countries"); }
      if (need.has("production_countries_ids")) { updates.production_countries_ids = countries.map(c => c.iso_3166_1); covered.add("production_countries_ids"); }
      if (need.has("runtime")) { updates.runtime = Number(detail.runtime) || null; covered.add("runtime"); }
      const companies = Array.isArray(detail.production_companies) ? detail.production_companies : [];
      if (need.has("production_companies")) { updates.production_companies = companies.map(c => c.name); covered.add("production_companies"); }
      if (need.has("production_companies_ids")) { updates.production_companies_ids = companies.map(c => c.id); covered.add("production_companies_ids"); }

      const originalLang = detail.original_language || "";
      const isTurkishFilm = originalLang === "tr";
      const posters = detail.images?.posters || [];
      const trPosterPath = detail.poster_path || "";
      const detailPosterEntry = posters.find(p => p.file_path === trPosterPath);
      const detailPosterIsTurkish = detailPosterEntry?.iso_639_1 === "tr";

      const pickOriginalPoster = () => {
        if (isTurkishFilm) {
          return posters.find(p => p.iso_639_1 === "tr")
            || posters.find(p => !p.iso_639_1)
            || (detailPosterIsTurkish ? { file_path: trPosterPath } : null)
            || (posters[0] ? { file_path: posters[0].file_path } : null);
        }
        return posters.find(p => p.iso_639_1 === originalLang && p.iso_639_1 !== "tr")
          || posters.find(p => p.iso_639_1 === "en")
          || posters.find(p => !p.iso_639_1)
          || posters.find(p => p.iso_639_1 && p.iso_639_1 !== "tr");
      };

      if (need.has("original_poster_path")) {
        const originalPoster = pickOriginalPoster();
        if (originalPoster) { updates.original_poster_path = originalPoster.file_path; covered.add("original_poster_path"); }
        else if (isTurkishFilm) { updates.original_poster_path = null; covered.add("original_poster_path"); }
        else if (detailPosterIsTurkish) { updates.poster_path = null; }
      }

      const kw = detail.keywords?.keywords || [];
      if (need.has("keywords")) { updates.keywords = kw.map(k => k.name); covered.add("keywords"); }
      if (need.has("keywords_ids")) { updates.keywords_ids = kw.map(k => k.id); covered.add("keywords_ids"); }

      const credits = detail.credits;
      if (credits) {
        const crew = credits.crew || [];
        const sanitizePerson = (c) => {
          const name = typeof c?.name === "string" ? c.name.trim() : "";
          if (!name) return null;
          if (/^(nm|tt)\d+$/i.test(name) || /^\d+$/.test(name) || /^[QP]\d+$/.test(name) || /^\[object /i.test(name)) return null;
          return { name, profile_path: c.profile_path || null };
        };
        if (need.has("director")) { updates.director = crew.filter(c => c.job === "Director").map(sanitizePerson).filter(Boolean); covered.add("director"); }
        if (need.has("director_ids")) { updates.director_ids = crew.filter(c => c.job === "Director").map(c => c.id); covered.add("director_ids"); }
        if (need.has("writers")) { updates.writers = crew.filter(c => c.department === "Writing" || c.job === "Writer").map(sanitizePerson).filter(Boolean); covered.add("writers"); }
        if (need.has("writers_ids")) { updates.writers_ids = crew.filter(c => c.department === "Writing" || c.job === "Writer").map(c => c.id); covered.add("writers_ids"); }
        if (need.has("producers")) { updates.producers = crew.filter(c => c.job === "Producer").map(sanitizePerson).filter(Boolean); covered.add("producers"); }
        if (need.has("cast")) { updates.cast = (credits.cast || []).slice(0, 8).map(sanitizePerson).filter(Boolean); covered.add("cast"); }
        if (need.has("cast_ids")) { updates.cast_ids = (credits.cast || []).slice(0, 20).map(c => c.id); covered.add("cast_ids"); }
      }
      if (!movie.imdb_id && detail.imdb_id) movie.imdb_id = detail.imdb_id;
    } catch (e) { console.warn("tmdb detail enrich:", e.message); }
  }
  if (["imdbRating","imdbVotes","imdbID","omdb_directors","actors","rated","awards","metascore","boxOffice","omdb_poster"].some(f => need.has(f))) {
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
      if (need.has("omdb_poster")) { updates.omdb_poster = clean(data.Poster); covered.add("omdb_poster"); }
    } catch (e) { console.warn("omdb enrich:", e.message); }
  }
  return { updates, covered };
}

function personNameFromObj(it) {
  if (!it || typeof it !== "object") return "";
  const candidates = [it.name, it.original_name, it.full_name, it.title, it.label];
  for (const c of candidates) {
    if (typeof c === "string") {
      const t = c.trim();
      if (!t) continue;
      if (/^(nm|tt)\d+$/i.test(t) || /^\d+$/.test(t) || /^[QP]\d+$/i.test(t) || /^id[\/_-]?\d+$/i.test(t) || /^\[object /i.test(t)) continue;
      return t;
    }
  }
  return "";
}
function sanitizePeopleField(val) {
  if (!Array.isArray(val)) return val;
  const out = [];
  for (const it of val) {
    if (it == null) continue;
    if (typeof it === "number" || typeof it === "boolean") continue;
    if (typeof it === "string") {
      let t = it.trim();
      if (!t) continue;
      if (/<a\b/i.test(t)) { const m = t.match(/>([^<>]+)</); if (m && m[1]) t = m[1].trim(); }
      t = t.replace(/\s*\((?:person|nm|tt|id)[\s\/_-]*\d+\)\s*$/i, "").trim();
      if (!t || /^(nm|tt)\d+$/i.test(t) || /^\d+$/.test(t) || /^[QP]\d+$/i.test(t) || /^person[\/_-]\d+$/i.test(t) || /^id[\/_-]?\d+$/i.test(t) || /^@\d+$/.test(t) || /^\[object /i.test(t) || /^\{/.test(t) || /^\[/.test(t) || /":\s*"/.test(t) || /^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(t)) continue;
      out.push({ name: t, profile_path: null });
    } else if (typeof it === "object") {
      const n = personNameFromObj(it);
      if (!n) continue;
      out.push({ name: n, profile_path: it.profile_path || null });
    }
  }
  return out;
}

function toNum(v) {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "string" && /^n\/?a$/i.test(v.trim())) return null;
  const n = Number(String(v).replace(/[^\d.-]/g, ""));
  return Number.isFinite(n) ? n : null;
}

// matchSet: include için OR semantiği (TMDB pipe=OR ile uyumlu).
// Tek seçimde AND=OR eşdeğer olduğundan geriye dönük uyumludur.
// Çoklu seçimde kullanıcının "A veya B" beklentisi doğru karşılanır.
function matchSet(profileField, filterObj, altProfileField) {
  if (!filterObj) return { match: true, unknown: false, conflict: false, reasons: [] };
  const raw = Array.isArray(profileField) ? profileField.map(norm) : (profileField ? [norm(profileField)] : []);
  const altRaw = Array.isArray(altProfileField) ? altProfileField.map(norm) : (altProfileField ? [norm(altProfileField)] : []);
  const allRaw = [...raw, ...altRaw];
  const empty = allRaw.length === 0;
  const reasons = [];
  let match = true, unknown = false, conflict = false;
  const matches = (x) => {
    const v = norm(x.label || x);
    if (allRaw.includes(v)) return true;
    if (x.id != null && x.id !== "") { if (allRaw.includes(norm(x.id))) return true; }
    return allRaw.some(h => h.includes(v) || v.includes(h));
  };
  if (filterObj.include?.length) {
    const matched = filterObj.include.filter(x => matches(x));
    if (matched.length === 0) {
      if (empty) { unknown = true; reasons.push(`bilinmiyor: ${filterObj.include.map(x => x.label || x).join(", ")}`); }
      else { match = false; reasons.push(`eksik: ${filterObj.include.map(x => x.label || x).join(", ")}`); }
    }
  }
  if (filterObj.exclude?.length) {
    const hit = filterObj.exclude.filter(x => matches(x));
    if (hit.length) { match = false; conflict = true; reasons.push(`hariç: ${hit.map(x => x.label || x).join(", ")}`); }
  }
  return { match, unknown, conflict, reasons };
}
function matchIdSet(profileIds, filterObj) {
  if (!filterObj) return { match: true, unknown: false, reasons: [] };
  const have = (profileIds || []).map(x => String(x).trim()).filter(Boolean);
  if (filterObj.include?.length) {
    const matched = filterObj.include.filter(x => x.id != null && have.includes(String(x.id).trim()));
    if (matched.length === 0) {
      if (have.length === 0) return { match: true, unknown: true, reasons: ["bilinmiyor"] };
      return { match: false, unknown: false, reasons: [`eksik: ${filterObj.include.map(x => x.label || x.id).join(", ")}`] };
    }
  }
  if (filterObj.exclude?.length) {
    const hit = filterObj.exclude.filter(x => x.id != null && have.includes(String(x.id).trim()));
    if (hit.length) return { match: false, unknown: false, reasons: [`hariç: ${hit.map(x => x.label || x).join(", ")}`] };
  }
  return { match: true, unknown: false, reasons: [] };
}
function matchRated(profileRated, filterObj) {
  if (!filterObj) return { match: true, unknown: false, reasons: [] };
  const have = profileRated ? norm(profileRated) : "";
  if (!have) return { match: true, unknown: true, reasons: ["Yaş sınırı bilinmiyor"] };
  if (filterObj.include?.length) {
    const labels = filterObj.include.map(x => norm(x.label || x));
    if (!labels.includes(have)) return { match: false, unknown: false, reasons: [`Yaş sınırı ${profileRated} uygun değil`] };
  }
  if (filterObj.exclude?.length) {
    const labels = filterObj.exclude.map(x => norm(x.label || x));
    if (labels.includes(have)) return { match: false, unknown: false, reasons: [`Yaş sınırı ${profileRated} hariç tutuldu`] };
  }
  return { match: true, unknown: false, reasons: [] };
}
function matchAwards(profileAwards, profileNominations, filterObj) {
  if (!filterObj) return { match: true, unknown: false, reasons: [] };
  const awards = (profileAwards || []).map(x => String(x).trim());
  const noms = (profileNominations || []).map(x => String(x).trim());
  const all = new Set([...awards, ...noms]);
  if (!all.size) return { match: true, unknown: true, reasons: ["Ödül bilgisi bilinmiyor"] };
  if (filterObj.include?.length) {
    const matched = filterObj.include.filter(x => x.id != null && all.has(String(x.id)));
    if (matched.length === 0) return { match: false, unknown: false, reasons: [`Ödül eksik: ${filterObj.include.map(x => x.label || x.id).join(", ")}`] };
  }
  return { match: true, unknown: false, reasons: [] };
}

function passesLocalFilters(profile, filters) {
  const imdb = Number(String(profile.imdbRating || "").replace(/[^\d.]/g, "")) || null;
  if (filters.imdbMin > 0 && imdb != null && imdb < filters.imdbMin) return false;
  if (filters.imdbMax < 10 && imdb != null && imdb > filters.imdbMax) return false;
  const minVotes = filters.imdbVotesMin == null ? DEFAULT_MIN_IMDB_VOTES : Number(filters.imdbVotesMin);
  if (minVotes > 0 && imdb != null) {
    const ivRaw = String(profile.imdbVotes || "").replace(/[^\d]/g, "");
    if (ivRaw && Number(ivRaw) < minVotes) return false;
  }
  const year = yearOf(profile) || null;
  if (filters.yearMin != null && year != null && year < filters.yearMin) return false;
  if (filters.yearMax != null && year != null && year > filters.yearMax) return false;
  const runtime = toNum(profile.runtime);
  if (filters.runtimeMin != null && runtime != null && runtime < filters.runtimeMin) return false;
  if (filters.runtimeMax != null && runtime != null && runtime > filters.runtimeMax) return false;
  if (filters.rated && !matchRated(profile.rated, filters.rated).match) return false;
  if (filters.director && !matchIdSet(profile.director_ids, filters.director).match) return false;
  if (filters.writers && !matchIdSet(profile.writers_ids, filters.writers).match) return false;
  if (filters.cast && !matchIdSet(profile.cast_ids, filters.cast).match) return false;
  return true;
}

function evalFilmingLocations(profile, f, metatakeLocations, filmmapLocations) {
  if (!f) return { match: true, unknown: false, reason: null };
  const wdLocs = (profile.filming_locations || []).map(norm);
  const wdCountries = (profile.filming_countries || []).map(norm);
  const fmLocs = (filmmapLocations || []).map(x => norm(x.name || x.city || ""));
  const fmCountries = (filmmapLocations || []).map(x => norm(x.country || ""));
  const mtLocs = (metatakeLocations || []).map(x => norm(x.name || x.city || ""));
  const mtCountries = (metatakeLocations || []).map(x => norm(x.country || ""));
  const allLocs = [...wdLocs, ...fmLocs, ...mtLocs].filter(Boolean);
  const allCountries = [...wdCountries, ...fmCountries, ...mtCountries].filter(Boolean);
  const empty = allLocs.length === 0 && allCountries.length === 0;
  const hasStudio = allLocs.some(x => /studio|stüdyo/.test(x));
  const matches = (x) => {
    const v = norm(x.label || x);
    if (v === "__studio__" || v === "stüdyo") return hasStudio;
    if (allCountries.includes(v)) return true;
    return allLocs.some(loc => loc.includes(v) || v.includes(loc));
  };
  if (f.include?.length) {
    const matched = f.include.filter(x => matches(x));
    if (matched.length === 0) {
      if (empty) return { match: true, unknown: true, reason: "Çekim yeri: bilinmiyor" };
      return { match: false, unknown: false, reason: `Çekim yeri eksik: ${f.include.map(x => x.label || x).join(", ")}` };
    }
  }
  if (f.exclude?.length) {
    const hit = f.exclude.filter(x => matches(x));
    if (hit.length) return { match: false, unknown: false, reason: `Çekim yeri hariç: ${hit.map(x => x.label || x).join(", ")}` };
  }
  return { match: true, unknown: false, reason: null };
}

function evalRange(profile, field, min, max, label, state, strict) {
  if (min == null && max == null) return;
  const v = toNum(profile[field]);
  if (v === null) {
    if (strict) { state.match = false; state.reasons.push(`${label}: bilinmiyor (elendi)`); }
    else { state.unknown = true; state.reasons.push(`${label}: bilinmiyor`); }
    return;
  }
  if ((min != null && v < min) || (max != null && v > max)) {
    state.match = false;
    state.reasons.push(`${label}: ${v} aralık dışı`);
  }
}

function ratioThreshold(x) {
  if (x === 0) return { min: 0, max: 0 };
  if (x === 100) return { min: 100, max: 100 };
  return { min: Math.max(0, x - 20), max: Math.min(100, x + 20) };
}
function evalRatioFilters(profile, filters, state) {
  if (filters.dayRatioMin != null) {
    const t = ratioThreshold(filters.dayRatioMin);
    const v = toNum(profile.day_ratio);
    if (v === null) { state.unknown = true; state.reasons.push("Gündüz oranı: bilinmiyor"); }
    else if (v < t.min || v > t.max) { state.match = false; state.reasons.push(`Gündüz %${v} [${t.min}-${t.max}] dışı`); }
  }
  if (filters.outdoorRatioMin != null) {
    const t = ratioThreshold(filters.outdoorRatioMin);
    const indoor = toNum(profile.indoor_ratio);
    if (indoor === null) { state.unknown = true; state.reasons.push("Dış mekân oranı: bilinmiyor"); }
    else {
      const outdoor = 100 - indoor;
      if (outdoor < t.min || outdoor > t.max) { state.match = false; state.reasons.push(`Dış mekân %${outdoor} [${t.min}-${t.max}] dışı`); }
    }
  }
  if (filters.dialogueDensityMin != null) {
    const t = ratioThreshold(filters.dialogueDensityMin);
    const v = toNum(profile.dialogue_density);
    if (v === null) { state.unknown = true; state.reasons.push("Diyalog yoğunluğu: bilinmiyor"); }
    else if (v < t.min || v > t.max) { state.match = false; state.reasons.push(`Diyalog %${v} [${t.min}-${t.max}] dışı`); }
  }
  if (filters.colorRatioMin != null) {
    const t = ratioThreshold(filters.colorRatioMin);
    const v = toNum(profile.color_ratio);
    if (v === null) { state.unknown = true; state.reasons.push("Renkli oranı: bilinmiyor"); }
    else if (v < t.min || v > t.max) { state.match = false; state.reasons.push(`Renkli %${v} [${t.min}-${t.max}] dışı`); }
  }
}

function getLocationCount(profile, metatakeLocations, filmmapLocations) {
  const exact = toNum(profile.location_count);
  if (exact !== null && exact > 0) return { count: exact, estimated: false, source: "ai" };
  if (profile.location_mode) {
    const mode = String(profile.location_mode).trim().toLowerCase();
    const map = { single: 1, mostly_single: 2, few: 3, many: 6 };
    if (map[mode] !== undefined) return { count: map[mode], estimated: true, source: "ai-mode" };
  }
  const wdCount = (profile.filming_locations || []).length;
  const fmCount = (filmmapLocations || []).length;
  const best = Math.max(wdCount, fmCount);
  if (best > 0) return { count: best, estimated: true, source: "filming" };
  return { count: null, estimated: true, source: null };
}
function evalLocationCount(profile, filters, state, metatakeLocations, filmmapLocations) {
  if (filters.locationMin == null && filters.locationMax == null) return;
  const info = getLocationCount(profile, metatakeLocations, filmmapLocations);
  if (info.count === null) { state.unknown = true; state.reasons.push("Mekân sayısı: bilinmiyor"); return; }
  if (filters.locationMin != null && info.count < filters.locationMin) {
    state.match = false; state.reasons.push(`Mekân sayısı ${info.count} < ${filters.locationMin}`);
  }
  if (filters.locationMax != null && info.count > filters.locationMax) {
    state.match = false; state.reasons.push(`Mekân sayısı ${info.count} > ${filters.locationMax}`);
  }
}

function evaluateFilters(profile, filters, semanticVerdict, metatakeLocations, filmmapLocations) {
  const state = { match: true, reasons: [], unknown: false, conflicts: false };
  if (!passesLocalFilters(profile, filters)) {
    state.match = false;
    state.reasons.push("Kesin filtre uyuşmadı");
    return state;
  }
  const setChecks = [
    ["genres_ids", "genres", "Tür", "genres"],
    ["spoken_languages_ids", "original_language", "Dil", "spoken_languages"],
    ["production_countries_ids", "production_countries", "Ülke", "production_countries"],
    ["story_locations", "story_locations", "Hikâye yeri", null],
    ["story_period", "story_period", "Dönem", null],
    ["story_geography", "story_geography", "Coğrafya", null],
    ["season", "season", "Mevsim", null],
    ["character_traits", "character_traits", "Karakter niteliği", null],
    ["aspect_ratio", "aspect_ratio", "En-boy oranı", null],
    ["narrative_style", "narrative_style", "Anlatım tarzı", null],
    ["production_process", "production_process", "Çekim süreci", null],
    ["sound", "sound", "Ses", null],
    ["reality", "reality", "Gerçeklik", null],
    ["story_dimensions", "story_dimensions", "Hikâye boyutları", null]
  ];
  for (const [profileField, filterField, label, altField] of setChecks) {
    const f = filters[filterField];
    if (!f) continue;
    const alt = altField ? profile[altField] : undefined;
    const res = matchSet(profile[profileField], f, alt);
    if (!res.match) state.match = false;
    if (res.unknown) state.unknown = true;
    if (res.conflict) state.conflicts = true;
    for (const r of res.reasons) state.reasons.push(`${label} ${r}`);
  }
  if (filters.company) {
    const res = matchIdSet(profile.production_companies_ids, filters.company);
    if (!res.match) state.match = false;
    if (res.unknown) state.unknown = true;
  }
  if (filters.keywords) {
    const res = matchIdSet(profile.keywords_ids, filters.keywords);
    if (!res.match) state.match = false;
    if (res.unknown) state.unknown = true;
  }
  if (filters.award) {
    const res = matchAwards(profile.awards_ids, profile.nominated_ids, filters.award);
    if (!res.match) state.match = false;
    if (res.unknown) state.unknown = true;
    for (const r of res.reasons) state.reasons.push(r);
  }
  if (filters.filming_locations) {
    const res = evalFilmingLocations(profile, filters.filming_locations, metatakeLocations, filmmapLocations);
    if (!res.match) state.match = false;
    if (res.unknown) state.unknown = true;
    if (res.reason) state.reasons.push(res.reason);
  }
  evalRatioFilters(profile, filters, state);
  evalLocationCount(profile, filters, state, metatakeLocations, filmmapLocations);
  if (filters.characterDensity) {
    const c = filters.characterDensity;
    const fc = profile.family_content || {};
    evalRange(fc, "main_characters", c.mainMin, c.mainMax, "Ana karakter", state, false);
    evalRange(fc, "supporting_characters", c.supportMin, c.supportMax, "Yan karakter", state, false);
    evalRange(fc, "extras", c.extraMin, c.extraMax, "Figüran", state, false);
  }
  if (semanticVerdict && semanticVerdict.verdict === "no") {
    state.match = false;
    state.reasons.push(semanticVerdict.reason || "Semantik filtre uyuşmadı");
  } else if (semanticVerdict && semanticVerdict.verdict === "unknown") {
    state.unknown = true;
    if (semanticVerdict.reason) state.reasons.push(semanticVerdict.reason);
  }
  return state;
}

async function handleResearchStream(env, body, controller, signal) {
  const enc = new TextEncoder();
  const send = (obj) => controller.enqueue(enc.encode(`data: ${JSON.stringify(obj)}\n\n`));
  try {
    const movies = Array.isArray(body.movies) ? body.movies.slice(0, 10) : [];
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
      if (profile.poster_path === undefined && movie.poster_path) profile.poster_path = movie.poster_path;
      if (!profile.release_date && movie.release_date) profile.release_date = movie.release_date;
      // TMDB discover/search zaten genre_ids döndürür — profile'a hemen merge et.
      const mgInit = Array.isArray(movie.genre_ids) ? movie.genre_ids : [];
      if (mgInit.length) {
        const pgInit = Array.isArray(profile.genres_ids) ? profile.genres_ids : [];
        const combined = new Set([...pgInit.map(String), ...mgInit.map(String)]);
        profile.genres_ids = [...combined].map(x => { const n = Number(x); return Number.isFinite(n) ? n : x; });
      }
      prepared.push({ movie, movieId, profile, fieldRows, staleDeterministic: [], filmmap: null, metatakeLocations: null, metatakeExt: null, dirty: false });
    }

    const needFilmMap = !!(
      filters.filming_locations?.include?.length || filters.filming_locations?.exclude?.length
      || filters.locationMin != null || filters.locationMax != null
    );
    const needMetatakeForNarrative = !!(filters.story_locations?.include?.length || filters.story_locations?.exclude?.length || filters.related_films?.include?.length || filters.related_films?.exclude?.length);
    const needMetatake = needMetatakeForNarrative;
    if (needFilmMap) {
      for (const p of prepared) {
        if (signal?.aborted) return;
        try {
          const fm = await filmmapLocations(env, p.movie, signal);
          p.filmmap = fm.locations || [];
        } catch (e) { console.warn("filmmap fail:", e.message); p.filmmap = []; }
      }
    }
    if (needMetatake) {
      for (const p of prepared) {
        if (signal?.aborted) return;
        try {
          const mt = await metatakeExtended(env, p.movie, signal);
          p.metatakeExt = mt;
          if (mt) {
            if (mt.narrative_setting?.length && (!p.profile.story_locations || !p.profile.story_locations.length)) p.profile.story_locations = mt.narrative_setting;
            if (mt.kindred_films?.length && (!p.profile.related_films || !p.profile.related_films.length)) p.profile.related_films = mt.kindred_films;
            if (mt.awards?.length) { const existing = new Set(p.profile.awards_ids || []); for (const a of mt.awards) existing.add(String(a)); p.profile.awards_ids = [...existing]; }
            if (mt.locations?.length) p.metatakeLocations = mt.locations;
          }
        } catch (e) { console.warn("metatake fail:", e.message); }
      }
    }
    for (const p of prepared) {
      let stale = findStaleFields(p.profile, p.fieldRows, forceRefresh);
      if (forceAll) stale = Object.keys(FIELD_DEFS);
      p.staleDeterministic = stale.filter(f => FIELD_DEFS[f]?.source !== "llm");
    }

    // Zenginleştirme: en fazla 4 eşzamanlı — 10 filmi 5 film kadar hızlı işler.
    const ENRICH_CONCURRENCY = 4;
    for (let i = 0; i < prepared.length; i += ENRICH_CONCURRENCY) {
      if (signal?.aborted) return;
      const group = prepared.slice(i, i + ENRICH_CONCURRENCY);
      await Promise.all(group.map(async (p, j) => {
        if (signal?.aborted) return;
        const idx = i + j;
        send({ type: "step", index: idx, total, title: p.movie.original_title || p.movie.title, stage: p.staleDeterministic.length ? "zenginleştiriliyor" : "önbellekten", fields: p.staleDeterministic.slice(0, 6) });
        try {
          const classic = await enrichClassic(env, p.movie, p.staleDeterministic, signal);
          Object.assign(p.profile, classic.updates);
          const covered = [...classic.covered].filter(f => p.profile[f] !== undefined && p.profile[f] !== null);
          if (covered.length) p.dirty = true;
          await putFieldRows(env, p.movieId, covered, Object.fromEntries(covered.map(f => [f, FIELD_DEFS[f]?.source || "unknown"])));
        } catch (e) { console.warn("enrich fail:", p.movieId, e.message); }
      }));
         }

    // enrichClassic sonrası tekrar merge: her durumda genre_ids TMDB'den gelir ve korunur.
    for (const p of prepared) {
      const mg = Array.isArray(p.movie.genre_ids) ? p.movie.genre_ids : [];
      if (mg.length) {
        const pg = Array.isArray(p.profile.genres_ids) ? p.profile.genres_ids : [];
        const combined = new Set([...pg.map(String), ...mg.map(String)]);
        p.profile.genres_ids = [...combined].map(x => { const n = Number(x); return Number.isFinite(n) ? n : x; });
      }
    }

    const needWiki = !!(
      filters.original_work?.include?.length || filters.original_work?.exclude?.length
      || filters.filming_locations?.include?.length || filters.filming_locations?.exclude?.length
      || filters.award?.include?.length || filters.award?.exclude?.length
    );
    if (needWiki) {
      const wikiNeeded = prepared.filter(p => ["original_work", "filming_locations", "filming_countries", "awards_ids", "nominated_ids"].some(f => p.staleDeterministic.includes(f)));
      if (wikiNeeded.length) {
        const wikiResults = await wikidataBatch(env, wikiNeeded.map(p => p.movie), signal);
        for (const p of wikiNeeded) {
          const rec = wikiResults.get(String(p.movie.id));
          if (!rec) continue;
          const covered = [];
          if (rec.originalWork) { p.profile.original_work = rec.originalWork; covered.push("original_work"); }
          if (rec.filmingLocations?.length) { p.profile.filming_locations = rec.filmingLocations; covered.push("filming_locations"); }
          if (rec.filmingCountries?.length) { p.profile.filming_countries = rec.filmingCountries; covered.push("filming_countries"); }
          if (rec.awards?.length) { p.profile.awards_ids = rec.awards; covered.push("awards_ids"); }
          if (rec.nominations?.length) { p.profile.nominated_ids = rec.nominations; covered.push("nominated_ids"); }
          if (covered.length) p.dirty = true;
          await putFieldRows(env, p.movieId, covered, Object.fromEntries(covered.map(f => [f, "wikidata"])));
        }
      }
    }

    const afterLocal = prepared.filter(p => passesLocalFilters(p.profile, filters));

    const stage2bFields = (() => {
      const fields = new Set(ratioFieldsNeeded(filters));
      for (const f of locationFieldsNeeded(filters)) fields.add(f);
      if (filters.story_locations && (filters.story_locations.include?.length || filters.story_locations.exclude?.length)) {
        if (afterLocal.some(p => !p.profile.story_locations || !p.profile.story_locations.length)) fields.add("story_locations");
      }
      if (filters.related_films && (filters.related_films.include?.length || filters.related_films.exclude?.length)) {
        if (afterLocal.some(p => !p.profile.related_films || !p.profile.related_films.length)) fields.add("related_films");
      }
      return Array.from(fields);
    })();
    const useStage2b = settings.useAI && stage2bFields.length > 0;
    const useStage1 = settings.useAI && hasSemanticFilters(filters) && !useStage2b;
    const stage1UseSearch = settings.useWebResearch;
    let semanticVerdicts = new Map();
    let stage1Error = null;

    if (useStage2b) {
      send({ type: "step", index: 0, total: afterLocal.length, title: "Oransal/semantik alanlar dolduruluyor", stage: "sınıflandırılıyor", fields: stage2bFields.slice(0, 6) });
      const needMap = new Map();
      for (const p of afterLocal) {
        const stale = findStaleFields(p.profile, p.fieldRows || [], forceRefresh);
        const need = stage2bFields.filter(f => !p.profile[f] || (Array.isArray(p.profile[f]) && p.profile[f].length === 0) || (FIELD_DEFS[f]?.source === "llm" && stale.includes(f)));
        if (need.length) needMap.set(p.movieId, need);
      }
      if (needMap.size > 0 && !signal?.aborted) {
        const batchMovies = afterLocal.filter(p => needMap.has(p.movieId)).map(p => p.movie);
        const allFields = [...new Set([].concat(...[...needMap.values()]))];
        const results = await fillDetailsBatch(env, batchMovies, allFields, signal, { method: "stage2" });
        for (const p of afterLocal) {
          if (signal?.aborted) break;
          const updates = results.get(String(p.movie.id)) || {};
          if (!Object.keys(updates).length) continue;
          Object.assign(p.profile, updates);
          const covered = Object.keys(updates).filter(f => p.profile[f] !== undefined && p.profile[f] !== null);
          if (covered.length) p.dirty = true;
          await putFieldRows(env, p.movieId, covered, Object.fromEntries(covered.map(f => [f, "llm"])));
        }
      }
    } else if (useStage1 && afterLocal.length) {
      send({ type: "step", index: 0, total: afterLocal.length, title: "Semantik filtre uygulanıyor", stage: "sınıflandırılıyor", fields: [] });
      const signature = semanticSignature(filters);
      const cacheMisses = [];
      for (const p of afterLocal) {
        const cached = await getVerdict(env, p.movieId, signature);
        if (cached && cached.verdict !== "unknown") semanticVerdicts.set(p.movieId, cached);
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
              const verdicts = await classifyBatch(env, chunk.map(p => p.movie), sentence, context, stage1UseSearch, signal, { movie_id: chunk[0].movieId });
              for (const p of chunk) {
                const v = verdicts.get(String(p.movie.id)) || { verdict: "unknown", reason: "LLM yanıt vermedi" };
                semanticVerdicts.set(p.movieId, v);
                if (v.verdict !== "unknown") await putVerdict(env, p.movieId, signature, v.verdict, v.reason);
              }
            } catch (e) {
              console.warn("stage1 chunk:", e.message);
              stage1Error = e.message;
              for (const p of chunk) if (!semanticVerdicts.has(p.movieId)) semanticVerdicts.set(p.movieId, { verdict: "unknown", reason: "LLM başarısız" });
            }
          }
        } catch (e) { console.warn("stage1 fail:", e.message); stage1Error = e.message; }
      }
    }

    const movieIds = afterLocal.map(p => p.movieId);
    const listsMap = await getMovieLists(env, movieIds);

    const results = [];
    for (const p of afterLocal) {
      const verdict = semanticVerdicts.get(p.movieId) || null;
      const evalResult = evaluateFilters(p.profile, filters, verdict, p.metatakeLocations, p.filmmap);
      if (p.dirty || p.staleDeterministic.length) await putProfileRow(env, p.movieId, p.movie.title, yearOf(p.movie), p.profile, forceRefresh);
      const movieLists = listsMap.get(p.movieId) || [];
      const locInfo = getLocationCount(p.profile, p.metatakeLocations, p.filmmap);
      const result = {
        id: p.movie.id, ...p.movie, ...p.profile,
        filter_match: evalResult.match, filter_reasons: evalResult.reasons,
        unknown: evalResult.unknown, conflicts: evalResult.conflicts,
        semantic_used: useStage1,
        semantic_ok: useStage1 && !!verdict && verdict.verdict !== "unknown",
        stage1_error: stage1Error,
        stage2b_used: useStage2b,
        web_used: (useStage1 || useStage2b) && stage1UseSearch,
        web_ok: false,
        ai_model_used: useStage1 || useStage2b ? "Gemini 3.x Flash / Groq GPT-OSS" : null,
        location_count: locInfo.count,
        location_count_estimated: locInfo.estimated,
        location_count_source: locInfo.source,
        movie_lists: movieLists,
        _fromCache: p.staleDeterministic.length === 0
      };
      for (const f of ["director","writers","cast","producers","actors"]) {
        if (result[f] !== undefined) result[f] = sanitizePeopleField(result[f]);
      }
      results.push(result);
      send({ type: "movie", index: results.length - 1, total, movie: result });
    }
    send({ type: "done", movies: results });
  } catch (err) {
    console.error("handleResearchStream fatal:", err);
    try { controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify({ type: "error", message: String(err.message || err) })}\n\n`)); } catch {}
  } finally { try { controller.close(); } catch {} }
}

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
  if (profile.poster_path === undefined && movie.poster_path) profile.poster_path = movie.poster_path;
  if (!profile.release_date && movie.release_date) profile.release_date = movie.release_date;
  if (Array.isArray(movie.genre_ids) && movie.genre_ids.length) {
    const pg = Array.isArray(profile.genres_ids) ? profile.genres_ids : [];
    const combined = new Set([...pg.map(String), ...movie.genre_ids.map(String)]);
    profile.genres_ids = [...combined].map(x => { const n = Number(x); return Number.isFinite(n) ? n : x; });
  }

  const fmCache = await getFilmmapCache(env, movieId);
  const mtCache = await getMetatakeExtendedCache(env, movieId);
  let metatakeLocations = null;
  let filmmapLocationsList = fmCache || [];
  let mt = mtCache;
  if (!fmCache || !mtCache) {
    const tasks = [];
    if (!fmCache) tasks.push(filmmapLocations(env, movie, signal).catch(e => { console.warn("filmmap details:", e.message); return { locations: [] }; }));
    else tasks.push(Promise.resolve({ locations: fmCache }));
    if (!mtCache) tasks.push(metatakeExtended(env, movie, signal).catch(e => { console.warn("metatake details:", e.message); return null; }));
    else tasks.push(Promise.resolve(mtCache));
    const [fmRes, mtRes] = await Promise.all(tasks);
    filmmapLocationsList = fmRes?.locations || filmmapLocationsList;
    mt = mtRes || mt;
  }
  if (mt) {
    if (mt.narrative_setting?.length && (!profile.story_locations || !profile.story_locations.length)) profile.story_locations = mt.narrative_setting;
    if (mt.kindred_films?.length && (!profile.related_films || !profile.related_films.length)) profile.related_films = mt.kindred_films;
    if (mt.awards?.length) { const existingAwards = new Set(profile.awards_ids || []); for (const a of mt.awards) existingAwards.add(String(a)); profile.awards_ids = [...existingAwards]; }
    if (mt.locations?.length) metatakeLocations = mt.locations;
  }
  const stale = findStaleFields(profile, fieldRows, forceAll);
  const staleDet = stale.filter(f => FIELD_DEFS[f]?.source !== "llm");
  const staleLLM = stale.filter(f => FIELD_DEFS[f]?.source === "llm");
  let dirty = false;
  if (staleDet.length) {
    const classic = await enrichClassic(env, movie, staleDet, signal);
    Object.assign(profile, classic.updates);
    const covered = [...classic.covered].filter(f => profile[f] !== undefined && profile[f] !== null);
    if (covered.length) dirty = true;
    await putFieldRows(env, movieId, covered, Object.fromEntries(covered.map(f => [f, FIELD_DEFS[f]?.source || "unknown"])));
  }
  if (Array.isArray(movie.genre_ids) && movie.genre_ids.length) {
    const pg = Array.isArray(profile.genres_ids) ? profile.genres_ids : [];
    const combined = new Set([...pg.map(String), ...movie.genre_ids.map(String)]);
    profile.genres_ids = [...combined].map(x => { const n = Number(x); return Number.isFinite(n) ? n : x; });
  }
  if (staleLLM.length) {
    try {
      const updates = await fillDetails(env, movie, staleLLM, signal, { movie_id: movieId });
      Object.assign(profile, updates);
      const covered = Object.keys(updates).filter(f => profile[f] !== undefined && profile[f] !== null);
      if (covered.length) dirty = true;
      await putFieldRows(env, movieId, covered, Object.fromEntries(covered.map(f => [f, "llm"])));
    } catch (e) { console.warn("stage2 details fail:", e.message); }
  }
  if (dirty || forceAll) await putProfileRow(env, movieId, movie.title, yearOf(movie), profile, forceAll);
  const merged = { ...movie, ...profile };
  for (const f of ["director","writers","cast","producers","actors"]) {
    if (merged[f] !== undefined) merged[f] = sanitizePeopleField(merged[f]);
  }
  const locInfo = getLocationCount(profile, metatakeLocations, filmmapLocationsList);
  merged.location_count = locInfo.count;
  merged.location_count_estimated = locInfo.estimated;
  merged.location_count_source = locInfo.source;
  return { movie: merged };
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

async function getAllConfig(env) {
  const obj = { ...DEFAULT_FILTER_INFO };
  if (!env.DB) return obj;
  try {
    const { results } = await env.DB.prepare("SELECT key, value FROM app_config ORDER BY key").all();
    for (const r of results || []) obj[r.key] = r.value;
    return obj;
  } catch (e) { console.warn("config read all:", e.message); return obj; }
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
    const { results } = await env.DB.prepare("SELECT provider, key_index, model, until_ts, reason FROM dead_keys WHERE until_ts > ? ORDER BY provider, key_index").bind(now).all();
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
async function getAllStaticOptions(env) {
  if (!env.DB) return {};
  try {
    const { results } = await env.DB.prepare("SELECT field, id, label, extra_json, sort_order FROM static_options ORDER BY field, sort_order, label").all();
    const byField = {};
    for (const r of results || []) {
      if (!byField[r.field]) byField[r.field] = [];
      byField[r.field].push({ id: r.id, label: r.label, extra: safeJSON(r.extra_json, null) });
    }
    return byField;
  } catch { return {}; }
}
async function getMovieLists(env, movieIds) {
  if (!env.DB || !movieIds.length) return new Map();
  try {
    const placeholders = movieIds.map(() => "?").join(",");
    const { results } = await env.DB.prepare(
      `SELECT movie_id, list_name, position FROM movie_lists WHERE movie_id IN (${placeholders})`
    ).bind(...movieIds).all();
    const byId = new Map();
    for (const r of results || []) {
      if (!byId.has(r.movie_id)) byId.set(r.movie_id, []);
      byId.get(r.movie_id).push({ name: r.list_name, position: r.position });
    }
    return byId;
  } catch { return new Map(); }
}

async function tmdbRoute(env, url, signal) {
  const path = url.pathname.replace(/^\/tmdb/, "");
  if (path === "/genre/movie/list") return tmdb(env, path, { language: url.searchParams.get("language") || "tr-TR" }, signal);
  if (path === "/configuration/languages") return tmdb(env, path, {}, signal);
  if (path === "/configuration/countries") return tmdb(env, path, { language: url.searchParams.get("language") || "tr-TR" }, signal);
  if (path === "/search/movie") return tmdb(env, path, { query: url.searchParams.get("query") || "", language: url.searchParams.get("language") || "tr-TR", page: url.searchParams.get("page") || 1, include_adult: "false" }, signal);
  if (path === "/search/person") return tmdb(env, path, { query: url.searchParams.get("query") || "", language: url.searchParams.get("language") || "tr-TR", page: url.searchParams.get("page") || 1, include_adult: "false" }, signal);
  if (path === "/search/company") return tmdb(env, path, { query: url.searchParams.get("query") || "", page: url.searchParams.get("page") || 1 }, signal);
  if (path === "/search/keyword") return tmdb(env, path, { query: url.searchParams.get("query") || "", page: url.searchParams.get("page") || 1 }, signal);
  if (path === "/person/popular") return tmdb(env, path, { language: url.searchParams.get("language") || "tr-TR", page: url.searchParams.get("page") || 1 }, signal);
  if (path === "/discover/movie") {
    const allowed = ["language","sort_by","vote_average.gte","vote_average.lte","vote_count.gte","page","primary_release_date.gte","primary_release_date.lte","with_genres","without_genres","with_original_language","with_origin_country","with_runtime.gte","with_runtime.lte","with_text_query","with_companies","with_keywords","without_companies","without_keywords"];
    const params = {};
    for (const k of allowed) if (url.searchParams.has(k)) params[k] = url.searchParams.get(k);
    return tmdb(env, path, params, signal);
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
        geminiModel: env.GEMINI_MODEL || GEMINI_MODEL_DEFAULT, geminiModels: buildGeminiChain(env),
        groqModel: env.GROQ_MODEL || GROQ_MODEL_DEFAULT, groqModels: buildGroqChain(env),
        tmdb: !!env.TMDB_API_KEY, omdb: !!env.OMDB_API_KEY, tavily: !!env.TAVILY_API_KEY,
        groqKeys: [!!env.GROQ_API_KEY_1, !!env.GROQ_API_KEY_2, !!env.GROQ_API_KEY_3],
        geminiKeys: [!!env.GEMINI_API_KEY_1, !!env.GEMINI_API_KEY_2, !!env.GEMINI_API_KEY_3],
        adminToken: !!env.ADMIN_TOKEN,
        metatake: true, filmmap: true, staticOptions: true,
        d1: !!env.DB,
        defaultMinImdbVotes: DEFAULT_MIN_IMDB_VOTES
      });
    }
    if (url.pathname === "/static/options" && request.method === "GET") {
      return response({ options: await getAllStaticOptions(env) });
    }
    if (url.pathname === "/metatake/locations" && request.method === "GET") {
      const movieId = url.searchParams.get("movie_id") || "";
      const title = url.searchParams.get("title") || "";
      if (!movieId && !title) return jsonError("movie_id veya title gerekli.", 400);
      const movie = { id: movieId, title, original_title: title };
      const mt = await metatakeExtended(env, movie, request.signal);
      return response({ locations: mt?.locations || [], confidence: mt?.confidence ?? null });
    }
    if (url.pathname === "/filmmap/locations" && request.method === "GET") {
      const movieId = url.searchParams.get("movie_id") || "";
      const title = url.searchParams.get("title") || "";
      if (!movieId && !title) return jsonError("movie_id veya title gerekli.", 400);
      const movie = { id: movieId, title, original_title: title };
      const fm = await filmmapLocations(env, movie, request.signal);
      return response({ locations: fm.locations || [], fromCache: fm.fromCache });
    }
    if (url.pathname === "/movie/lists" && request.method === "POST") {
      let body; try { body = await request.json(); } catch { return jsonError("Geçersiz JSON.", 400); }
      const ids = Array.isArray(body.movie_ids) ? body.movie_ids.map(String) : [];
      const lists = await getMovieLists(env, ids);
      const obj = {};
      for (const [k, v] of lists) obj[k] = v;
      return response({ lists: obj });
    }
    if (url.pathname === "/admin/ping" && request.method === "GET") {
      if (!isAdmin(request, env)) return jsonError("Yetkisiz.", 401);
      return response({ ok: true });
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
    if (url.pathname === "/admin/stats" && request.method === "GET") {
      if (!isAdmin(request, env)) return jsonError("Yetkisiz.", 401);
      return response({ stats: await getLlmStats(env), deadKeys: await getActiveDeadKeys(env) });
    }
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
      const enc = new TextEncoder();
      const heartbeatTimer = setInterval(() => {
        try { writer.write(enc.encode(": ping\n\n")); }
        catch { clearInterval(heartbeatTimer); }
      }, 15000);
      const task = handleResearchStream(env, body, controller, request.signal)
        .catch(err => {
          try { controller.enqueue(enc.encode(`data: ${JSON.stringify({ type: "error", message: String(err.message || err) })}\n\n`)); } catch {}
          try { controller.close(); } catch {}
        })
        .finally(() => clearInterval(heartbeatTimer));
      if (ctx?.waitUntil) ctx.waitUntil(task);
      return new Response(readable, {
        headers: {
          ...CORS,
          "Content-Type": "text/event-stream; charset=utf-8",
          "Cache-Control": "no-cache, no-transform",
          "X-Accel-Buffering": "no"
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
