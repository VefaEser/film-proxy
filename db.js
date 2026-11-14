// db.js — getSiteRatingsBatch sadeleştirildi.
import { FIELD_DEFS } from "./fields.config.js";

export const VERDICT_TTL = 86400;
export const deadKeysCache = { ts: 0, gemini: new Map(), groq: new Set() };

export const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS", "Access-Control-Allow-Headers": "Content-Type,Authorization" };
export function response(data, status = 200) { return new Response(JSON.stringify(data), { status, headers: { ...CORS, "Content-Type": "application/json; charset=utf-8" } }); }
export function jsonError(message, status = 500, extra = {}) { return response({ error: String(message), ...extra }, status); }
export function timingSafeEqualStr(a, b) { if (typeof a !== "string" || typeof b !== "string") return false; const len = Math.max(a.length, b.length); let diff = a.length ^ b.length; for (let i = 0; i < len; i++) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0); return diff === 0; }
export function isAdmin(request, env) { if (!env.ADMIN_TOKEN) return false; return timingSafeEqualStr(request.headers.get("Authorization") || "", `Bearer ${env.ADMIN_TOKEN}`); }

export function safeJSON(text, fallback = null) { try { return JSON.parse(text); } catch { return fallback; } }
export function norm(s) { return String(s || "").trim().toLowerCase().replace(/İ/g, "i").replace(/I/g, "ı").replace(/Ş/g, "ş").replace(/Ğ/g, "ğ").replace(/Ü/g, "ü").replace(/Ö/g, "ö").replace(/Ç/g, "ç").replace(/Â/g, "a").replace(/Î/g, "i").replace(/Û/g, "u").replace(/\s+/g, " "); }
export function yearOf(m) { return Number(String(m.release_date || "").slice(0, 4)) || Number(m.year) || 0; }
export function movieKey(m) { return String(m.id || m.tmdb_id || ""); }
export function simpleHash(str) { let h = 0; for (let i = 0; i < str.length; i++) h = ((h << 5) - h + str.charCodeAt(i)) | 0; return (h >>> 0).toString(36); }

export async function getProfileRow(env, movieId) { if (!env.DB) return null; try { const row = await env.DB.prepare("SELECT data_json, updated_at, last_refreshed_at FROM movie_profiles WHERE movie_id = ?").bind(movieId).first(); if (!row) return null; return { data: safeJSON(row.data_json, {}) || {}, updatedAt: row.updated_at, lastRefreshedAt: row.last_refreshed_at }; } catch (e) { console.error("profile read:", e.message); return null; } }

export async function getSiteRatingForMovie(env, { movieId, tmdbId, imdbId }) {
  if (!env.DB) return { avg: null, count: 0 };
  try {
    const rawImdb = String(imdbId || "").trim().replace(/^tt/, "");
    const tmdbIdStr = tmdbId != null ? String(tmdbId) : (movieId && /^\d+$/.test(String(movieId)) ? String(movieId) : null);
    const clauses = []; const params = [];
    if (tmdbIdStr) { clauses.push("(tmdb_id = ? OR movie_id = ?)"); params.push(parseInt(tmdbIdStr) || tmdbIdStr, `tmdb:${tmdbIdStr}`); }
    if (rawImdb) { clauses.push("(imdb_id = ? OR imdb_id = ? OR movie_id = ?)"); params.push(rawImdb, `tt${rawImdb}`, `imdb:${rawImdb}`); }
    if (movieId && !tmdbIdStr) { clauses.push("movie_id = ?"); params.push(String(movieId)); }
    if (!clauses.length) return { avg: null, count: 0 };
    const sql = `SELECT COUNT(*) AS c, AVG(user_rating) AS avg FROM user_movies WHERE user_rating IS NOT NULL AND (${clauses.join(" OR ")})`;
    const row = await env.DB.prepare(sql).bind(...params).first();
    const count = Number(row?.c || 0);
    const avg = row?.avg != null ? Math.round(Number(row.avg) * 10) / 10 : null;
    return { avg, count };
  } catch (e) { console.warn("site rating:", e.message); return { avg: null, count: 0 }; }
}

// === SADELEŞTİRİLDİ: sadece tmdbId + imdbId ===
export async function getSiteRatingsBatch(env, movies) {
  if (!env.DB || !movies.length) return new Map();
  const results = new Map();
  await Promise.all(movies.map(async (m) => {
    const r = await getSiteRatingForMovie(env, { tmdbId: m.id, imdbId: m.imdbID || m.imdb_id });
    results.set(String(m.id), r);
  }));
  return results;
}

export async function putProfileRow(env, movieId, title, year, data, refreshed = false) { if (!env.DB) return; const now = Math.floor(Date.now() / 1000); const refreshedAt = refreshed ? now : null; const safeTitle = title || data?.title || data?.original_title || data?.name || null; const safeYear = year || yearOf(data) || null; try { await env.DB.prepare(`INSERT INTO movie_profiles (movie_id, title, year, data_json, created_at, updated_at, last_refreshed_at) VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(movie_id) DO UPDATE SET title = COALESCE(excluded.title, movie_profiles.title), year = COALESCE(excluded.year, movie_profiles.year), data_json = excluded.data_json, updated_at = excluded.updated_at, last_refreshed_at = COALESCE(excluded.last_refreshed_at, movie_profiles.last_refreshed_at)`).bind(movieId, safeTitle, safeYear, JSON.stringify(data), now, now, refreshedAt).run(); } catch (e) { console.error("profile write:", e.message); } }
export async function getFieldRows(env, movieId) { if (!env.DB) return []; try { const { results } = await env.DB.prepare("SELECT field, source, fetched_at FROM movie_profile_fields WHERE movie_id = ?").bind(movieId).all(); return results || []; } catch { return []; } }
export async function putFieldRows(env, movieId, fields, sourceLookup) { if (!env.DB || !fields.length) return; const now = Math.floor(Date.now() / 1000); try { const stmts = fields.map(f => env.DB.prepare(`INSERT INTO movie_profile_fields (movie_id, field, source, fetched_at) VALUES (?, ?, ?, ?) ON CONFLICT(movie_id, field) DO UPDATE SET source = excluded.source, fetched_at = excluded.fetched_at`).bind(movieId, f, sourceLookup[f] || "unknown", now)); await env.DB.batch(stmts); } catch (e) { console.error("field write:", e.message); } }
export async function getProfileRowsBatch(env, movieIds) { if (!env.DB || !movieIds.length) return new Map(); try { const placeholders = movieIds.map(() => "?").join(","); const { results } = await env.DB.prepare(`SELECT movie_id, data_json, updated_at, last_refreshed_at FROM movie_profiles WHERE movie_id IN (${placeholders})`).bind(...movieIds).all(); const byId = new Map(); for (const r of results || []) byId.set(r.movie_id, { data: safeJSON(r.data_json, {}) || {}, updatedAt: r.updated_at, lastRefreshedAt: r.last_refreshed_at }); return byId; } catch (e) { console.error("profile batch read:", e.message); return new Map(); } }
export async function getFieldRowsBatch(env, movieIds) { if (!env.DB || !movieIds.length) return new Map(); try { const placeholders = movieIds.map(() => "?").join(","); const { results } = await env.DB.prepare(`SELECT movie_id, field, source, fetched_at FROM movie_profile_fields WHERE movie_id IN (${placeholders})`).bind(...movieIds).all(); const byId = new Map(); for (const r of results || []) { if (!byId.has(r.movie_id)) byId.set(r.movie_id, []); byId.get(r.movie_id).push(r); } return byId; } catch (e) { console.error("fields batch read:", e.message); return new Map(); } }
export async function putProfileRowsBatch(env, entries, refreshed = false) { if (!env.DB || !entries.length) return; const now = Math.floor(Date.now() / 1000); const refreshedAt = refreshed ? now : null; try { const stmts = entries.map(e => { const safeTitle = e.title || e.data?.title || e.data?.original_title || null; const safeYear = e.year || yearOf(e.data) || null; return env.DB.prepare(`INSERT INTO movie_profiles (movie_id, title, year, data_json, created_at, updated_at, last_refreshed_at) VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(movie_id) DO UPDATE SET title = COALESCE(excluded.title, movie_profiles.title), year = COALESCE(excluded.year, movie_profiles.year), data_json = excluded.data_json, updated_at = excluded.updated_at, last_refreshed_at = COALESCE(excluded.last_refreshed_at, movie_profiles.last_refreshed_at)`).bind(e.movieId, safeTitle, safeYear, JSON.stringify(e.data), now, now, refreshedAt); }); await env.DB.batch(stmts); } catch (e) { console.error("profile batch write:", e.message); } }
export async function putFieldRowsBatch(env, entries) { if (!env.DB || !entries.length) return; const now = Math.floor(Date.now() / 1000); try { const stmts = entries.map(e => env.DB.prepare(`INSERT INTO movie_profile_fields (movie_id, field, source, fetched_at) VALUES (?, ?, ?, ?) ON CONFLICT(movie_id, field) DO UPDATE SET source = excluded.source, fetched_at = excluded.fetched_at`).bind(e.movieId, e.field, e.source, now)); await env.DB.batch(stmts); } catch (e) { console.error("fields batch write:", e.message); } }
export async function getVerdictsBatch(env, movieIds, signature) { if (!env.DB || !movieIds.length) return new Map(); try { const placeholders = movieIds.map(() => "?").join(","); const { results } = await env.DB.prepare(`SELECT movie_id, verdict, reason, created_at FROM filter_verdicts WHERE movie_id IN (${placeholders}) AND filter_signature = ?`).bind(...movieIds, signature).all(); const byId = new Map(); const now = Math.floor(Date.now() / 1000); for (const r of results || []) { if (now - r.created_at > VERDICT_TTL) continue; byId.set(r.movie_id, { verdict: r.verdict, reason: r.reason || "" }); } return byId; } catch (e) { console.warn("verdicts batch read:", e.message); return new Map(); } }
export async function putVerdictsBatch(env, entries, signature) { if (!env.DB || !entries.length) return; const now = Math.floor(Date.now() / 1000); try { const stmts = entries.map(e => env.DB.prepare(`INSERT INTO filter_verdicts (movie_id, filter_signature, verdict, reason, created_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(movie_id, filter_signature) DO UPDATE SET verdict = excluded.verdict, reason = excluded.reason, created_at = excluded.created_at`).bind(e.movieId, signature, e.verdict, e.reason || "", now)); await env.DB.batch(stmts); } catch (e) { console.warn("verdicts batch write:", e.message); } }
export async function getMetatakeExtendedCache(env, movieId) { if (!env.DB) return null; try { const row = await env.DB.prepare("SELECT * FROM metatake_extended WHERE movie_id = ?").bind(movieId).first(); if (!row) return null; if (Math.floor(Date.now() / 1000) - row.fetched_at > 90 * 86400) return null; return { narrative_setting: safeJSON(row.narrative_setting_json, []) || [], kindred_films: safeJSON(row.kindred_films_json, []) || [], awards: safeJSON(row.awards_json, []) || [], confidence: row.confidence, locations: safeJSON(row.locations_json, []) || [] }; } catch { return null; } }
export async function putMetatakeExtendedCache(env, movieId, data) { if (!env.DB) return; try { await env.DB.prepare(`INSERT INTO metatake_extended (movie_id, narrative_setting_json, kindred_films_json, awards_json, confidence, locations_json, fetched_at) VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(movie_id) DO UPDATE SET narrative_setting_json = excluded.narrative_setting_json, kindred_films_json = excluded.kindred_films_json, awards_json = excluded.awards_json, confidence = excluded.confidence, locations_json = excluded.locations_json, fetched_at = excluded.fetched_at`).bind(movieId, JSON.stringify(data.narrative_setting || []), JSON.stringify(data.kindred_films || []), JSON.stringify(data.awards || []), data.confidence ?? null, JSON.stringify(data.locations || []), Math.floor(Date.now() / 1000)).run(); } catch (e) { console.warn("metatake extended cache:", e.message); } }
export async function getFilmmapCache(env, movieId) { if (!env.DB) return null; try { const row = await env.DB.prepare("SELECT locations_json, fetched_at FROM filmmap_cache WHERE movie_id = ?").bind(movieId).first(); if (!row) return null; if (Math.floor(Date.now() / 1000) - row.fetched_at > 90 * 86400) return null; return safeJSON(row.locations_json, []); } catch { return null; } }
export async function putFilmmapCache(env, movieId, locations) { if (!env.DB) return; try { await env.DB.prepare(`INSERT INTO filmmap_cache (movie_id, locations_json, fetched_at) VALUES (?, ?, ?) ON CONFLICT(movie_id) DO UPDATE SET locations_json = excluded.locations_json, fetched_at = excluded.fetched_at`).bind(movieId, JSON.stringify(locations), Math.floor(Date.now() / 1000)).run(); } catch (e) { console.warn("filmmap cache:", e.message); } }

export function isBadDetailArray(val) { if (!Array.isArray(val)) return false; if (val.length === 0) return false; const looksLikeId = (s) => { if (typeof s !== "string") return false; const t = s.trim(); if (!t) return true; return /^(nm|tt)\d+$/i.test(t) || /^\d+$/.test(t) || /^[QP]\d+$/i.test(t) || /^person[\/_-]\d+$/i.test(t) || /^id[\/_-]?\d+$/i.test(t) || /^@\d+$/.test(t) || /^\[object /i.test(t) || /^\{.*\}$/.test(t) || /^\[.*\]$/.test(t) || /":\s*"/.test(t) || /^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(t); }; return val.some(v => { if (v == null) return true; if (typeof v === "string") return looksLikeId(v); if (typeof v === "number" || typeof v === "boolean") return true; if (typeof v === "object") { const candidates = [v.name, v.original_name]; for (const c of candidates) if (typeof c === "string" && c.trim() && !looksLikeId(c)) return false; return true; } return true; }); }

export function findStaleFields(profile, fieldRows, forceRefresh) {
  const now = Math.floor(Date.now() / 1000);
  const fetched = new Map(fieldRows.map(r => [r.field, Number(r.fetched_at)]));
  const stale = [];
  const detailFields = new Set(["writers", "writers_ids", "cast", "cast_ids", "director", "director_ids", "producers", "actors", "omdb_directors"]);
  const arrayFields = new Set(["genres", "genres_ids", "spoken_languages", "spoken_languages_ids", "production_countries", "production_countries_ids", "production_companies", "production_companies_ids", "director", "director_ids", "writers", "writers_ids", "producers", "cast", "cast_ids", "keywords", "keywords_ids", "story_locations", "story_period", "story_geography", "season", "character_traits", "narrative_style", "production_process", "sound", "reality", "story_dimensions", "related_films", "related_films_detail", "filming_locations", "filming_countries", "awards_ids", "nominated_ids", "color_style"]);
  for (const [field, def] of Object.entries(FIELD_DEFS)) {
    const raw = profile[field];
    const isEmptyArray = Array.isArray(raw) && raw.length === 0;
    const isEmptyString = typeof raw === "string" && raw.trim() === "";
    const hasValue = raw !== undefined && raw !== null && !isEmptyArray && !isEmptyString;
    const badData = hasValue && detailFields.has(field) && isBadDetailArray(raw);
    if (!hasValue || badData) { stale.push(field); continue; }
    if (arrayFields.has(field) && !Array.isArray(raw)) { stale.push(field); continue; }
    if (forceRefresh) { stale.push(field); continue; }
    if (def.ttl == null) continue;
    const at = fetched.get(field) || 0;
    if (now - at > def.ttl) stale.push(field);
  }
  return stale;
}
export async function loadDeadKeys(env) { const now = Date.now(); if (now - deadKeysCache.ts < 30000) return deadKeysCache; if (!env.DB) return deadKeysCache; try { const { results } = await env.DB.prepare("SELECT provider, key_index, model FROM dead_keys WHERE until_ts > ?").bind(Math.floor(now / 1000)).all(); const gemini = new Map(); const groq = new Set(); for (const r of results || []) { if (r.provider === "gemini") { if (!gemini.has(r.model)) gemini.set(r.model, new Set()); gemini.get(r.model).add(r.key_index); } else if (r.provider === "groq") groq.add(r.key_index); } deadKeysCache.ts = now; deadKeysCache.gemini = gemini; deadKeysCache.groq = groq; return deadKeysCache; } catch (e) { console.warn("dead_keys read:", e.message); return deadKeysCache; } }
export function isKeyDeadForModel(dead, model, index) { const forModel = dead.gemini.get(model) || new Set(); const forAll = dead.gemini.get("") || new Set(); return forModel.has(index) || forAll.has(index); }
export async function markDeadKey(env, provider, keyIndex, untilTs, reason, model) { deadKeysCache.ts = 0; if (!env.DB) return; try { await env.DB.prepare(`INSERT INTO dead_keys (provider, key_index, model, until_ts, reason) VALUES (?, ?, ?, ?, ?) ON CONFLICT(provider, key_index, model) DO UPDATE SET until_ts = excluded.until_ts, reason = excluded.reason`).bind(provider, keyIndex, model || "", untilTs, reason || "").run(); } catch (e) { console.warn("dead_keys write:", e.message); } }
export function logLlmCall(env, provider, model, keyIndex, ok, latencyMs, errSnippet, context) { if (!env.DB) return; const now = Math.floor(Date.now() / 1000); env.DB.prepare("INSERT INTO llm_calls (ts, provider, model, key_index, ok, latency_ms, error_snippet) VALUES (?, ?, ?, ?, ?, ?, ?)").bind(now, provider, model, keyIndex, ok ? 1 : 0, latencyMs, errSnippet || null).run().catch(e => console.warn("llm_calls:", e.message)); }
export async function getDailyModelCalls(env, provider, model) { if (!env.DB) return 0; try { const since = Math.floor(Date.now() / 1000) - 86400; const row = await env.DB.prepare("SELECT COUNT(*) AS c FROM llm_calls WHERE provider = ? AND model = ? AND ok = 1 AND ts > ?").bind(provider, model, since).first(); return Number(row?.c || 0); } catch { return 0; } }
