import { FIELD_DEFS, LLM_FIELDS, FIELD_RULES, SEMANTIC_FIELDS } from "./fields.config.js";

const GROQ_MODEL_CHAIN = ["openai/gpt-oss-120b", "openai/gpt-oss-20b"];
const GROQ_MODEL_DEFAULT = "openai/gpt-oss-120b";
const GEMINI_MODEL_CHAIN = ["gemini-3.8-flash", "gemini-3.7-flash", "gemini-3.6-flash", "gemini-3.5-flash-lite", "gemini-3.1-flash-lite"];
const GEMINI_MODEL_DEFAULT = "gemini-3.8-flash";
const GROQ_BASE = "https://api.groq.com/openai/v1";
const GOOGLE_INTERACTIONS = "https://generativelanguage.googleapis.com/v1beta/interactions";
const GOOGLE_GENERATE = "https://generativelanguage.googleapis.com/v1beta/models";
const TMDB_BASE = "https://api.themoviedb.org/3";
const METATAKE_BASE = "https://metatake.net/api/v1";
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
  "Yanıt YALNIZCA: [{'id': <film_id>, 'match': 'yes'|'no'|'unknown', 'reason': '<max 12 kelime>'}]"
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
  "Yanıt YALNIZCA: [{'id': <film_id>, '<alan>': <değer>}]"
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
  const looksLikeId = (s) => typeof s === "string" && (/^nm\d+$/i.test(s.trim()) || /^\d{4,}$/.test(s.trim()));
  return val.some(v => {
    if (v == null) return true;
    if (typeof v === "string") return looksLikeId(v);
    if (typeof v === "number") return true;
    if (typeof v === "object" && typeof v.name === "string") return looksLikeId(v.name);
    return true;
  });
}

function findStaleFields(profile, fieldRows, forceRefresh) {
  const now = Math.floor(Date.now() / 1000);
  const fetched = new Map(fieldRows.map(r => [r.field, Number(r.fetched_at)]));
  const stale = [];
  const detailFields = new Set(["writers", "writers_ids", "cast", "cast_ids", "director", "director_ids", "producers", "actors", "omdb_directors"]);
  for (const [field, def] of Object.entries(FIELD_DEFS)) {
    const hasValue = profile[field] !== undefined && profile[field] !== null;
    const badData = hasValue && detailFields.has(field) && isBadDetailArray(profile[field]);
    if (!hasValue || badData) { stale.push(field); continue; }
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
async function getStaticOptions(env, field) {
  if (!env.DB) return [];
  try {
    const { results } = await env.DB.prepare("SELECT id, label, extra_json FROM static_options WHERE field = ? ORDER BY sort_order, label").bind(field).all();
    return results || [];
  } catch { return []; }
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
    headers: { "Accept": "application/sparql-results+json", "User-Agent": "FilmKesifMotoru/1.0" }
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
  try { return await wikidataBatchOnce(env, movies, 30000, outerSignal); }
  catch (e) { console.warn("wikidata batch:", e.message); return new Map(); }
}

async function metatakeLocations(env, movie, outerSignal) {
  const movieId = movieKey(movie);
  const cached = await getMetatakeCache(env, movieId);
  if (cached) return { locations: cached, fromCache: true };
  const title = movie.original_title || movie.title || "";
  if (!title) return { locations: [], fromCache: false };
  const headers = { "Accept": "application/json", "User-Agent": "FilmKesifMotoru/1.0" };
  if (env.METATAKE_API_KEY) headers["Authorization"] = `Bearer ${env.METATAKE_API_KEY}`;
  try {
    const url = `${METATAKE_BASE}/movies?title=${encodeURIComponent(title)}&limit=5`;
    const data = await fetchJSON(url, { headers }, "Metatake", 15000, outerSignal);
    const list = Array.isArray(data) ? data : (data.data || data.movies || []);
    const locations = [];
    for (const m of list.slice(0, 3)) {
      const filmLocations = m.filming_locations || m.locations || [];
      for (const loc of filmLocations) {
        const name = loc.name || loc.location || loc.country || "";
        if (!name) continue;
        locations.push({
          name: String(name),
          country: String(loc.country || "").trim(),
          city: String(loc.city || "").trim(),
          lat: loc.latitude != null ? Number(loc.latitude) : null,
          lng: loc.longitude != null ? Number(loc.longitude) : null
        });
      }
    }
    const seen = new Set(); const unique = [];
    for (const loc of locations) {
      const key = `${norm(loc.name)}|${norm(loc.country)}`;
      if (seen.has(key)) continue;
      seen.add(key); unique.push(loc);
    }
    await putMetatakeCache(env, movieId, unique.slice(0, 20));
    return { locations: unique.slice(0, 20), fromCache: false };
  } catch (e) {
    console.warn("metatake:", e.message);
    return { locations: [], fromCache: false, error: e.message };
  }
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
  if (/HTTP 429|rate.?limit|quota|exceeded/i.test(msg)) return { type: "ratelimit", cooldown: null, modelWide: false };
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
    body: JSON.stringify({ model, input: prompt, generationConfig: { thinkingConfig: { thinkingBudget: 0 } } })
  }, `Gemini Interactions ${model}`, 10000, outerSignal);
  const text = extractGeminiText(data);
  if (!text) throw new Error(`Gemini Interactions ${model} yanıtında metin yok.`);
  return text;
}
async function callGeminiGenerate(env, key, model, prompt, outerSignal) {
  const url = `${GOOGLE_GENERATE}/${encodeURIComponent(model)}:generateContent`;
  const data = await fetchJSON(url, {
    method: "POST", headers: { "Content-Type": "application/json", "x-goog-api-key": key },
    body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { thinkingConfig: { thinkingBudget: 0 } } })
  }, `Gemini generateContent ${model}`, 8000, outerSignal);
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
    errors.push(`interactions: ${msg}`);
    if (cls.type === "invalid" || cls.type === "model_down") throw e;
    if (cls.type === "ratelimit") throw e;
  }
  try {
    return await callGeminiGenerate(env, key, model, prompt, outerSignal);
  } catch (e) {
    const msg = String(e.message || e);
    errors.push(`generateContent: ${msg}`);
    throw new Error(errors.join(" | "));
  }
}

async function callGroq(env, key, model, prompt, maxOutputTokens, useSearch, outerSignal) {
  const promptTokens = estimateTokens(prompt);
  const safeOutput = Math.max(256, Math.min(maxOutputTokens, GROQ_TPM_BUDGET - promptTokens));
  const body = { model, messages: [{ role: "user", content: prompt }], temperature: 0.2, max_completion_tokens: safeOutput };
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
    console.warn(`groq: search başarısız, no-search denenecek — ${msg}`);
    return await callGroq(env, key, model, prompt, maxOutputTokens, false, outerSignal);
  }
}

async function callLLMWithFallback(env, prompt, maxOutputTokens, useSearch, outerSignal, context = {}) {
  const deadline = Date.now() + LLM_DEADLINE_MS;
  const errors = [];
  const promptLen = estimateTokens(prompt);
  const dead = await loadDeadKeys(env);
  const nowSec = () => Math.floor(Date.now() / 1000);
  const hasSemantic = context.hasSemantic === true;

  const geminiKeys = [env.GEMINI_API_KEY_1, env.GEMINI_API_KEY_2, env.GEMINI_API_KEY_3].map((k, i) => ({ key: k, index: i + 1 })).filter(x => x.key);
  const rotatedG = rotateKeys(geminiKeys, geminiRR++);
  const geminiModels = orderGeminiModels(buildGeminiChain(env), promptLen, hasSemantic);
  let geminiTried = false;

  for (const model of geminiModels) {
    if (Date.now() > deadline) break;
    let modelWideIssue = false;
    for (const { key, index } of rotatedG) {
      if (modelWideIssue || dead.gemini.has(index)) continue;
      if (Date.now() > deadline) break;
      if (outerSignal?.aborted) throw new Error("İstemci isteği iptal etti.");
      geminiTried = true;
      const start = Date.now();
      try {
        const result = await callGeminiModel(env, key, model, prompt, outerSignal);
        logLlmCall(env, "gemini", model, index, true, Date.now() - start, null, { ...context, method: context.method || "unknown" });
        return result;
      } catch (e) {
        const msg = String(e.message || e);
        const cls = classifyError(msg);
        logLlmCall(env, "gemini", model, index, false, Date.now() - start, msg.slice(0, 200), context);
        errors.push(`gemini ${model} key=${index}: ${msg}`);
        console.warn(`gemini: model=${model} key=${index} type=${cls.type} — ${msg.slice(0, 200)}`);
        if (cls.modelWide) { modelWideIssue = true; errors.push(`[${model} ${cls.type} model-wide]`); }
        else if (cls.type === "ratelimit") { await markDeadKey(env, "gemini", index, nowSec() + (e.retryAfterMs ? Math.ceil(e.retryAfterMs / 1000) : 300), msg.slice(0, 200)); }
        else if (cls.cooldown) { await markDeadKey(env, "gemini", index, nowSec() + cls.cooldown, msg.slice(0, 200)); }
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
          logLlmCall(env, "groq", model, index, true, Date.now() - start, null, context);
          return result;
        } catch (e) {
          const msg = String(e.message || e);
          const cls = classifyError(msg);
          logLlmCall(env, "groq", model, index, false, Date.now() - start, msg.slice(0, 200), context);
          errors.push(`groq ${model} key=${index}: ${msg}`);
          console.warn(`groq: model=${model} key=${index} type=${cls.type} — ${msg.slice(0, 200)}`);
          if (cls.type === "ratelimit") await markDeadKey(env, "groq", index, nowSec() + (e.retryAfterMs ? Math.ceil(e.retryAfterMs / 1000) : 300), msg.slice(0, 200));
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
// ============ FilmMap cache (birincil çekim yeri) ============
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

// ============ Metatake extended cache (narrative_setting, kindred, awards, confidence) ============
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

// ============ FilmMap API (moviescenemap.com — CC0, anahtarsız) ============
async function filmmapLocations(env, movie, outerSignal) {
  const movieId = movieKey(movie);
  const cached = await getFilmmapCache(env, movieId);
  if (cached) return { locations: cached, fromCache: true };
  const title = movie.original_title || movie.title || "";
  if (!title) return { locations: [], fromCache: false };
  try {
    const body = {
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: { name: "where_was_it_filmed", arguments: { title, limit: 100 } }
    };
    const signal = combineSignals(outerSignal, 15000);
    const res = await fetch("https://moviescenemap.com/mcp", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Accept": "application/json, text/event-stream" },
      body: JSON.stringify(body),
      signal
    });
    if (!res.ok) return { locations: [], fromCache: false, error: `HTTP ${res.status}` };
    const raw = await res.text();
    let data = safeJSON(raw, null);
    if (!data) {
      const lines = raw.split(/\r?\n/).filter(l => l.startsWith("data: "));
      for (const l of lines) {
        const parsed = safeJSON(l.slice(6), null);
        if (parsed) { data = parsed; break; }
      }
    }
    if (!data) return { locations: [], fromCache: false, error: "parse fail" };
    if (data.error) return { locations: [], fromCache: false, error: data.error.message || "rpc error" };
    let payload = null;
    const content = data?.result?.content;
    if (Array.isArray(content)) {
      for (const c of content) {
        if (c?.type === "text" && typeof c.text === "string") {
          const arr = safeJSON(c.text, null);
          if (arr) { payload = arr; break; }
        }
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

// ============ Metatake extended API ============
async function metatakeExtended(env, movie, outerSignal) {
  const movieId = movieKey(movie);
  const cached = await getMetatakeExtendedCache(env, movieId);
  if (cached) return cached;
  const title = movie.original_title || movie.title || "";
  if (!title) return null;
  const headers = { "Accept": "application/json", "User-Agent": "FilmKesifMotoru/1.0" };
  try {
    const searchUrl = `https://metatake.net/api/v1/films?q=${encodeURIComponent(title)}&limit=5`;
    const searchData = await fetchJSON(searchUrl, { headers }, "Metatake search", 15000, outerSignal);
    const films = Array.isArray(searchData?.films) ? searchData.films : [];
    if (!films.length) return null;
    const year = yearOf(movie);
    const match = (year && films.find(f => Number(f.year) === Number(year))) || films[0];
    const slug = match.slug;
    if (!slug) return null;

    let film = null;
    try {
      const filmUrl = `https://metatake.net/api/v1/films/${encodeURIComponent(slug)}`;
      film = await fetchJSON(filmUrl, { headers }, "Metatake film", 15000, outerSignal);
    } catch (e) { console.warn("metatake film:", e.message); }

    let locations = [];
    try {
      const locUrl = `https://metatake.net/api/v1/locations?film=${encodeURIComponent(slug)}&limit=100`;
      const locData = await fetchJSON(locUrl, { headers }, "Metatake locations", 15000, outerSignal);
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

    const kindred = Array.isArray(film?.kindred)
      ? film.kindred.map(k => ({ title: String(k.title || "").trim(), year: k.year != null ? Number(k.year) : null, slug: k.slug || null })).filter(k => k.title)
      : [];

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
  } catch (e) {
    console.warn("metatake extended:", e.message);
    return null;
  }
      }

// ============ JSON / signature ============
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
function ratioSignature(filters) {
  const f = filters || {};
  const active = {};
  if (f.dayRatioMin != null) active.dayRatioMin = f.dayRatioMin;
  if (f.outdoorRatioMin != null) active.outdoorRatioMin = f.outdoorRatioMin;
  if (f.dialogueDensityMin != null) active.dialogueDensityMin = f.dialogueDensityMin;
  if (f.colorRatioMin != null) active.colorRatioMin = f.colorRatioMin;
  if (f.locationMode) active.locationMode = f.locationMode;
  const sorted = Object.keys(active).sort().reduce((o, k) => { o[k] = active[k]; return o; }, {});
  return simpleHash(JSON.stringify(sorted));
}
function hasRatioFilters(filters) {
  return ratioSignature(filters) !== simpleHash("{}");
}
function ratioFieldsNeeded(filters) {
  const f = filters || {};
  const fields = [];
  if (f.dayRatioMin != null) fields.push("day_ratio");
  if (f.outdoorRatioMin != null) fields.push("indoor_ratio");
  if (f.dialogueDensityMin != null) fields.push("dialogue_density");
  if (f.colorRatioMin != null) fields.push("color_ratio");
  if (f.locationMode) fields.push("location_mode");
  return fields;
}

// ============ Stage 1 (verdict) ============
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
  const raw = await callLLMWithFallback(env, prompt, 800, useSearch, signal, { ...context, method: "stage1", hasSemantic: true });
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

// ============ Stage 2b (alan doldurma) ============
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
    else rules.push(`${f}: uygun değer`);
  }
  return rules.join("\n");
}
async function fillDetails(env, movie, staleLLMFields, signal, context = {}) {
  if (!staleLLMFields.length) return {};
  const template = await getPromptTemplate(env, "prompt_template.stage2");
  const moviePayload = [{ id: movie.id, title: movie.title, original_title: movie.original_title, year: yearOf(movie), overview: (movie.overview || "").slice(0, 500) }];
  const rules = buildStage2Rules(staleLLMFields);
  const prompt = template
    .replace(/\{\{MOVIES\}\}/g, JSON.stringify(moviePayload))
    .replace(/\{\{RULES\}\}/g, rules);
  const raw = await callLLMWithFallback(env, prompt, 1500, false, signal, { ...context, method: "stage2", hasSemantic: true });
  const arr = extractJSONArray(raw) || (() => { try { const o = extractJSON(raw); return o.movies || []; } catch { return []; } })();
  const item = arr[0] || {};
  const updates = {};
  for (const f of staleLLMFields) if (item[f] !== undefined && item[f] !== null) updates[f] = item[f];
  return updates;
}

// ============ Deterministik zenginleştirme (TMDB + OMDb) ============
async function enrichClassic(env, movie, staleFields, outerSignal) {
  const need = new Set(staleFields);
  const updates = {};
  const covered = new Set();
  if (movie.id) {
    try {
      const detail = await tmdb(env, `/movie/${movie.id}`, { language: "tr-TR", append_to_response: "credits,images", include_image_language: "en,null" }, outerSignal);
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
      const companies = Array.isArray(detail.production_companies) ? detail.production_companies : [];
      if (need.has("production_companies")) { updates.production_companies = companies.map(c => c.name); covered.add("production_companies"); }
      if (need.has("production_companies_ids")) { updates.production_companies_ids = companies.map(c => c.id); covered.add("production_companies_ids"); }
      const posters = detail.images?.posters || [];
      const trPosterPath = detail.poster_path || "";
const originalPoster =
  posters.find(p => p.iso_639_1 === "en" && p.file_path !== trPosterPath) ||
  posters.find(p => !p.iso_639_1 && p.file_path !== trPosterPath) ||
  posters.find(p => p.file_path !== trPosterPath) ||
  null;
      if (need.has("original_poster_path") && originalPoster) { updates.original_poster_path = originalPoster.file_path; covered.add("original_poster_path"); }
      const kw = detail.keywords?.keywords || [];
      if (need.has("keywords")) { updates.keywords = kw.map(k => k.name); covered.add("keywords"); }
      if (need.has("keywords_ids")) { updates.keywords_ids = kw.map(k => k.id); covered.add("keywords_ids"); }
      const credits = detail.credits;
      if (credits) {
        const crew = credits.crew || [];
        if (need.has("director")) { updates.director = crew.filter(c => c.job === "Director").map(c => ({ name: c.name, profile_path: c.profile_path || null })); covered.add("director"); }
        if (need.has("director_ids")) { updates.director_ids = crew.filter(c => c.job === "Director").map(c => c.id); covered.add("director_ids"); }
        if (need.has("writers")) { updates.writers = crew.filter(c => c.department === "Writing" || c.job === "Writer").map(c => ({ name: c.name, profile_path: c.profile_path || null })); covered.add("writers"); }
        if (need.has("writers_ids")) { updates.writers_ids = crew.filter(c => c.department === "Writing" || c.job === "Writer").map(c => c.id); covered.add("writers_ids"); }
        if (need.has("producers")) { updates.producers = crew.filter(c => c.job === "Producer").map(c => ({ name: c.name, profile_path: c.profile_path || null })); covered.add("producers"); }
        if (need.has("cast")) { updates.cast = (credits.cast || []).slice(0, 8).map(c => ({ name: c.name, profile_path: c.profile_path || null, character: c.character || "" })); covered.add("cast"); }
        if (need.has("cast_ids")) { updates.cast_ids = (credits.cast || []).slice(0, 20).map(c => c.id); covered.add("cast_ids"); }
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

// ============ Filtre karşılaştırma yardımcıları ============
function toNum(v) {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "string" && /^n\/?a$/i.test(v.trim())) return null;
  const n = Number(String(v).replace(/[^\d.-]/g, ""));
  return Number.isFinite(n) ? n : null;
}
function matchSet(profileField, filterObj) {
  if (!filterObj) return { match: true, unknown: false, conflict: false, reasons: [] };
  const raw = Array.isArray(profileField) ? profileField.map(norm) : (profileField ? [norm(profileField)] : []);
  const empty = raw.length === 0;
  const reasons = [];
  let match = true, unknown = false, conflict = false;
  const matches = (x) => {
    const v = norm(x.label || x);
    if (raw.includes(v)) return true;
    if (x.id != null && x.id !== "") { if (raw.includes(norm(x.id))) return true; }
    return raw.some(h => h.includes(v) || v.includes(h));
  };
  if (filterObj.include?.length) {
    const missing = filterObj.include.filter(x => !matches(x));
    if (missing.length) {
      if (empty) { unknown = true; reasons.push(`bilinmiyor: ${missing.map(x => x.label || x).join(", ")}`); }
      else { match = false; reasons.push(`eksik: ${missing.map(x => x.label || x).join(", ")}`); }
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
    const missing = filterObj.include.filter(x => x.id == null || !have.includes(String(x.id).trim()));
    if (missing.length) {
      if (have.length === 0) return { match: true, unknown: true, reasons: ["bilinmiyor"] };
      return { match: false, unknown: false, reasons: [`eksik: ${missing.map(x => x.label || x.id).join(", ")}`] };
    }
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
    const missing = filterObj.include.filter(x => x.id == null || !all.has(String(x.id)));
    if (missing.length) return { match: false, unknown: false, reasons: [`Ödül eksik: ${missing.map(x => x.label || x.id).join(", ")}`] };
  }
  return { match: true, unknown: false, reasons: [] };
}

// ============ Lokal kesin filtre (LLM'siz) ============
function passesLocalFilters(profile, filters) {
  const imdb = Number(String(profile.imdbRating || "").replace(/[^\d.]/g, "")) || null;
  if (filters.imdbMin > 0 && imdb != null && imdb < filters.imdbMin) return false;
  if (filters.imdbMax < 10 && imdb != null && imdb > filters.imdbMax) return false;
  if (filters.imdbVotesMin > 0 && imdb != null) {
    const iv = Number(String(profile.imdbVotes || "").replace(/[^\d]/g, ""));
    if (iv && iv < filters.imdbVotesMin) return false;
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

// ============ Çekim yeri (FilmMap + Metatake + Wikidata birleşik) ============
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
    const missing = f.include.filter(x => !matches(x));
    if (missing.length) {
      if (empty) return { match: true, unknown: true, reason: "Çekim yeri: bilinmiyor" };
      return { match: false, unknown: false, reason: `Çekim yeri eksik: ${missing.map(x => x.label || x).join(", ")}` };
    }
  }
  if (f.exclude?.length) {
    const hit = f.exclude.filter(x => matches(x));
    if (hit.length) return { match: false, unknown: false, reason: `Çekim yeri hariç: ${hit.map(x => x.label || x).join(", ")}` };
  }
  return { match: true, unknown: false, reason: null };
}

// ============ Oran filtreleri (%0 ve %100 mutlak) ============
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
function ratioThreshold(min) {
  if (min === 0) return { min: null, max: 0 };
  if (min === 100) return { min: 100, max: null };
  if (min > 0 && min < 20) return { min: 0, max: null };
  return { min: Math.max(0, min - 20), max: null };
}
function evalRatioFilters(profile, filters, state) {
  if (filters.dayRatioMin != null) {
    const t = ratioThreshold(filters.dayRatioMin);
    const v = toNum(profile.day_ratio);
    if (v === null) { state.unknown = true; state.reasons.push("Gündüz oranı: bilinmiyor"); }
    else if (t.max != null && v > t.max) { state.match = false; state.reasons.push(`Gündüz ${v}% > ${t.max}% (tamamı gece isteniyor)`); }
    else if (t.min != null && v < t.min) { state.match = false; state.reasons.push(`Gündüz ${v}% < ${t.min}%`); }
  }
  if (filters.outdoorRatioMin != null) {
    const t = ratioThreshold(filters.outdoorRatioMin);
    const indoor = toNum(profile.indoor_ratio);
    if (indoor === null) { state.unknown = true; state.reasons.push("Dış mekân oranı: bilinmiyor"); }
    else {
      const outdoor = 100 - indoor;
      if (t.max != null && outdoor > t.max) { state.match = false; state.reasons.push(`Dış mekân ${outdoor}% > ${t.max}% (tamamı iç isteniyor)`); }
      else if (t.min != null && outdoor < t.min) { state.match = false; state.reasons.push(`Dış mekân ${outdoor}% < ${t.min}%`); }
    }
  }
  if (filters.dialogueDensityMin != null) {
    const t = ratioThreshold(filters.dialogueDensityMin);
    const v = toNum(profile.dialogue_density);
    if (v === null) { state.unknown = true; state.reasons.push("Diyalog yoğunluğu: bilinmiyor"); }
    else if (t.max != null && v > t.max) { state.match = false; state.reasons.push(`Diyalog ${v}% > ${t.max}%`); }
    else if (t.min != null && v < t.min) { state.match = false; state.reasons.push(`Diyalog ${v}% < ${t.min}%`); }
  }
  if (filters.colorRatioMin != null) {
    const t = ratioThreshold(filters.colorRatioMin);
    const v = toNum(profile.color_ratio);
    if (v === null) { state.unknown = true; state.reasons.push("Renkli oranı: bilinmiyor"); }
    else if (t.max != null && v > t.max) { state.match = false; state.reasons.push(`Renkli ${v}% > ${t.max}%`); }
    else if (t.min != null && v < t.min) { state.match = false; state.reasons.push(`Renkli ${v}% < ${t.min}%`); }
  }
}

// ============ Lokasyon modu (kategorik) ============
function evalLocationMode(profile, filters, state) {
  if (!filters.locationMode) return;
  const wanted = String(filters.locationMode).trim();
  const have = profile.location_mode ? String(profile.location_mode).trim() : "";
  if (!have) {
    state.unknown = true;
    state.reasons.push("Mekân modu: bilinmiyor");
    return;
  }
  if (norm(have) !== norm(wanted)) {
    state.match = false;
    state.reasons.push(`Mekân modu ${have}, istenen ${wanted}`);
  }
}
function classifyCount(n) {
  if (n <= 1) return "single";
  if (n <= 2) return "mostly_single";
  if (n <= 4) return "few";
  return "many";
}
function deriveLocationModeFromSources(profile, metatakeLocations, filmmapLocations, wdLocations) {
  if (profile.location_mode) return { mode: profile.location_mode, estimated: false, source: "llm" };
  const mt = metatakeLocations || [];
  const layerOf = (x) => String(x.layer || x.relation || "").toLowerCase(); 
  if (mt.length) {
const settingCount = mt.filter(l => layerOf(l) === "setting").length;
const filmedCount = mt.filter(l => layerOf(l) !== "setting").length;
    const count = settingCount || filmedCount;
    const avgConf = mt.reduce((s, l) => s + (Number(l.confidence) || 0), 0) / mt.length;
    return { mode: classifyCount(count), estimated: avgConf < 0.7, source: "metatake" };
  }
  const fm = filmmapLocations || [];
if (fm.length) {
  const fmSettings = fm.filter(l => layerOf(l) === "setting").length;
  const count = fmSettings || fm.length;
  return { mode: classifyCount(count), estimated: true, source: "filmmap" };
            }
  const wd = wdLocations || profile.filming_locations || [];
  if (wd.length) return { mode: classifyCount(wd.length), estimated: true, source: "wikidata" };
  return { mode: null, estimated: true, source: null };
}

// ============ Ana değerlendirme ============
function evaluateFilters(profile, filters, semanticVerdict, metatakeLocations, filmmapLocations) {
  const state = { match: true, reasons: [], unknown: false, conflicts: false };
  if (!passesLocalFilters(profile, filters)) {
    state.match = false;
    state.reasons.push("Kesin filtre uyuşmadı");
    return state;
  }
  const setChecks = [
    ["genres_ids", "genres", "Tür"], ["spoken_languages_ids", "original_language", "Dil"],
    ["production_countries_ids", "production_countries", "Ülke"], ["story_locations", "story_locations", "Hikâye yeri"],
    ["story_period", "story_period", "Dönem"], ["story_geography", "story_geography", "Coğrafya"],
    ["season", "season", "Mevsim"], ["character_traits", "character_traits", "Karakter niteliği"],
    ["aspect_ratio", "aspect_ratio", "En-boy oranı"], ["narrative_style", "narrative_style", "Anlatım tarzı"],
    ["production_process", "production_process", "Çekim süreci"], ["sound", "sound", "Ses"],
    ["reality", "reality", "Gerçeklik"], ["story_dimensions", "story_dimensions", "Hikâye boyutları"]
  ];
  for (const [profileField, filterField, label] of setChecks) {
    const f = filters[filterField];
    if (!f) continue;
    const res = matchSet(profile[profileField], f);
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
  evalLocationMode(profile, filters, state);
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
      prepared.push({ movie, movieId, profile, fieldRows, staleDeterministic: [], filmmap: null, metatakeLocations: null, metatakeExt: null, locationModeEstimated: false, locationModeSource: null });
    }

    const needFilmMap = !!(filters.filming_locations?.include?.length || filters.filming_locations?.exclude?.length || filters.locationMode);
    const needMetatakeForNarrative = !!(filters.story_locations?.include?.length || filters.story_locations?.exclude?.length || filters.related_films?.include?.length || filters.related_films?.exclude?.length);
    const needMetatake = needFilmMap || needMetatakeForNarrative;

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
            if (mt.narrative_setting?.length && (!p.profile.story_locations || !p.profile.story_locations.length)) {
              p.profile.story_locations = mt.narrative_setting;
            }
            if (mt.kindred_films?.length && (!p.profile.related_films || !p.profile.related_films.length)) {
              p.profile.related_films = mt.kindred_films;
            }
            if (mt.awards?.length) {
              const existing = new Set(p.profile.awards_ids || []);
              for (const a of mt.awards) existing.add(String(a));
              p.profile.awards_ids = [...existing];
            }
            if (mt.locations?.length) p.metatakeLocations = mt.locations;
          }
        } catch (e) { console.warn("metatake fail:", e.message); }
      }
    }
    for (const p of prepared) {
      if (!p.profile.location_mode) {
        const derived = deriveLocationModeFromSources(p.profile, p.metatakeLocations || [], p.filmmap || [], p.profile.filming_locations || []);
        if (derived.mode) {
          p.profile.location_mode = derived.mode;
          p.locationModeEstimated = derived.estimated;
          p.locationModeSource = derived.source;
        }
      }
    }
    for (const p of prepared) {
      let stale = findStaleFields(p.profile, p.fieldRows, forceRefresh);
      if (forceAll) stale = Object.keys(FIELD_DEFS);
      p.staleDeterministic = stale.filter(f => FIELD_DEFS[f]?.source !== "llm");
    }

    for (let i = 0; i < prepared.length; i++) {
      if (signal?.aborted) return;
      const p = prepared[i];
      send({ type: "step", index: i, total, title: p.movie.original_title || p.movie.title, stage: p.staleDeterministic.length ? "zenginleştiriliyor" : "önbellekten", fields: p.staleDeterministic.slice(0, 6) });
      const classic = await enrichClassic(env, p.movie, p.staleDeterministic, signal);
      Object.assign(p.profile, classic.updates);
      const covered = [...classic.covered].filter(f => p.profile[f] !== undefined && p.profile[f] !== null);
      await putFieldRows(env, p.movieId, covered, Object.fromEntries(covered.map(f => [f, FIELD_DEFS[f]?.source || "unknown"])));
    }

    const needWiki = !!(filters.original_work?.include?.length || filters.original_work?.exclude?.length
      || filters.filming_locations?.include?.length || filters.filming_locations?.exclude?.length
      || filters.award?.include?.length || filters.award?.exclude?.length);
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
          await putFieldRows(env, p.movieId, covered, Object.fromEntries(covered.map(f => [f, "wikidata"])));
        }
        for (const p of prepared) {
          if (!p.profile.location_mode) {
            const derived = deriveLocationModeFromSources(p.profile, p.metatakeLocations || [], p.filmmap || [], p.profile.filming_locations || []);
            if (derived.mode) { p.profile.location_mode = derived.mode; p.locationModeEstimated = derived.estimated; p.locationModeSource = derived.source; }
          }
        }
      }
    }

    const afterLocal = prepared.filter(p => passesLocalFilters(p.profile, filters));

    const stage2bFields = (() => {
      const fields = new Set(ratioFieldsNeeded(filters));
      if (filters.story_locations && (!filters.story_locations.include?.length && !filters.story_locations.exclude?.length ? false : true)) {
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
      for (const p of afterLocal) {
        if (signal?.aborted) break;
        const stale = findStaleFields(p.profile, p.fieldRows || [], forceRefresh);
        const need = stage2bFields.filter(f => !p.profile[f] || (Array.isArray(p.profile[f]) && p.profile[f].length === 0) || FIELD_DEFS[f]?.source === "llm" && stale.includes(f));
        if (!need.length) continue;
        try {
          const updates = await fillDetails(env, p.movie, need, signal, { movie_id: p.movieId, cache_hit: 0 });
          Object.assign(p.profile, updates);
          const covered = Object.keys(updates).filter(f => p.profile[f] !== undefined && p.profile[f] !== null);
          await putFieldRows(env, p.movieId, covered, Object.fromEntries(covered.map(f => [f, "llm"])));
        } catch (e) { console.warn("stage2b fail:", p.movieId, e.message); }
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
      if (p.staleDeterministic.length) await putProfileRow(env, p.movieId, p.movie.title, yearOf(p.movie), p.profile, forceRefresh);
      const movieLists = listsMap.get(p.movieId) || [];
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
        location_mode_estimated: p.locationModeEstimated,
        location_mode_source: p.locationModeSource,
        movie_lists: movieLists,
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
  let metatakeLocations = null;
  let filmmapLocationsList = null;
  try {
    const fm = await filmmapLocations(env, movie, signal);
    filmmapLocationsList = fm.locations || [];
  } catch (e) { console.warn("filmmap details:", e.message); }
  try {
    const mt = await metatakeExtended(env, movie, signal);
    if (mt) {
      if (mt.narrative_setting?.length && (!profile.story_locations || !profile.story_locations.length)) profile.story_locations = mt.narrative_setting;
      if (mt.kindred_films?.length && (!profile.related_films || !profile.related_films.length)) profile.related_films = mt.kindred_films;
      if (mt.awards?.length) {
        const existingAwards = new Set(profile.awards_ids || []);
        for (const a of mt.awards) existingAwards.add(String(a));
        profile.awards_ids = [...existingAwards];
      }
      if (mt.locations?.length) metatakeLocations = mt.locations;
    }
  } catch (e) { console.warn("metatake details:", e.message); }
  if (!profile.location_mode) {
    const derived = deriveLocationModeFromSources(profile, metatakeLocations || [], filmmapLocationsList || [], profile.filming_locations || []);
    if (derived.mode) profile.location_mode = derived.mode;
  }
  const stale = findStaleFields(profile, fieldRows, forceAll);
  const staleDet = stale.filter(f => FIELD_DEFS[f]?.source !== "llm");
  const staleLLM = stale.filter(f => FIELD_DEFS[f]?.source === "llm");
  if (staleDet.length) {
    const classic = await enrichClassic(env, movie, staleDet, signal);
    Object.assign(profile, classic.updates);
    const covered = [...classic.covered].filter(f => profile[f] !== undefined && profile[f] !== null);
    await putFieldRows(env, movieId, covered, Object.fromEntries(covered.map(f => [f, FIELD_DEFS[f]?.source || "unknown"])));
  }
  if (staleLLM.length) {
    try {
      const updates = await fillDetails(env, movie, staleLLM, signal, { movie_id: movieId });
      Object.assign(profile, updates);
      const covered = Object.keys(updates).filter(f => profile[f] !== undefined && profile[f] !== null);
      await putFieldRows(env, movieId, covered, Object.fromEntries(covered.map(f => [f, "llm"])));
    } catch (e) { console.warn("stage2 details fail:", e.message); }
  }
  await putProfileRow(env, movieId, movie.title, yearOf(movie), profile, forceAll);
  return { movie: { ...movie, ...profile } };
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
        d1: !!env.DB
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
