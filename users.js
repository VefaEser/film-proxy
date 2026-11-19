// users.js — Faz 8 C-2: refreshCardForImdb çoklu aday disambiguation
import { getCurrentUserWithAdminBridge } from "./auth.js";
import { handleMovieDetails } from "./research.js";
import { evaluateFilters } from "./filters.js";

const CORS = { "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS", "Access-Control-Allow-Headers": "Content-Type,Authorization" };
function jsonRes(data, status = 200) { return new Response(JSON.stringify(data), { status, headers: { ...CORS, "Content-Type": "application/json; charset=utf-8" } }); }
function jsonErr(msg, status = 500) { return jsonRes({ error: String(msg) }, status); }
function safeJSON(t, fb = null) { try { return JSON.parse(t); } catch { return fb; } }

const RATING_STATS_CACHE_TTL_MS = 60 * 1000;
const ratingStatsCache = new Map();
function ratingStatsCacheGet(key) { const e = ratingStatsCache.get(key); if (!e) return null; if (Date.now() - e.ts > RATING_STATS_CACHE_TTL_MS) { ratingStatsCache.delete(key); return null; } return e.data; }
function ratingStatsCacheSet(key, data) { ratingStatsCache.set(key, { ts: Date.now(), data }); }
function invalidateRatingStatsCache({ tmdbId, imdbId, movieId }) {
  if (tmdbId != null) ratingStatsCache.delete(`tmdb:${tmdbId}`);
  if (imdbId) ratingStatsCache.delete(`imdb:${cleanImdb(imdbId)}`);
  if (movieId) ratingStatsCache.delete(`mid:${movieId}`);
}

async function userHasAnyPermission(env, sess, perms) { if (sess.is_admin) return true; try { const placeholders = perms.map(() => "?").join(","); const row = await env.DB.prepare(`SELECT 1 FROM user_permissions WHERE user_id = ? AND permission IN (${placeholders}) LIMIT 1`).bind(sess.user_id, ...perms).first(); return !!row; } catch { return false; } }

function normalizeRatingValue(raw) {
  if (raw == null) return null;
  const s = String(raw).trim();
  if (!s) return null;
  if (!/^\d+$/.test(s)) return null;
  const n = parseInt(s, 10);
  if (Number.isInteger(n) && n >= 1 && n <= 10) return n;
  return null;
}
function cleanImdb(raw) { return String(raw || "").trim().replace(/^tt/, ""); }

// === FAZ 8 C-2: Başlık normalizasyonu (disambiguation için) ===
function normalizeTitle(t) {
  return String(t || "").toLowerCase().trim()
    .replace(/ı/g, "i").replace(/İ/g, "i").replace(/ş/g, "s").replace(/Ş/g, "s")
    .replace(/ğ/g, "g").replace(/Ğ/g, "g").replace(/ü/g, "u").replace(/Ü/g, "u")
    .replace(/ö/g, "o").replace(/Ö/g, "o").replace(/ç/g, "c").replace(/Ç/g, "c")
    .replace(/[^a-z0-9]/g, "");
}

// === FAZ 8 C-2: Çoklu TMDB adayı skorlama ===
function pickBestTmdbCandidate(candidates, meta) {
  if (!Array.isArray(candidates) || !candidates.length) return { picked: null, reason: "no-candidate", candidates };
  if (candidates.length === 1) return { picked: candidates[0], reason: "single", candidates };

  const targetYear = meta.year ? parseInt(meta.year) : null;
  const targetTitles = [meta.title_original, meta.title_tr, meta.title]
    .filter(Boolean).map(normalizeTitle).filter(Boolean);

  const scored = candidates.map(c => {
    let score = 0;
    const cYear = parseInt(String(c.release_date || "").slice(0, 4));
    if (targetYear && cYear) {
      if (targetYear === cYear) score += 100;
      else if (Math.abs(targetYear - cYear) === 1) score += 30;
      else if (Math.abs(targetYear - cYear) <= 2) score += 10;
    }
    if (targetTitles.length) {
      const cTitle = normalizeTitle(c.original_title || c.title);
      const cTitleAlt = normalizeTitle(c.title);
      for (const t of targetTitles) {
        if (cTitle === t || cTitleAlt === t) score += 200;
        else if (cTitle.includes(t) || t.includes(cTitle)) score += 80;
        else if (cTitleAlt.includes(t) || t.includes(cTitleAlt)) score += 60;
      }
    }
    return { candidate: c, score };
  });
  scored.sort((a, b) => b.score - a.score);

  // Benzersiz en yüksek skor (>=100) → otomatik seç
  if (scored[0].score >= 100 && (scored.length === 1 || scored[1].score < scored[0].score)) {
    return { picked: scored[0].candidate, reason: "scored", candidates };
  }
  return { picked: null, reason: "ambiguous", candidates };
}

function parseCsv(text) {
  const lines = String(text || "").replace(/^\uFEFF/, "").trim().split(/\r?\n/);
  if (!lines.length) return [];
  const parseRow = (line) => { const out = []; let cur = ""; let q = false; for (let i = 0; i < line.length; i++) { const c = line[i]; if (c === '"') { if (q && line[i + 1] === '"') { cur += '"'; i++; } else q = !q; } else if (c === "," && !q) { out.push(cur); cur = ""; } else cur += c; } out.push(cur); return out; };
  const headers = parseRow(lines[0]).map(h => h.trim().replace(/^"|"$/g, ""));
  const idx = (name) => headers.findIndex(h => h.toLowerCase() === name.toLowerCase());
  const iConst = idx("Const"), iOrig = idx("Original Title"), iTitle = idx("Title"), iUrl = idx("URL"),
    iRating = idx("Imdb Rating"), iVotes = idx("Num Votes"), iYear = idx("Year"),
    iGenres = idx("Genres"), iDirectors = idx("Directors");
  const iRuntime = (() => { for (const c of ["Runtime", "Runtime (mins)", "Duration", "Duration (mins)"]) { const i = idx(c); if (i >= 0) return i; } return -1; })();
  const iUserRating = idx("Your Rating");
  const iTmdbId = (() => { for (const c of ["TMDB ID", "Tmdb Id", "tmdb_id", "TMDB Id", "TmdbID"]) { const i = idx(c); if (i >= 0) return i; } return -1; })();
  console.log(`[parseCsv] headers=${JSON.stringify(headers)} → iConst=${iConst} iUserRating=${iUserRating} iTmdbId=${iTmdbId} iOrig=${iOrig} iYear=${iYear}`);
  const out = [];
  for (let li = 1; li < lines.length; li++) {
    const cols = parseRow(lines[li]);
    const rawImdb = iConst >= 0 ? (cols[iConst] || "").trim() : "";
    if (!rawImdb) continue;
    const userRating = iUserRating >= 0 ? normalizeRatingValue(cols[iUserRating]) : null;
    const tmdbIdFromCsv = iTmdbId >= 0 ? (parseInt(String(cols[iTmdbId] || "").replace(/[^\d]/g, "")) || null) : null;
    out.push({ imdbId: cleanImdb(rawImdb), titleOriginal: iOrig >= 0 ? (cols[iOrig] || "").trim() : "", titleTr: iTitle >= 0 ? (cols[iTitle] || "").trim() : "", url: iUrl >= 0 ? (cols[iUrl] || "").trim() : "", year: iYear >= 0 ? parseInt(cols[iYear]) || null : null, imdbRating: iRating >= 0 ? parseFloat(cols[iRating]) || null : null, imdbVotes: iVotes >= 0 ? parseInt(String(cols[iVotes] || "").replace(/[^\d]/g, "")) || null : null, runtime: iRuntime >= 0 ? (parseInt(String(cols[iRuntime] || "").replace(/[^\d]/g, "")) || null) : null, genres: iGenres >= 0 ? (cols[iGenres] || "").trim() : "", directors: iDirectors >= 0 ? (cols[iDirectors] || "").trim() : "", userRating, tmdbId: tmdbIdFromCsv });
  }
  return out;
}
function movieIdFromImdb(imdbId) { return "imdb:" + String(imdbId || "").replace(/^tt/, ""); }

async function importCsv(env, userId, listType, items) {
  if (!env.DB) throw new Error("DB yok");
  const now = Math.floor(Date.now() / 1000); let added = 0, skipped = 0, conflicts = 0, withRating = 0;
  const allExisting = await env.DB.prepare("SELECT list_type, imdb_id FROM user_movies WHERE user_id = ? AND list_type IN ('watched','want','wont')").bind(userId).all();
  const byImdb = new Map();
  for (const r of allExisting.results || []) { if (!r.imdb_id) continue; const key = cleanImdb(r.imdb_id); if (!byImdb.has(key)) byImdb.set(key, new Set()); byImdb.get(key).add(r.list_type); }
  const stmts = [];
  const ratingSamples = [];
  for (const it of items) {
    const cleanId = cleanImdb(it.imdbId);
    const conflicting = byImdb.get(cleanId); if (conflicting && [...conflicting].some(t => t !== listType)) { conflicts++; continue; }
    if (it.userRating != null && ratingSamples.length < 5) ratingSamples.push(`${cleanId}=${it.userRating}`);
    stmts.push(env.DB.prepare(`INSERT INTO user_movies (user_id, list_type, movie_id, imdb_id, tmdb_id, title_original, title_tr, url, year, imdb_rating, imdb_votes, runtime, genres, directors, user_rating, source, source_meta_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'csv', NULL, ?, ?) ON CONFLICT(user_id, list_type, movie_id) DO UPDATE SET title_original = excluded.title_original, title_tr = excluded.title_tr, url = excluded.url, year = excluded.year, imdb_rating = excluded.imdb_rating, imdb_votes = excluded.imdb_votes, runtime = excluded.runtime, genres = excluded.genres, directors = excluded.directors, user_rating = COALESCE(excluded.user_rating, user_movies.user_rating), tmdb_id = COALESCE(excluded.tmdb_id, user_movies.tmdb_id), source = excluded.source, updated_at = excluded.updated_at`).bind(userId, listType, movieIdFromImdb(cleanId), cleanId, it.tmdbId || null, it.titleOriginal, it.titleTr, it.url || null, it.year, it.imdbRating, it.imdbVotes, it.runtime, it.genres, it.directors, it.userRating ?? null, now, now));
    added++;
    if (it.userRating != null) withRating++;
  }
  for (let i = 0; i < stmts.length; i += 40) await env.DB.batch(stmts.slice(i, i + 40));
  if (items.length > 0 && withRating === 0) {
    console.warn(`[importCsv] UYARI: ${items.length} satır eklendi ama hiçbirinde puan okunamadı.`);
  } else {
    console.log(`[importCsv] ${items.length} satır, ${withRating} satırda puan okundu. Örnekler: ${ratingSamples.join(", ")}`);
  }
  return { added, skipped, conflicts, withRating };
}
async function importCsvFile(env, userId, listType, csvText) {
  const items = parseCsv(csvText); if (!items.length) throw new Error("CSV'de geçerli film bulunamadı");
  const res = await importCsv(env, userId, listType, items);
  const hash = String(items.length) + "|" + (items[0]?.imdbId || "");
  await env.DB.prepare(`INSERT INTO csv_imports (user_id, list_type, filename, content_hash, row_count, conflicts, imported_at) VALUES (?, ?, NULL, ?, ?, ?, ?)`).bind(userId, listType, hash, items.length, res.conflicts, Math.floor(Date.now() / 1000)).run();
  return { ...res, total: items.length };
}

async function getList(env, userId, listType, page = 1, pageSize = 10, sort = "year_desc") {
  const offset = (page - 1) * pageSize;
  let orderBy;
  if (sort === "imdb_desc") orderBy = "imdb_rating DESC, year DESC";
  else if (sort === "user_desc") orderBy = "COALESCE(user_rating, -1) DESC, year DESC";
  else orderBy = "year DESC, imdb_rating DESC";
  const { results } = await env.DB.prepare(`SELECT movie_id, imdb_id, tmdb_id, title_original, title_tr, url, year, imdb_rating, imdb_votes, runtime, genres, directors, user_rating, source FROM user_movies WHERE user_id = ? AND list_type = ? ORDER BY ${orderBy} LIMIT ? OFFSET ?`).bind(userId, listType, pageSize, offset).all();
  const items = results || [];
  const tmdbCandidates = new Set();
  for (const it of items) { if (it.tmdb_id) tmdbCandidates.add(String(it.tmdb_id)); else if (it.movie_id && it.movie_id.startsWith("tmdb:")) { const n = parseInt(it.movie_id.slice(5)); if (Number.isFinite(n)) tmdbCandidates.add(String(n)); } }
  const profileByTmdbId = new Map();
  if (tmdbCandidates.size) { const arr = [...tmdbCandidates]; const placeholders = arr.map(() => "?").join(","); const { results: profiles } = await env.DB.prepare(`SELECT movie_id, data_json FROM movie_profiles WHERE movie_id IN (${placeholders})`).bind(...arr).all(); for (const p of profiles || []) { try { profileByTmdbId.set(String(p.movie_id), { ...JSON.parse(p.data_json), id: String(p.movie_id) }); } catch {} } }
  const needFallback = items.filter(it => { const key = it.tmdb_id ? String(it.tmdb_id) : (it.movie_id?.startsWith("tmdb:") ? String(parseInt(it.movie_id.slice(5))) : null); if (key && profileByTmdbId.has(key)) return false; return !!it.imdb_id; });
  const profileByImdb = new Map();
  if (needFallback.length) {
    const imdbIdsFull = needFallback.map(it => { const c = cleanImdb(it.imdb_id); return `tt${c}`; });
    const placeholders = imdbIdsFull.map(() => "?").join(",");
    try {
      const { results: profilesByImdb } = await env.DB.prepare(`SELECT movie_id, data_json FROM movie_profiles WHERE json_extract(data_json, '$.imdbID') IN (${placeholders}) OR json_extract(data_json, '$.imdb_id') IN (${placeholders})`).bind(...imdbIdsFull, ...imdbIdsFull).all();
      for (const p of profilesByImdb || []) { try { const data = JSON.parse(p.data_json); const pImdb = data.imdbID || data.imdb_id; if (pImdb) profileByImdb.set(cleanImdb(pImdb), { ...data, id: String(p.movie_id) }); } catch {} }
    } catch (e) { console.warn("imdb fallback:", e.message); }
  }
  const siteRatingMap = new Map();
  if (items.length) {
    try {
      const tmdbIds = items.map(it => it.tmdb_id).filter(Boolean);
      const cleanImdbIds = items.map(it => it.imdb_id ? cleanImdb(it.imdb_id) : null).filter(Boolean);
      const tmdbPlace = tmdbIds.length ? tmdbIds.map(() => "?").join(",") : null;
      const imdbPlace = cleanImdbIds.length ? cleanImdbIds.map(() => "?").join(",") : null;
      const clauses = []; const params = [];
      if (tmdbPlace) { clauses.push(`tmdb_id IN (${tmdbPlace})`); params.push(...tmdbIds); }
      if (imdbPlace) { clauses.push(`REPLACE(imdb_id, 'tt', '') IN (${imdbPlace})`); params.push(...cleanImdbIds); }
      if (clauses.length) {
        const { results: rows } = await env.DB.prepare(`SELECT tmdb_id, imdb_id, COUNT(user_rating) AS c, AVG(user_rating) AS avg FROM user_movies WHERE user_rating IS NOT NULL AND (${clauses.join(" OR ")}) GROUP BY tmdb_id, imdb_id`).bind(...params).all();
        for (const r of rows || []) {
          const entry = { avg: r.avg != null ? Math.round(Number(r.avg) * 10) / 10 : null, count: Number(r.c || 0) };
          if (r.tmdb_id != null) siteRatingMap.set(`tmdb:${r.tmdb_id}`, entry);
          if (r.imdb_id) siteRatingMap.set(`imdb:${cleanImdb(r.imdb_id)}`, entry);
        }
      }
    } catch (e) { console.warn("site-rating batch:", e.message); }
  }
  const enriched = items.map(it => {
    let profile = null;
    const tmdbKey = it.tmdb_id ? String(it.tmdb_id) : (it.movie_id?.startsWith("tmdb:") ? String(parseInt(it.movie_id.slice(5))) : null);
    if (tmdbKey) profile = profileByTmdbId.get(tmdbKey) || null;
    if (!profile && it.imdb_id) { profile = profileByImdb.get(cleanImdb(it.imdb_id)) || null; }
    if (profile) {
      if (!profile.original_title) profile.original_title = it.title_original || it.title_tr || profile.title || `IMDb: ${it.imdb_id}`;
      if (!profile.title) profile.title = it.title_tr || it.title_original || profile.original_title;
      if (!profile.release_date && it.year) profile.release_date = String(it.year);
      if (!profile.runtime && it.runtime) profile.runtime = it.runtime;
      if (!profile.imdbRating && it.imdb_rating) profile.imdbRating = it.imdb_rating;
      if (!profile.imdbVotes && it.imdb_votes) profile.imdbVotes = String(it.imdb_votes);
      if (!profile.genres && it.genres) profile.genres = String(it.genres).split(",").map(s => s.trim()).filter(Boolean);
      if (!profile.director && it.directors) profile.director = String(it.directors).split(",").map(n => ({ name: n.trim(), profile_path: null })).filter(p => p.name);
      if (!profile.imdb_id && it.imdb_id) profile.imdb_id = `tt${cleanImdb(it.imdb_id)}`;
      if (!profile.imdbID && it.imdb_id) profile.imdbID = `tt${cleanImdb(it.imdb_id)}`;
      if (!profile.id && tmdbKey) profile.id = tmdbKey;
      if (it.user_rating != null) profile.user_rating = it.user_rating;
      const cleanImdbId = it.imdb_id ? cleanImdb(it.imdb_id) : null;
      const sr = (it.tmdb_id && siteRatingMap.get(`tmdb:${it.tmdb_id}`)) || (cleanImdbId && siteRatingMap.get(`imdb:${cleanImdbId}`));
      if (sr && sr.count > 0) { profile.site_rating = sr.avg; profile.site_rating_count = sr.count; }
    }
    return { ...it, profile: profile || null, needs_card: !profile };
  });
  const { results: countRows } = await env.DB.prepare("SELECT COUNT(*) AS c FROM user_movies WHERE user_id = ? AND list_type = ?").bind(userId, listType).all();
  return { items: enriched, total: countRows?.[0]?.c || 0, page, pageSize };
}

async function getMovieCounts(env, movieId) { if (!env.DB) return { watched: 0, want: 0, wont: 0 }; const { results } = await env.DB.prepare(`SELECT list_type, COUNT(*) AS c FROM user_movies WHERE movie_id = ? AND list_type IN ('watched','want','wont') GROUP BY list_type`).bind(movieId).all(); const out = { watched: 0, want: 0, wont: 0 }; for (const r of results || []) out[r.list_type] = r.c; return out; }

// === FAZ 8 C-2: refreshCardForImdb — meta parametresi + disambiguation ===
async function refreshCardForImdb(env, imdbId, signal, meta = {}) {
  const cleanId = cleanImdb(imdbId);
  if (!cleanId) throw new Error("imdb_id gerekli");
  const { tmdb } = await import("./sources.js");
  const findData = await tmdb(env, `/find/tt${cleanId}`, { external_source: "imdb_id", language: "tr-TR" }, signal);
  const candidates = findData.movie_results || [];
  if (!candidates.length) throw new Error("Film TMDB'de bulunamadı");

  const fullMeta = { imdb_id: cleanId, ...meta };
  const result = pickBestTmdbCandidate(candidates, fullMeta);

  if (!result.picked) {
    const list = candidates.slice(0, 5).map(c => `TMDB#${c.id} "${c.original_title || c.title}" (${(c.release_date || "").slice(0, 4) || "?"})`).join(" | ");
    const err = new Error(`IMDb ID (tt${cleanId}) için ${candidates.length} aday bulundu, otomatik seçim yapılamadı: ${list}`);
    err.code = "ambiguous";
    err.candidates = candidates.map(c => ({ id: c.id, title: c.original_title || c.title, year: (c.release_date || "").slice(0, 4) || null }));
    throw err;
  }

  const tmdbMovie = result.picked;
  const detailResult = await handleMovieDetails(env, { movie: { id: tmdbMovie.id, imdb_id: `tt${cleanId}`, title: tmdbMovie.title, original_title: tmdbMovie.original_title, release_date: tmdbMovie.release_date, overview: tmdbMovie.overview, poster_path: tmdbMovie.poster_path, vote_average: tmdbMovie.vote_average, vote_count: tmdbMovie.vote_count, genre_ids: tmdbMovie.genre_ids || [] }, forceAll: true }, signal);
  return { tmdbId: tmdbMovie.id, movie: detailResult.movie, disambiguation: result.reason };
}

async function searchCsvCache(env, filters, limit, viewerId, query) {
  if (!env.DB) return [];
  const { results } = await env.DB.prepare(
    `SELECT um.tmdb_id, um.imdb_id, um.title_original, um.title_tr, um.year, um.runtime, um.imdb_rating, um.imdb_votes, um.genres, um.directors, mp.data_json
     FROM user_movies um
     INNER JOIN movie_profiles mp ON mp.movie_id = CAST(um.tmdb_id AS TEXT)
     WHERE um.tmdb_id IS NOT NULL AND mp.data_json IS NOT NULL
     GROUP BY um.tmdb_id ORDER BY mp.updated_at DESC LIMIT 500`
  ).all();
  const q = String(query || "").trim().toLowerCase();
  const matches = [];
  for (const r of results || []) {
    if (matches.length >= limit) break;
    try {
      const profile = JSON.parse(r.data_json);
      profile.id = String(r.tmdb_id);
      if (r.imdb_id && !profile.imdb_id) profile.imdb_id = `tt${cleanImdb(r.imdb_id)}`;
      if (!profile.imdbID && r.imdb_id) profile.imdbID = `tt${cleanImdb(r.imdb_id)}`;
      if (!profile.original_title) profile.original_title = r.title_original || r.title_tr || null;
      if (!profile.title) profile.title = r.title_tr || r.title_original || null;
      if (!profile.release_date && r.year) profile.release_date = String(r.year);
      if (!profile.runtime && r.runtime) profile.runtime = r.runtime;
      if (!profile.imdbRating && r.imdb_rating) profile.imdbRating = r.imdb_rating;
      if (!profile.imdbVotes && r.imdb_votes) profile.imdbVotes = String(r.imdb_votes);
      if (!profile.genres && r.genres) profile.genres = String(r.genres).split(",").map(s => s.trim()).filter(Boolean);
      if (!profile.director && r.directors) profile.director = String(r.directors).split(",").map(n => ({ name: n.trim(), profile_path: null })).filter(p => p.name);
      if (q) { const hay = `${profile.original_title || ""} ${profile.title || ""}`.toLowerCase(); if (!hay.includes(q)) continue; }
      const evalResult = evaluateFilters(profile, filters, null, null, null);
      if (evalResult.match) matches.push({ ...profile, _csv_cache: true });
    } catch (e) {}
  }
  return matches;
}

export async function handleUser(request, env, ctx) {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  const url = new URL(request.url);
  const path = url.pathname.replace(/^\/user/, "");
  const sess = await getCurrentUserWithAdminBridge(env, request);
  const isAuth = !!sess && !sess.is_suspended;

  if (path === "/visual-profile" && request.method === "GET") {
    const movieId = String(url.searchParams.get("movieId") || "").trim();
    if (!movieId) return jsonErr("movieId gerekli", 400);
    try {
      const { getVisualProfile } = await import("./db.js");
      const vp = await getVisualProfile(env, movieId);
      return jsonRes({ ok: true, visualProfile: vp });
    } catch (e) { return jsonErr(e.message, 500); }
  }
  if (path === "/visual-profile" && request.method === "POST") {
    let body; try { body = await request.json(); } catch { return jsonErr("Geçersiz JSON", 400); }
    const movieId = String(body.movieId || "").trim();
    if (!movieId) return jsonErr("movieId gerekli", 400);
    const fields = body.fields && typeof body.fields === "object" ? body.fields : null;
    if (!fields || !Object.keys(fields).length) return jsonErr("fields gerekli", 400);
    if (Object.keys(fields).length > 20) return jsonErr("Çok fazla alan (max 20)", 400);
    for (const [k, v] of Object.entries(fields)) {
      if (!v || typeof v !== "object") return jsonErr(`Geçersiz alan: ${k}`, 400);
      try { if (JSON.stringify(v.value).length > 10240) return jsonErr(`Alan çok büyük: ${k}`, 400); } catch { return jsonErr(`Alan serileştirilemiyor: ${k}`, 400); }
    }
    try {
      const { putVisualProfile } = await import("./db.js");
      await putVisualProfile(env, movieId, fields, { status: "complete", schemaVersion: 1 });
      return jsonRes({ ok: true });
    } catch (e) { return jsonErr(e.message, 500); }
  }

  if (path.startsWith("/movie/rating-stats/") && request.method === "GET") {
    const rawId = decodeURIComponent(path.replace("/movie/rating-stats/", ""));
    let tmdbId = null, imdbId = null, movieIdParam = null;
    if (/^\d+$/.test(rawId)) tmdbId = parseInt(rawId, 10);
    else if (/^tt\d+$/i.test(rawId)) imdbId = cleanImdb(rawId);
    else movieIdParam = rawId;
    const cacheKey = tmdbId ? `tmdb:${tmdbId}` : (imdbId ? `imdb:${imdbId}` : `mid:${movieIdParam}`);
    const cached = ratingStatsCacheGet(cacheKey);
    if (cached) return jsonRes(cached);
    const clauses = []; const params = [];
    if (tmdbId) { clauses.push("(tmdb_id = ? OR movie_id = ?)"); params.push(tmdbId, `tmdb:${tmdbId}`); }
    if (imdbId) { clauses.push("(imdb_id = ? OR imdb_id = ? OR movie_id = ?)"); params.push(imdbId, `tt${imdbId}`, `imdb:${imdbId}`); }
    if (movieIdParam) { clauses.push("movie_id = ?"); params.push(movieIdParam); }
    if (!clauses.length) return jsonErr("movieId gerekli", 400);
    const { results } = await env.DB.prepare(`
      WITH matched AS (
        SELECT user_id, user_rating,
          ROW_NUMBER() OVER (
            PARTITION BY user_id
            ORDER BY CASE WHEN list_type IN ('watched','want','wont') THEN 0 ELSE 1 END,
                     updated_at DESC
          ) AS rn
        FROM user_movies
        WHERE user_rating IS NOT NULL AND (${clauses.join(" OR ")})
      )
      SELECT user_rating, COUNT(*) AS c
      FROM matched WHERE rn = 1
      GROUP BY user_rating
    `).bind(...params).all();
    const distribution = { 1:0,2:0,3:0,4:0,5:0,6:0,7:0,8:0,9:0,10:0 };
    let totalVotes = 0, sum = 0;
    for (const r of results || []) {
      const rt = Math.round(Number(r.user_rating));
      if (rt >= 1 && rt <= 10) { distribution[rt] = Number(r.c); totalVotes += Number(r.c); sum += rt * Number(r.c); }
    }
    const avg = totalVotes > 0 ? Math.round((sum / totalVotes) * 10) / 10 : null;
    const result = { distribution, totalVotes, avg };
    ratingStatsCacheSet(cacheKey, result);
    return jsonRes(result);
  }

  if (path.startsWith("/movie/rating-users/") && request.method === "GET") {
    const rawId = decodeURIComponent(path.replace("/movie/rating-users/", ""));
    const ratingQ = parseInt(url.searchParams.get("rating") || "0", 10);
    if (ratingQ < 1 || ratingQ > 10) return jsonErr("rating 1-10 olmalı", 400);
    let tmdbId = null, imdbId = null, movieIdParam = null;
    if (/^\d+$/.test(rawId)) tmdbId = parseInt(rawId, 10);
    else if (/^tt\d+$/i.test(rawId)) imdbId = cleanImdb(rawId);
    else movieIdParam = rawId;
    const clauses = []; const params = [];
    if (tmdbId) { clauses.push("(um.tmdb_id = ? OR um.movie_id = ?)"); params.push(tmdbId, `tmdb:${tmdbId}`); }
    if (imdbId) { clauses.push("(um.imdb_id = ? OR um.imdb_id = ? OR um.movie_id = ?)"); params.push(imdbId, `tt${imdbId}`, `imdb:${imdbId}`); }
    if (movieIdParam) { clauses.push("um.movie_id = ?"); params.push(movieIdParam); }
    if (!clauses.length) return jsonErr("movieId gerekli", 400);
    const { results } = await env.DB.prepare(`
      WITH matched AS (
        SELECT um.user_id, um.user_rating,
          ROW_NUMBER() OVER (
            PARTITION BY um.user_id
            ORDER BY CASE WHEN um.list_type IN ('watched','want','wont') THEN 0 ELSE 1 END,
                     um.updated_at DESC
          ) AS rn
        FROM user_movies um
        WHERE um.user_rating IS NOT NULL AND (${clauses.join(" OR ")})
      )
      SELECT m.user_id, u.username, u.rating_visibility
      FROM matched m
      JOIN users u ON u.id = m.user_id
      WHERE m.rn = 1 AND m.user_rating = ?
    `).bind(...params, ratingQ).all();
    const adminCheck = isAuth && sess.is_admin;
    const list = []; let hiddenCount = 0;
    for (const r of results || []) {
      const isSelf = isAuth && r.user_id === sess.user_id;
      if (adminCheck || isSelf || r.rating_visibility === "public") list.push({ username: r.username, isSelf, isPublic: r.rating_visibility === "public" });
      else hiddenCount++;
    }
    return jsonRes({ rating: ratingQ, users: list, hiddenCount, total: list.length + hiddenCount });
  }

  if (path.startsWith("/admin/user-lists/") && request.method === "GET") {
    if (!isAuth) return jsonErr("Giriş gerekli", 401);
    const allowed = await userHasAnyPermission(env, sess, ["refresh_movie", "csv_import_cards", "user_manage"]);
    if (!allowed) return jsonErr("Bu işlem için yetkiniz yok", 403);
    const userId = parseInt(path.replace("/admin/user-lists/", ""), 10);
    if (!userId) return jsonErr("userId gerekli", 400);
    const user = await env.DB.prepare("SELECT id, username, register_number, is_public, rating_visibility FROM users WHERE id = ? AND deleted_at IS NULL").bind(userId).first();
    if (!user) return jsonErr("Kullanıcı bulunamadı", 404);
    const lists = { watched: [], want: [], wont: [] };
    for (const lt of ["watched", "want", "wont"]) {
      const { results } = await env.DB.prepare(`SELECT movie_id, imdb_id, tmdb_id, title_original, title_tr, year, imdb_rating, user_rating, updated_at FROM user_movies WHERE user_id = ? AND list_type = ? ORDER BY updated_at DESC LIMIT 500`).bind(userId, lt).all();
      lists[lt] = results || [];
    }
    return jsonRes({ user, lists });
  }

  if (path.startsWith("/admin/user-ratings/") && request.method === "GET") {
    if (!isAuth) return jsonErr("Giriş gerekli", 401);
    const allowed = await userHasAnyPermission(env, sess, ["refresh_movie", "csv_import_cards", "user_manage"]);
    if (!allowed) return jsonErr("Bu işlem için yetkiniz yok", 403);
    const userId = parseInt(path.replace("/admin/user-ratings/", ""), 10);
    if (!userId) return jsonErr("userId gerekli", 400);
    const { results } = await env.DB.prepare(`SELECT movie_id, imdb_id, tmdb_id, title_original, title_tr, year, user_rating, list_type, updated_at FROM user_movies WHERE user_id = ? AND user_rating IS NOT NULL ORDER BY user_rating DESC, updated_at DESC`).bind(userId).all();
    return jsonRes({ ratings: results || [] });
  }

  if (path.startsWith("/movie-counts/") && request.method === "GET") { const movieId = decodeURIComponent(path.replace("/movie-counts/", "")); return jsonRes({ counts: await getMovieCounts(env, movieId) }); }
  if (path === "/membership" && request.method === "GET") {
    if (!isAuth) return jsonRes({ listType: null });
    const tmdbId = url.searchParams.get("tmdbId") || ""; const imdbIdRaw = cleanImdb(url.searchParams.get("imdbId") || "");
    const ids = []; if (tmdbId) { ids.push(`tmdb:${tmdbId}`); } if (imdbIdRaw) { ids.push(`imdb:${imdbIdRaw}`); }
    if (!ids.length) return jsonRes({ listType: null });
    try {
      const clauses = []; const params = [];
      if (ids.length) { const placeholders = ids.map(() => "?").join(","); clauses.push(`movie_id IN (${placeholders})`); params.push(...ids); }
      if (tmdbId) { clauses.push("tmdb_id = ?"); params.push(parseInt(tmdbId, 10) || tmdbId); }
      if (imdbIdRaw) { clauses.push("(imdb_id = ? OR imdb_id = ?)"); params.push(imdbIdRaw, `tt${imdbIdRaw}`); }
      const { results } = await env.DB.prepare(`SELECT list_type, user_rating FROM user_movies WHERE user_id = ? AND (${clauses.join(" OR ")}) ORDER BY CASE WHEN list_type IN ('watched','want','wont') THEN 0 ELSE 1 END, user_rating IS NOT NULL DESC`).bind(sess.user_id, ...params).all();
      const rows = results || [];
      const normal = rows.find(r => ["watched", "want", "wont"].includes(r.list_type));
      const savedRating = rows.find(r => r.user_rating != null);
      return jsonRes({
        listType: normal?.list_type || null,
        userRating: normal?.user_rating ?? savedRating?.user_rating ?? null
      });
    } catch (e) { return jsonRes({ listType: null }); }
  }
  if (path.startsWith("/public/") && request.method === "GET") {
    const username = decodeURIComponent(path.replace("/public/", ""));
    if (!env.DB) return jsonErr("DB yok", 503);
    const user = await env.DB.prepare("SELECT id, username, register_number, is_public, is_suspended, created_at, rating_visibility FROM users WHERE username = ? COLLATE NOCASE AND deleted_at IS NULL").bind(username).first();
    if (!user) return jsonErr("Kullanıcı bulunamadı", 404);
    if (user.is_suspended) return jsonErr("Bu profil gizli", 403);
    if (!user.is_public) return jsonErr("Bu profil gizli", 403);
    const ratingVisible = user.rating_visibility === "public";
    const lists = {};
    for (const lt of ["watched", "want", "wont"]) {
      const setting = await env.DB.prepare("SELECT is_public FROM user_list_settings WHERE user_id = ? AND list_type = ?").bind(user.id, lt).first().catch(() => null);
      const isPublicList = setting?.is_public === 1;
      if (!isPublicList) { lists[lt] = []; continue; }
      const { results } = await env.DB.prepare(`SELECT movie_id, title_original, title_tr, year, imdb_rating, user_rating FROM user_movies WHERE user_id = ? AND list_type = ? ORDER BY updated_at DESC LIMIT 200`).bind(user.id, lt).all();
      lists[lt] = (results || []).map(r => ({ ...r, user_rating: ratingVisible ? r.user_rating : null }));
    }
    return jsonRes({ user: { username: user.username, registerNumber: user.register_number, isPublic: true, ratingVisibility: user.rating_visibility }, lists });
  }
  if (!isAuth) return jsonErr("Giriş gerekli", 401);

  if (path === "/list-settings" && request.method === "GET") {
    try { const { results } = await env.DB.prepare("SELECT list_type, is_public FROM user_list_settings WHERE user_id = ?").bind(sess.user_id).all(); const settings = { watched: false, want: false, wont: false }; for (const r of results || []) settings[r.list_type] = !!r.is_public; return jsonRes({ settings }); } catch (e) { return jsonErr(e.message, 500); }
  }
  if (path === "/list-settings" && request.method === "PUT") {
    let body; try { body = await request.json(); } catch { return jsonErr("Geçersiz JSON", 400); }
    const lt = String(body.listType || "");
    if (!["watched", "want", "wont"].includes(lt)) return jsonErr("listType watched/want/wont olmalı", 400);
    const isPublic = !!body.isPublic;
    const now = Math.floor(Date.now() / 1000);
    try { await env.DB.prepare(`INSERT INTO user_list_settings (user_id, list_type, is_public, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT(user_id, list_type) DO UPDATE SET is_public = excluded.is_public, updated_at = excluded.updated_at`).bind(sess.user_id, lt, isPublic ? 1 : 0, now).run(); return jsonRes({ ok: true, listType: lt, isPublic }); }
    catch (e) { return jsonErr(e.message, 500); }
  }

  if (path === "/excluded-imdbs" && request.method === "GET") {
    const allowedLists = new Set(["watched", "want", "wont"]);
    const lt = [...new Set((url.searchParams.get("listType") || "").split(",").map(x => x.trim()).filter(x => allowedLists.has(x)))];
    if (!lt.length) return jsonRes({ imdbs: [], tmdbIds: [] });
    try { const placeholders = lt.map(() => "?").join(","); const { results } = await env.DB.prepare(`SELECT imdb_id, tmdb_id FROM user_movies WHERE user_id = ? AND list_type IN (${placeholders})`).bind(sess.user_id, ...lt).all(); const imdbs = [], tmdbIds = []; for (const r of results || []) { if (r.imdb_id) imdbs.push(cleanImdb(r.imdb_id)); if (r.tmdb_id) tmdbIds.push(String(r.tmdb_id)); } return jsonRes({ imdbs, tmdbIds }); }
    catch (e) { return jsonErr(e.message, 500); }
  }

  if (path === "/csv-search" && request.method === "POST") {
    let body; try { body = await request.json(); } catch { return jsonErr("Geçersiz JSON", 400); }
    const filters = body.filters && typeof body.filters === "object" ? body.filters : {};
    const limit = Math.min(50, Math.max(1, parseInt(body.limit) || 10));
    const query = String(body.query || "").trim();
    try { const movies = await searchCsvCache(env, filters, limit, sess.user_id, query); return jsonRes({ movies, total: movies.length }); }
    catch (e) { return jsonErr(e.message, 500); }
  }
  if (path === "/profile" && request.method === "GET") {
    const { results: perms } = await env.DB.prepare("SELECT permission FROM user_permissions WHERE user_id = ?").bind(sess.user_id).all();
    const userRow = await env.DB.prepare("SELECT rating_visibility FROM users WHERE id = ?").bind(sess.user_id).first();
    return jsonRes({ userId: sess.user_id, username: sess.username, registerNumber: sess.register_number, isAdmin: !!sess.is_admin, isPublic: !!sess.is_public, isApproved: !!sess.is_approved, isEmailVerified: !!sess.is_email_verified, ratingVisibility: userRow?.rating_visibility || "private", permissions: (perms || []).map(p => p.permission) });
  }
  if (path === "/profile" && request.method === "PUT") {
    let body; try { body = await request.json(); } catch { return jsonErr("Geçersiz JSON", 400); }
    const now = Math.floor(Date.now() / 1000);
    if (typeof body.isPublic === "boolean") await env.DB.prepare("UPDATE users SET is_public = ?, updated_at = ? WHERE id = ?").bind(body.isPublic ? 1 : 0, now, sess.user_id).run();
    if (typeof body.ratingVisibility === "string" && ["public", "private"].includes(body.ratingVisibility)) {
      await env.DB.prepare("UPDATE users SET rating_visibility = ?, updated_at = ? WHERE id = ?").bind(body.ratingVisibility, now, sess.user_id).run();
    }
    return jsonRes({ ok: true });
  }
  if (path === "/csv-import" && request.method === "POST") { let body; try { body = await request.json(); } catch { return jsonErr("Geçersiz JSON", 400); } const listType = String(body.listType || ""); const csvText = String(body.csvText || ""); if (!["watched", "want", "wont"].includes(listType)) return jsonErr("listType watched/want/wont olmalı", 400); if (!csvText) return jsonErr("csvText boş", 400); try { const r = await importCsvFile(env, sess.user_id, listType, csvText); return jsonRes({ ok: true, ...r }); } catch (e) { return jsonErr(e.message, 400); } }
  if (path.startsWith("/lists/") && request.method === "GET") {
    const lt = path.split("/")[2];
    if (!["watched", "want", "wont"].includes(lt)) return jsonErr("Geçersiz liste", 400);
    const page = Math.max(1, parseInt(url.searchParams.get("page") || "1"));
 const requestedPageSize = parseInt(url.searchParams.get("pageSize") || "10");
 const pageSize = Number.isFinite(requestedPageSize)
   ? Math.min(100, Math.max(10, requestedPageSize))
   : 10;
    const sortParam = url.searchParams.get("sort");
    const sort = sortParam === "imdb" ? "imdb_desc" : sortParam === "user" ? "user_desc" : "year_desc";
    try { return jsonRes(await getList(env, sess.user_id, lt, page, pageSize, sort)); } catch (e) { return jsonErr(e.message, 500); }
  }
  if (path === "/lists/add" && request.method === "POST") {
    let body; try { body = await request.json(); } catch { return jsonErr("Geçersiz JSON", 400); }
    const lt = String(body.listType || ""); const imdbId = cleanImdb(body.imdbId || ""); const movieId = String(body.movieId || (imdbId ? "imdb:" + imdbId : ""));
    if (!["watched", "want", "wont"].includes(lt)) return jsonErr("Geçersiz liste", 400);
    if (!movieId) return jsonErr("movieId veya imdbId gerekli", 400);
    let tmdbId = null; if (movieId.startsWith("tmdb:")) { const n = parseInt(movieId.slice(5)); if (Number.isFinite(n)) tmdbId = n; } else if (body.tmdbId) { const n = parseInt(body.tmdbId); if (Number.isFinite(n)) tmdbId = n; }
    const now = Math.floor(Date.now() / 1000);
    let saved = null;
    if (imdbId) saved = await env.DB.prepare("SELECT * FROM user_movies WHERE user_id = ? AND list_type = 'rating_only' AND (imdb_id = ? OR imdb_id = ?) ORDER BY updated_at DESC LIMIT 1").bind(sess.user_id, imdbId, `tt${imdbId}`).first();
    if (!saved && tmdbId != null) saved = await env.DB.prepare("SELECT * FROM user_movies WHERE user_id = ? AND list_type = 'rating_only' AND (tmdb_id = ? OR movie_id = ?) ORDER BY updated_at DESC LIMIT 1").bind(sess.user_id, tmdbId, `tmdb:${tmdbId}`).first();
    if (!saved) saved = await env.DB.prepare("SELECT * FROM user_movies WHERE user_id = ? AND list_type = 'rating_only' AND movie_id = ? LIMIT 1").bind(sess.user_id, movieId).first();

    const userRating = normalizeRatingValue(body.userRating) ?? saved?.user_rating ?? null;
    await env.DB.prepare(`INSERT INTO user_movies (user_id, list_type, movie_id, imdb_id, tmdb_id, title_original, title_tr, url, year, imdb_rating, imdb_votes, runtime, genres, directors, user_rating, source_meta_json, source, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'manual', ?, ?)
      ON CONFLICT(user_id, list_type, movie_id) DO UPDATE SET
      updated_at = excluded.updated_at,
      tmdb_id = COALESCE(excluded.tmdb_id, user_movies.tmdb_id),
      imdb_id = COALESCE(excluded.imdb_id, user_movies.imdb_id),
      title_original = COALESCE(excluded.title_original, user_movies.title_original),
      title_tr = COALESCE(excluded.title_tr, user_movies.title_tr),
      url = COALESCE(excluded.url, user_movies.url),
      year = COALESCE(excluded.year, user_movies.year),
      imdb_rating = COALESCE(excluded.imdb_rating, user_movies.imdb_rating),
      imdb_votes = COALESCE(excluded.imdb_votes, user_movies.imdb_votes),
      runtime = COALESCE(excluded.runtime, user_movies.runtime),
      genres = COALESCE(excluded.genres, user_movies.genres),
      directors = COALESCE(excluded.directors, user_movies.directors),
      user_rating = COALESCE(excluded.user_rating, user_movies.user_rating),
      source_meta_json = COALESCE(excluded.source_meta_json, user_movies.source_meta_json)`)
      .bind(sess.user_id, lt, movieId, imdbId || saved?.imdb_id || null,
        tmdbId ?? saved?.tmdb_id ?? null,
        body.titleOriginal || saved?.title_original || null,
        body.titleTr || saved?.title_tr || null,
        body.url || saved?.url || null,
        body.year || saved?.year || null,
        body.imdbRating || saved?.imdb_rating || null,
        body.imdbVotes || saved?.imdb_votes || null,
        body.runtime || saved?.runtime || null,
        body.genres || saved?.genres || null,
        body.directors || saved?.directors || null,
        userRating, saved?.source_meta_json || null, now, now).run();

    if (imdbId) await env.DB.prepare("DELETE FROM user_movies WHERE user_id = ? AND list_type IN ('watched','want','wont') AND (imdb_id = ? OR imdb_id = ? OR movie_id = ?) AND NOT (list_type = ? AND movie_id = ?)").bind(sess.user_id, imdbId, `tt${imdbId}`, movieId, lt, movieId).run();
    else await env.DB.prepare("DELETE FROM user_movies WHERE user_id = ? AND list_type IN ('watched','want','wont') AND movie_id = ? AND list_type <> ?").bind(sess.user_id, movieId, lt).run();

    if (saved) await env.DB.prepare("DELETE FROM user_movies WHERE user_id = ? AND list_type = 'rating_only' AND movie_id = ?").bind(sess.user_id, saved.movie_id).run();
    invalidateRatingStatsCache({ tmdbId, imdbId, movieId });
    invalidateRatingStatsCache({
      tmdbId: saved?.tmdb_id,
      imdbId: saved?.imdb_id,
      movieId: saved?.movie_id
    });
    return jsonRes({ ok: true });
  }
  if (path === "/rating" && request.method === "PUT") {
    let body; try { body = await request.json(); } catch { return jsonErr("Geçersiz JSON", 400); }
    const movieIdRaw = String(body.movieId || "");
    const imdbId = cleanImdb(body.imdbId || "");
    const tmdbId = body.tmdbId != null && !isNaN(parseInt(body.tmdbId, 10)) ? parseInt(body.tmdbId, 10) : null;
    if (!movieIdRaw && !imdbId && !tmdbId) return jsonErr("movieId, imdbId veya tmdbId gerekli", 400);
    const val = normalizeRatingValue(body.userRating);
    const now = Math.floor(Date.now() / 1000);
    let effMovieId = movieIdRaw;
    if (!effMovieId && imdbId) effMovieId = "imdb:" + imdbId;
    if (!effMovieId && tmdbId) effMovieId = "tmdb:" + tmdbId;
    try {
      let existing = null;
      const identity = [];
      const identityParams = [];
      if (imdbId) {
        identity.push("(imdb_id = ? OR imdb_id = ? OR movie_id = ?)");
        identityParams.push(imdbId, `tt${imdbId}`, `imdb:${imdbId}`);
      }
      if (tmdbId != null) {
        identity.push("(tmdb_id = ? OR movie_id = ?)");
        identityParams.push(tmdbId, `tmdb:${tmdbId}`);
      }
      if (effMovieId) {
        identity.push("movie_id = ?");
        identityParams.push(effMovieId);
      }
      if (identity.length) {
        existing = await env.DB.prepare(
          `SELECT list_type, tmdb_id, imdb_id, movie_id FROM user_movies
           WHERE user_id = ? AND (${identity.join(" OR ")})
           ORDER BY CASE WHEN list_type IN ('watched','want','wont') THEN 0 ELSE 1 END,
                    updated_at DESC
           LIMIT 1`
        ).bind(sess.user_id, ...identityParams).first();
      }

      if (existing && existing.list_type !== "rating_only") {
      await env.DB.prepare(
        `UPDATE user_movies SET user_rating = ?, updated_at = ?
         WHERE user_id = ? AND list_type = ? AND (${identity.join(" OR ")})`
      ).bind(val, now, sess.user_id, existing.list_type, ...identityParams).run();

      await env.DB.prepare(
        `DELETE FROM user_movies WHERE user_id = ? AND list_type = 'rating_only' AND (${identity.join(" OR ")})`
      ).bind(sess.user_id, ...identityParams).run();

    } else if (existing?.list_type === "rating_only" && val != null) {
      await env.DB.prepare(
        `UPDATE user_movies SET user_rating = ?, updated_at = ?
         WHERE user_id = ? AND list_type = 'rating_only' AND (${identity.join(" OR ")})`
      ).bind(val, now, sess.user_id, ...identityParams).run();

    } else if (existing?.list_type === "rating_only" && val == null) {
      await env.DB.prepare(
        `DELETE FROM user_movies WHERE user_id = ? AND list_type = 'rating_only' AND (${identity.join(" OR ")})`
      ).bind(sess.user_id, ...identityParams).run();

    } else if (!existing && val != null) {
      await env.DB.prepare(`INSERT INTO user_movies
        (user_id, list_type, movie_id, imdb_id, tmdb_id, title_original, title_tr, year, imdb_rating, user_rating, source, created_at, updated_at)
        VALUES (?, 'rating_only', ?, ?, ?, ?, ?, ?, ?, ?, 'manual', ?, ?)
        ON CONFLICT(user_id, list_type, movie_id)
        DO UPDATE SET user_rating = excluded.user_rating, updated_at = excluded.updated_at`
      ).bind(sess.user_id, effMovieId, imdbId || null, tmdbId,
        body.titleOriginal || null, body.titleTr || null, body.year || null,
        body.imdbRating || null, val, now, now).run();
    }
    invalidateRatingStatsCache({ tmdbId, imdbId, movieId: effMovieId });
    invalidateRatingStatsCache({
      tmdbId: existing?.tmdb_id,
      imdbId: existing?.imdb_id,
      movieId: existing?.movie_id
    });
      return jsonRes({ ok: true });
    } catch (e) { return jsonErr(e.message, 500); }
  }
  if (path.startsWith("/lists/remove/") && request.method === "DELETE") {
    const parts = path.replace("/lists/remove/", "").split("/");
    const lt = parts[0];
    const movieId = decodeURIComponent(parts.slice(1).join("/"));

    if (!["watched", "want", "wont"].includes(lt)) {
        return jsonErr("Geçersiz liste", 400);
    }

    let body = {};
    try {
        body = await request.json();
    } catch {}

    const keepRating = body.keepRating !== false;
    const clearMarks = body.clearMarks === true;

    const existing = await env.DB.prepare(`
        SELECT user_rating, tmdb_id, imdb_id
        FROM user_movies
        WHERE user_id = ? AND list_type = ? AND movie_id = ?
    `).bind(sess.user_id, lt, movieId).first();

    const rating = existing?.user_rating ?? null;
    const now = Math.floor(Date.now() / 1000);

    // Kullanıcı puanı varsa rating_only listesinde koru.
    if (keepRating && rating != null) {
        await env.DB.prepare(`
            INSERT INTO user_movies (
                user_id, list_type, movie_id, imdb_id, tmdb_id,
                title_original, title_tr, url, year, imdb_rating,
                imdb_votes, runtime, genres, directors, user_rating,
                source_meta_json, source, created_at, updated_at
            )
            SELECT
                user_id, 'rating_only', movie_id, imdb_id, tmdb_id,
                title_original, title_tr, url, year, imdb_rating,
                imdb_votes, runtime, genres, directors, user_rating,
                source_meta_json, source, created_at, ?
            FROM user_movies
            WHERE user_id = ? AND list_type = ? AND movie_id = ?
            ON CONFLICT(user_id, list_type, movie_id)
            DO UPDATE SET
                imdb_id = COALESCE(excluded.imdb_id, user_movies.imdb_id),
                tmdb_id = COALESCE(excluded.tmdb_id, user_movies.tmdb_id),
                title_original = COALESCE(excluded.title_original, user_movies.title_original),
                title_tr = COALESCE(excluded.title_tr, user_movies.title_tr),
                url = COALESCE(excluded.url, user_movies.url),
                year = COALESCE(excluded.year, user_movies.year),
                imdb_rating = COALESCE(excluded.imdb_rating, user_movies.imdb_rating),
                imdb_votes = COALESCE(excluded.imdb_votes, user_movies.imdb_votes),
                runtime = COALESCE(excluded.runtime, user_movies.runtime),
                genres = COALESCE(excluded.genres, user_movies.genres),
                directors = COALESCE(excluded.directors, user_movies.directors),
                user_rating = COALESCE(excluded.user_rating, user_movies.user_rating),
                source_meta_json = COALESCE(excluded.source_meta_json, user_movies.source_meta_json),
                updated_at = excluded.updated_at
        `).bind(now, sess.user_id, lt, movieId).run();
    }

    // Asıl listedeki kaydı kaldır.
    await env.DB.prepare(`
        DELETE FROM user_movies
        WHERE user_id = ? AND list_type = ? AND movie_id = ?
    `).bind(sess.user_id, lt, movieId).run();

    // İstenmişse oy/işaret kayıtlarını da sil.
    if (clearMarks) {
        try {
            await env.DB.prepare(`
                DELETE FROM user_votes
                WHERE user_id = ? AND movie_id = ?
            `).bind(sess.user_id, movieId).run();
        } catch (e) {
            console.warn("user_votes temizleme:", e.message);
        }
    }

    invalidateRatingStatsCache({ movieId });
    invalidateRatingStatsCache({
      tmdbId: existing?.tmdb_id,
      imdbId: existing?.imdb_id,
      movieId
    });
    return jsonRes({ ok: true, ratingPreserved: keepRating && rating != null });
}
  if (path === "/lists/refresh" && request.method === "POST") { let body; try { body = await request.json(); } catch { return jsonErr("Geçersiz JSON", 400); } const listType = String(body.listType || ""); const page = Math.max(1, parseInt(body.page || "1")); if (!["watched", "want", "wont"].includes(listType)) return jsonErr("Geçersiz liste", 400); const { items } = await getList(env, sess.user_id, listType, page, 10, "year_desc"); return jsonRes({ ok: true, items }); }
  if (path.startsWith("/refresh-card/") && request.method === "POST") {
    const allowed = await userHasAnyPermission(env, sess, ["refresh_movie", "csv_import_cards"]);
    if (!allowed) return jsonErr("Bu işlem için yetkiniz yok", 403);
    const imdbId = cleanImdb(decodeURIComponent(path.replace("/refresh-card/", "")));
    if (!imdbId) return jsonErr("imdb_id gerekli", 400);
    // === FAZ 8 C-2: CSV'den metadata çek (disambiguation için) ===
    let meta = {};
    try {
      const row = await env.DB.prepare("SELECT title_original, title_tr, year FROM user_movies WHERE (imdb_id = ? OR imdb_id = ?) LIMIT 1").bind(imdbId, `tt${imdbId}`).first();
      if (row) meta = { title_original: row.title_original, title_tr: row.title_tr, year: row.year };
    } catch (e) { console.warn("refresh-card meta:", e.message); }
    try {
      const r = await refreshCardForImdb(env, imdbId, request.signal, meta);
      await env.DB.prepare("UPDATE user_movies SET tmdb_id = ?, updated_at = ? WHERE (imdb_id = ? OR imdb_id = ?)").bind(r.tmdbId, Math.floor(Date.now() / 1000), imdbId, `tt${imdbId}`).run();
      return jsonRes({ ok: true, tmdbId: r.tmdbId, movie: r.movie, disambiguation: r.disambiguation, message: "Film kartı oluşturuldu/güncellendi." });
    } catch (e) {
      // === FAZ 8 C-2: Ambiguous → 422 + candidates listesi ===
      if (e.code === "ambiguous") {
        return jsonRes({ ok: false, error: e.message, code: "ambiguous", candidates: e.candidates || [] }, 422);
      }
      return jsonErr("İşlem başarısız: " + e.message, 500);
    }
  }
  if (path.startsWith("/votes/") && request.method === "GET") { const movieId = decodeURIComponent(path.replace("/votes/", "")); const { results } = await env.DB.prepare("SELECT field, value_json, updated_at FROM user_votes WHERE user_id = ? AND movie_id = ?").bind(sess.user_id, movieId).all(); const votes = {}; for (const r of results || []) votes[r.field] = safeJSON(r.value_json, null); return jsonRes({ movieId, votes }); }
  if (path.startsWith("/votes/") && request.method === "PUT") {
    const movieId = decodeURIComponent(path.replace("/votes/", ""));
    let body; try { body = await request.json(); } catch { return jsonErr("Geçersiz JSON", 400); }
    const votes = body.votes && typeof body.votes === "object" ? body.votes : {};
    const now = Math.floor(Date.now() / 1000);
    const stmts = [];
    for (const [field, value] of Object.entries(votes)) {
      if (value === null || value === undefined) stmts.push(env.DB.prepare("DELETE FROM user_votes WHERE user_id = ? AND movie_id = ? AND field = ?").bind(sess.user_id, movieId, field));
      else stmts.push(env.DB.prepare(`INSERT INTO user_votes (user_id, movie_id, field, value_json, updated_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(user_id, movie_id, field) DO UPDATE SET value_json = excluded.value_json, updated_at = excluded.updated_at`).bind(sess.user_id, movieId, field, JSON.stringify(value), now));
    }
    if (stmts.length) await env.DB.batch(stmts);
    return jsonRes({ ok: true });
  }
  if (path === "/votes" && request.method === "GET") {
    const { results } = await env.DB.prepare("SELECT movie_id, field, value_json, updated_at FROM user_votes WHERE user_id = ? ORDER BY updated_at DESC LIMIT 500").bind(sess.user_id).all();
    return jsonRes({ votes: results || [] });
  }
  if (path.startsWith("/votes-aggregate/") && request.method === "GET") {
    const movieId = decodeURIComponent(path.replace("/votes-aggregate/", ""));
    const { results } = await env.DB.prepare("SELECT field, value_json FROM user_votes WHERE movie_id = ?").bind(movieId).all();
    const fieldMap = {}; let totalVotes = 0;
    for (const r of results || []) { const val = safeJSON(r.value_json, null); if (!fieldMap[r.field]) fieldMap[r.field] = new Map(); const key = JSON.stringify(val); fieldMap[r.field].set(key, (fieldMap[r.field].get(key) || 0) + 1); totalVotes++; }
    const aggregated = {};
    for (const [field, counts] of Object.entries(fieldMap)) { let bestKey = null, bestCount = 0; for (const [k, c] of counts) if (c > bestCount) { bestKey = k; bestCount = c; } aggregated[field] = { value: safeJSON(bestKey, null), count: bestCount, total: totalVotes }; }
    return jsonRes({ movieId, aggregated });
  }
  if (path === "/global-search" && request.method === "POST") {
    let body; try { body = await request.json(); } catch { return jsonErr("Geçersiz JSON", 400); }
    const filters = body.filters && typeof body.filters === "object" ? body.filters : {};
    const limit = Math.min(50, Math.max(1, parseInt(body.limit) || 10));
    const query = String(body.query || "").trim();
    try {
      const clauses = [];
      const params = [];
      if (filters.yearMin != null) { clauses.push("year >= ?"); params.push(parseInt(filters.yearMin)); }
      if (filters.yearMax != null) { clauses.push("year <= ?"); params.push(parseInt(filters.yearMax)); }
      if (filters.runtimeMin != null) { clauses.push("runtime >= ?"); params.push(parseInt(filters.runtimeMin)); }
      if (filters.runtimeMax != null) { clauses.push("runtime <= ?"); params.push(parseInt(filters.runtimeMax)); }
      if (filters.imdbMin > 0) { clauses.push("imdb_rating >= ?"); params.push(Number(filters.imdbMin)); }
      if (filters.imdbMax < 10) { clauses.push("imdb_rating <= ?"); params.push(Number(filters.imdbMax)); }
      if (filters.imdbVotesMin != null) { clauses.push("imdb_votes >= ?"); params.push(parseInt(filters.imdbVotesMin)); }
      const genreLabels = (filters.genres?.include || []).map(x => x.label || x).filter(Boolean);
      for (const g of genreLabels.slice(0, 3)) { clauses.push("genres LIKE ?"); params.push(`%${g}%`); }
      const directorLabels = (filters.director?.include || []).map(x => x.label || x).filter(Boolean);
      for (const d of directorLabels.slice(0, 2)) { clauses.push("directors LIKE ?"); params.push(`%${d}%`); }
      if (query) { clauses.push("(title_original LIKE ? OR title_tr LIKE ?)"); params.push(`%${query}%`, `%${query}%`); }
      const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
      const { results } = await env.DB.prepare(`SELECT movie_id, imdb_id, tmdb_id, title_original, title_tr, year, runtime, imdb_rating, imdb_votes, genres, directors, data_json FROM global_movies ${where} ORDER BY imdb_votes DESC, imdb_rating DESC LIMIT ?`).bind(...params, limit).all();
      const movies = (results || []).map(r => {
        const d = safeJSON(r.data_json, {}) || {};
        return {
          ...d,
          id: r.tmdb_id != null ? r.tmdb_id : (d.id != null ? d.id : "global:" + r.movie_id),
          global_movie_id: r.movie_id,
          title_original: r.title_original || d.original_title || d.title || null,
          title: r.title_tr || d.title || r.title_original || null,
          release_date: r.year ? String(r.year) : d.release_date || null,
          runtime: r.runtime || d.runtime || null,
          imdbRating: r.imdb_rating || d.imdbRating || null,
          imdbVotes: r.imdb_votes != null ? String(r.imdb_votes) : d.imdbVotes || null,
          genres: r.genres ? String(r.genres).split(",").map(s => s.trim()).filter(Boolean) : d.genres || null,
          director: r.directors ? String(r.directors).split(",").map(n => ({ name: n.trim(), profile_path: null })).filter(p => p.name) : d.director || null,
          _global_movie: true
        };
      });
      return jsonRes({ ok: true, movies, total: movies.length });
    } catch (e) { return jsonErr(e.message, 500); }
  }

  return jsonErr("Kullanıcı route bulunamadı", 404);
}
