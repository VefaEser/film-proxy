// DOSYA: users.js
// Kullanıcı profili, listeler, CSV import, oylar + CSV kartlarını movie_profiles ile eşleştirme.
import { getCurrentUserWithAdminBridge } from "./auth.js";
import { handleMovieDetails } from "./research.js";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type,Authorization",
  "Access-Control-Allow-Credentials": "true"
};
function jsonRes(data, status = 200) { return new Response(JSON.stringify(data), { status, headers: { ...CORS, "Content-Type": "application/json; charset=utf-8" } }); }
function jsonErr(msg, status = 500) { return jsonRes({ error: String(msg) }, status); }
function safeJSON(t, fb = null) { try { return JSON.parse(t); } catch { return fb; } }

async function userHasAnyPermission(env, sess, perms) {
  if (sess.is_admin) return true;
  try {
    const placeholders = perms.map(() => "?").join(",");
    const row = await env.DB.prepare(`SELECT 1 FROM user_permissions WHERE user_id = ? AND permission IN (${placeholders}) LIMIT 1`).bind(sess.user_id, ...perms).first();
    return !!row;
  } catch { return false; }
}

function parseCsv(text) {
  const lines = String(text || "").replace(/^\uFEFF/, "").trim().split(/\r?\n/);
  if (!lines.length) return [];
  const parseRow = (line) => {
    const out = []; let cur = ""; let q = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (c === '"') { if (q && line[i + 1] === '"') { cur += '"'; i++; } else q = !q; }
      else if (c === "," && !q) { out.push(cur); cur = ""; }
      else cur += c;
    }
    out.push(cur); return out;
  };
  const headers = parseRow(lines[0]).map(h => h.trim().replace(/^"|"$/g, ""));
  const idx = (name) => headers.findIndex(h => h.toLowerCase() === name.toLowerCase());
  const iConst = idx("Const"), iOrig = idx("Original Title"), iTitle = idx("Title"), iUrl = idx("URL"),
    iRating = idx("Imdb Rating"), iVotes = idx("Num Votes"), iYear = idx("Year"),
    iGenres = idx("Genres"), iDirectors = idx("Directors");
  const iRuntime = (() => {
    for (const c of ["Runtime", "Runtime (mins)", "Duration", "Duration (mins)"]) { const i = idx(c); if (i >= 0) return i; }
    return -1;
  })();
  const out = [];
  for (let li = 1; li < lines.length; li++) {
    const cols = parseRow(lines[li]);
    const imdbId = iConst >= 0 ? (cols[iConst] || "").trim() : "";
    if (!imdbId) continue;
    out.push({
      imdbId,
      titleOriginal: iOrig >= 0 ? (cols[iOrig] || "").trim() : "",
      titleTr: iTitle >= 0 ? (cols[iTitle] || "").trim() : "",
      url: iUrl >= 0 ? (cols[iUrl] || "").trim() : "",
      year: iYear >= 0 ? parseInt(cols[iYear]) || null : null,
      imdbRating: iRating >= 0 ? parseFloat(cols[iRating]) || null : null,
      imdbVotes: iVotes >= 0 ? parseInt(String(cols[iVotes] || "").replace(/[^\d]/g, "")) || null : null,
      runtime: iRuntime >= 0 ? (parseInt(String(cols[iRuntime] || "").replace(/[^\d]/g, "")) || null) : null,
      genres: iGenres >= 0 ? (cols[iGenres] || "").trim() : "",
      directors: iDirectors >= 0 ? (cols[iDirectors] || "").trim() : ""
    });
  }
  return out;
}
function movieIdFromImdb(imdbId) { return "imdb:" + String(imdbId || "").replace(/^tt/, ""); }

async function importCsv(env, userId, listType, items) {
  if (!env.DB) throw new Error("DB yok");
  const now = Math.floor(Date.now() / 1000);
  let added = 0, skipped = 0, conflicts = 0;
  const allExisting = await env.DB.prepare("SELECT list_type, imdb_id FROM user_movies WHERE user_id = ?").bind(userId).all();
  const byImdb = new Map();
  for (const r of allExisting.results || []) { if (!byImdb.has(r.imdb_id)) byImdb.set(r.imdb_id, new Set()); byImdb.get(r.imdb_id).add(r.list_type); }
  const stmts = [];
  for (const it of items) {
    const conflicting = byImdb.get(it.imdbId);
    if (conflicting && [...conflicting].some(t => t !== listType)) { conflicts++; continue; }
    stmts.push(env.DB.prepare(
      `INSERT INTO user_movies (user_id, list_type, movie_id, imdb_id, title_original, title_tr, url, year, imdb_rating, imdb_votes, runtime, genres, directors, source, source_meta_json, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'csv', NULL, ?, ?)
       ON CONFLICT(user_id, list_type, movie_id) DO UPDATE SET
         title_original = excluded.title_original, title_tr = excluded.title_tr, url = excluded.url, year = excluded.year,
         imdb_rating = excluded.imdb_rating, imdb_votes = excluded.imdb_votes, runtime = excluded.runtime,
         genres = excluded.genres, directors = excluded.directors, source = excluded.source, updated_at = excluded.updated_at`
    ).bind(userId, listType, movieIdFromImdb(it.imdbId), it.imdbId, it.titleOriginal, it.titleTr, it.url || null, it.year, it.imdbRating, it.imdbVotes, it.runtime, it.genres, it.directors, now, now));
    added++;
  }
  for (let i = 0; i < stmts.length; i += 40) await env.DB.batch(stmts.slice(i, i + 40));
  return { added, skipped, conflicts };
}

async function importCsvFile(env, userId, listType, csvText) {
  const items = parseCsv(csvText);
  if (!items.length) throw new Error("CSV'de geçerli film bulunamadı");
  const res = await importCsv(env, userId, listType, items);
  const hash = String(items.length) + "|" + (items[0]?.imdbId || "");
  await env.DB.prepare(
    `INSERT INTO csv_imports (user_id, list_type, filename, content_hash, row_count, conflicts, imported_at) VALUES (?, ?, NULL, ?, ?, ?, ?)`
  ).bind(userId, listType, hash, items.length, res.conflicts, Math.floor(Date.now() / 1000)).run();
  return { ...res, total: items.length };
}

async function getList(env, userId, listType, page = 1, pageSize = 10, sort = "year_desc") {
  const offset = (page - 1) * pageSize;
  const orderBy = sort === "imdb_desc" ? "imdb_rating DESC, year DESC" : "year DESC, imdb_rating DESC";
  const { results } = await env.DB.prepare(
    `SELECT movie_id, imdb_id, tmdb_id, title_original, title_tr, url, year, imdb_rating, imdb_votes, runtime, genres, directors, source
     FROM user_movies WHERE user_id = ? AND list_type = ? ORDER BY ${orderBy} LIMIT ? OFFSET ?`
  ).bind(userId, listType, pageSize, offset).all();
  const items = results || [];

  // tmdb_id + movie_id prefix'inden profil eşleşmesi
  const tmdbCandidates = new Set();
  for (const it of items) {
    if (it.tmdb_id) tmdbCandidates.add(String(it.tmdb_id));
    else if (it.movie_id && it.movie_id.startsWith("tmdb:")) {
      const n = parseInt(it.movie_id.slice(5));
      if (Number.isFinite(n)) tmdbCandidates.add(String(n));
    }
  }
  const profileByTmdbId = new Map();
  if (tmdbCandidates.size) {
    const arr = [...tmdbCandidates];
    const placeholders = arr.map(() => "?").join(",");
    const { results: profiles } = await env.DB.prepare(
      `SELECT movie_id, data_json FROM movie_profiles WHERE movie_id IN (${placeholders})`
    ).bind(...arr).all();
    for (const p of profiles || []) {
      try { profileByTmdbId.set(String(p.movie_id), { ...JSON.parse(p.data_json), id: String(p.movie_id) }); } catch {}
    }
  }

  // tmdb_id olmayanlar için imdb_id ile fallback (data_json içindeki imdbID)
  const needFallback = items.filter(it => {
    const key = it.tmdb_id ? String(it.tmdb_id) : (it.movie_id?.startsWith("tmdb:") ? String(parseInt(it.movie_id.slice(5))) : null);
    if (key && profileByTmdbId.has(key)) return false;
    return !!it.imdb_id;
  });
  const profileByImdb = new Map();
  if (needFallback.length) {
    const imdbIds = needFallback.map(it => `tt${String(it.imdb_id).replace(/^tt/, "")}`);
    const placeholders = imdbIds.map(() => "?").join(",");
    try {
      const { results: profilesByImdb } = await env.DB.prepare(
        `SELECT movie_id, data_json FROM movie_profiles WHERE json_extract(data_json, '$.imdbID') IN (${placeholders})`
      ).bind(...imdbIds).all();
      for (const p of profilesByImdb || []) {
        try {
          const data = JSON.parse(p.data_json);
          const pImdb = data.imdbID || data.imdb_id;
          if (pImdb) profileByImdb.set(pImdb, { ...data, id: String(p.movie_id) });
        } catch {}
      }
    } catch (e) { console.warn("imdb fallback:", e.message); }
  }

  const enriched = items.map(it => {
    let profile = null;
    const tmdbKey = it.tmdb_id ? String(it.tmdb_id) : (it.movie_id?.startsWith("tmdb:") ? String(parseInt(it.movie_id.slice(5))) : null);
    if (tmdbKey) profile = profileByTmdbId.get(tmdbKey) || null;
    if (!profile && it.imdb_id) {
      const imdbFull = `tt${String(it.imdb_id).replace(/^tt/, "")}`;
      profile = profileByImdb.get(imdbFull) || null;
    }
    return { ...it, profile: profile || null, needs_card: !profile };
  });

  const { results: countRows } = await env.DB.prepare("SELECT COUNT(*) AS c FROM user_movies WHERE user_id = ? AND list_type = ?").bind(userId, listType).all();
  return { items: enriched, total: countRows[0]?.c || 0, page, pageSize };
}

async function getMovieCounts(env, movieId) {
  if (!env.DB) return { watched: 0, want: 0, wont: 0 };
  const { results } = await env.DB.prepare(`SELECT list_type, COUNT(*) AS c FROM user_movies WHERE movie_id = ? GROUP BY list_type`).bind(movieId).all();
  const out = { watched: 0, want: 0, wont: 0 };
  for (const r of results || []) out[r.list_type] = r.c;
  return out;
}

async function refreshCardForImdb(env, imdbId, signal) {
  if (!env.TMDB_API_KEY) throw new Error("TMDB_API_KEY tanımlı değil");
  const cleanId = String(imdbId || "").replace(/^tt/, "");
  if (!cleanId) throw new Error("imdb_id gerekli");
  const findUrl = new URL(`https://api.themoviedb.org/3/find/tt${cleanId}`);
  findUrl.searchParams.set("api_key", env.TMDB_API_KEY);
  findUrl.searchParams.set("external_source", "imdb_id");
  findUrl.searchParams.set("language", "tr-TR");
  const findRes = await fetch(findUrl.toString(), { signal });
  if (!findRes.ok) throw new Error(`TMDB find HTTP ${findRes.status}`);
  const findData = await findRes.json();
  const tmdbMovie = (findData.movie_results || [])[0];
  if (!tmdbMovie) throw new Error("Film TMDB'de bulunamadı");
  const result = await handleMovieDetails(env, {
    movie: {
      id: tmdbMovie.id, imdb_id: `tt${cleanId}`,
      title: tmdbMovie.title, original_title: tmdbMovie.original_title,
      release_date: tmdbMovie.release_date, overview: tmdbMovie.overview,
      poster_path: tmdbMovie.poster_path, vote_average: tmdbMovie.vote_average,
      vote_count: tmdbMovie.vote_count, genre_ids: tmdbMovie.genre_ids || []
    }, forceAll: false
  }, signal);
  return { tmdbId: tmdbMovie.id, movie: result.movie };
}

export async function handleUser(request, env, ctx) {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  const url = new URL(request.url);
  const path = url.pathname.replace(/^\/user/, "");
  const sess = await getCurrentUserWithAdminBridge(env, request);
  const isAuth = !!sess && !sess.is_suspended;

  if (path.startsWith("/movie-counts/") && request.method === "GET") {
    const movieId = decodeURIComponent(path.replace("/movie-counts/", ""));
    return jsonRes({ counts: await getMovieCounts(env, movieId) });
  }

  if (path.startsWith("/public/") && request.method === "GET") {
    const username = decodeURIComponent(path.replace("/public/", ""));
    if (!env.DB) return jsonErr("DB yok", 503);
    const user = await env.DB.prepare("SELECT id, username, register_number, is_public, is_suspended, created_at FROM users WHERE username = ? COLLATE NOCASE AND deleted_at IS NULL").bind(username).first();
    if (!user) return jsonErr("Kullanıcı bulunamadı", 404);
    if (user.is_suspended) return jsonErr("Bu profil gizli", 403);
    if (!user.is_public) return jsonErr("Bu profil gizli", 403);
    const lists = {};
    for (const lt of ["watched", "want", "wont"]) {
      const { results } = await env.DB.prepare(
        `SELECT movie_id, title_original, title_tr, year, imdb_rating FROM user_movies WHERE user_id = ? AND list_type = ? ORDER BY updated_at DESC LIMIT 200`
      ).bind(user.id, lt).all();
      lists[lt] = results || [];
    }
    return jsonRes({ user: { username: user.username, registerNumber: user.register_number, isPublic: true }, lists });
  }

  if (!isAuth) return jsonErr("Giriş gerekli", 401);

  if (path === "/profile" && request.method === "GET") {
    const { results: perms } = await env.DB.prepare("SELECT permission FROM user_permissions WHERE user_id = ?").bind(sess.user_id).all();
    return jsonRes({
      userId: sess.user_id, username: sess.username, registerNumber: sess.register_number,
      isAdmin: !!sess.is_admin, isPublic: !!sess.is_public, isApproved: !!sess.is_approved, isEmailVerified: !!sess.is_email_verified,
      permissions: (perms || []).map(p => p.permission)
    });
  }
  if (path === "/profile" && request.method === "PUT") {
    let body; try { body = await request.json(); } catch { return jsonErr("Geçersiz JSON", 400); }
    if (typeof body.isPublic === "boolean") {
      await env.DB.prepare("UPDATE users SET is_public = ?, updated_at = ? WHERE id = ?").bind(body.isPublic ? 1 : 0, Math.floor(Date.now() / 1000), sess.user_id).run();
    }
    return jsonRes({ ok: true });
  }
  if (path === "/csv-import" && request.method === "POST") {
    let body; try { body = await request.json(); } catch { return jsonErr("Geçersiz JSON", 400); }
    const listType = String(body.listType || "");
    const csvText = String(body.csvText || "");
    if (!["watched", "want", "wont"].includes(listType)) return jsonErr("listType watched/want/wont olmalı", 400);
    if (!csvText) return jsonErr("csvText boş", 400);
    try { const r = await importCsvFile(env, sess.user_id, listType, csvText); return jsonRes({ ok: true, ...r }); }
    catch (e) { return jsonErr(e.message, 400); }
  }
  if (path.startsWith("/lists/") && request.method === "GET") {
    const lt = path.split("/")[2];
    if (!["watched", "want", "wont"].includes(lt)) return jsonErr("Geçersiz liste", 400);
    const page = Math.max(1, parseInt(url.searchParams.get("page") || "1"));
    const sort = url.searchParams.get("sort") === "imdb" ? "imdb_desc" : "year_desc";
    try { return jsonRes(await getList(env, sess.user_id, lt, page, 10, sort)); }
    catch (e) { return jsonErr(e.message, 500); }
  }
  if (path === "/lists/add" && request.method === "POST") {
    let body; try { body = await request.json(); } catch { return jsonErr("Geçersiz JSON", 400); }
    const lt = String(body.listType || "");
    const imdbId = String(body.imdbId || "").replace(/^tt/, "");
    const movieId = String(body.movieId || (imdbId ? "imdb:" + imdbId : ""));
    if (!["watched", "want", "wont"].includes(lt)) return jsonErr("Geçersiz liste", 400);
    if (!movieId) return jsonErr("movieId veya imdbId gerekli", 400);
    let tmdbId = null;
    if (movieId.startsWith("tmdb:")) { const n = parseInt(movieId.slice(5)); if (Number.isFinite(n)) tmdbId = n; }
    else if (body.tmdbId) { const n = parseInt(body.tmdbId); if (Number.isFinite(n)) tmdbId = n; }
    const now = Math.floor(Date.now() / 1000);
    await env.DB.prepare("DELETE FROM user_movies WHERE user_id = ? AND movie_id = ? AND list_type != ?").bind(sess.user_id, movieId, lt).run();
    await env.DB.prepare(
      `INSERT INTO user_movies (user_id, list_type, movie_id, imdb_id, tmdb_id, title_original, title_tr, url, year, imdb_rating, imdb_votes, runtime, genres, directors, source, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'manual', ?, ?)
       ON CONFLICT(user_id, list_type, movie_id) DO UPDATE SET updated_at = excluded.updated_at, tmdb_id = COALESCE(excluded.tmdb_id, user_movies.tmdb_id)`
    ).bind(sess.user_id, lt, movieId, imdbId || null, tmdbId, body.titleOriginal || null, body.titleTr || null, body.url || null,
      body.year || null, body.imdbRating || null, body.imdbVotes || null, body.runtime || null,
      body.genres || null, body.directors || null, now, now).run();
    return jsonRes({ ok: true });
  }
  if (path.startsWith("/lists/remove/") && request.method === "DELETE") {
    const parts = path.replace("/lists/remove/", "").split("/");
    const lt = parts[0], movieId = decodeURIComponent(parts.slice(1).join("/"));
    if (!["watched", "want", "wont"].includes(lt)) return jsonErr("Geçersiz liste", 400);
    await env.DB.prepare("DELETE FROM user_movies WHERE user_id = ? AND list_type = ? AND movie_id = ?").bind(sess.user_id, lt, movieId).run();
    return jsonRes({ ok: true });
  }
  if (path === "/lists/refresh" && request.method === "POST") {
    let body; try { body = await request.json(); } catch { return jsonErr("Geçersiz JSON", 400); }
    const listType = String(body.listType || "");
    const page = Math.max(1, parseInt(body.page || "1"));
    if (!["watched", "want", "wont"].includes(listType)) return jsonErr("Geçersiz liste", 400);
    const { items } = await getList(env, sess.user_id, listType, page, 10, "year_desc");
    return jsonRes({ ok: true, items });
  }
  // CSV'deki bir film için movie_profiles kartı oluştur veya yenile
  if (path.startsWith("/refresh-card/") && request.method === "POST") {
    const allowed = await userHasAnyPermission(env, sess, ["refresh_movie", "csv_import_cards"]);
    if (!allowed) return jsonErr("Bu işlem için yetkiniz yok", 403);
    const imdbId = decodeURIComponent(path.replace("/refresh-card/", ""));
    if (!imdbId) return jsonErr("imdb_id gerekli", 400);
    try {
      const r = await refreshCardForImdb(env, imdbId, request.signal);
      const cleanId = String(imdbId).replace(/^tt/, "");
      await env.DB.prepare(
        "UPDATE user_movies SET tmdb_id = ?, updated_at = ? WHERE user_id = ? AND imdb_id = ?"
      ).bind(r.tmdbId, Math.floor(Date.now() / 1000), sess.user_id, cleanId).run();
      return jsonRes({ ok: true, tmdbId: r.tmdbId, message: "Film kartı oluşturuldu/güncellendi." });
    } catch (e) { return jsonErr("İşlem başarısız: " + e.message, 500); }
  }
  if (path.startsWith("/votes/") && request.method === "GET") {
    const movieId = decodeURIComponent(path.replace("/votes/", ""));
    const { results } = await env.DB.prepare("SELECT field, value_json, updated_at FROM user_votes WHERE user_id = ? AND movie_id = ?").bind(sess.user_id, movieId).all();
    const votes = {};
    for (const r of results || []) votes[r.field] = safeJSON(r.value_json, null);
    return jsonRes({ movieId, votes });
  }
  if (path.startsWith("/votes/") && request.method === "PUT") {
    const movieId = decodeURIComponent(path.replace("/votes/", ""));
    let body; try { body = await request.json(); } catch { return jsonErr("Geçersiz JSON", 400); }
    const votes = body.votes && typeof body.votes === "object" ? body.votes : {};
    const now = Math.floor(Date.now() / 1000);
    const stmts = [];
    for (const [field, value] of Object.entries(votes)) {
      if (value === null || value === undefined) stmts.push(env.DB.prepare("DELETE FROM user_votes WHERE user_id = ? AND movie_id = ? AND field = ?").bind(sess.user_id, movieId, field));
      else stmts.push(env.DB.prepare(
        `INSERT INTO user_votes (user_id, movie_id, field, value_json, updated_at) VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(user_id, movie_id, field) DO UPDATE SET value_json = excluded.value_json, updated_at = excluded.updated_at`
      ).bind(sess.user_id, movieId, field, JSON.stringify(value), now));
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
    const fieldMap = {};
    let totalVotes = 0;
    for (const r of results || []) {
      const val = safeJSON(r.value_json, null);
      if (!fieldMap[r.field]) fieldMap[r.field] = new Map();
      const key = JSON.stringify(val);
      fieldMap[r.field].set(key, (fieldMap[r.field].get(key) || 0) + 1);
      totalVotes++;
    }
    const aggregated = {};
    for (const [field, counts] of Object.entries(fieldMap)) {
      let bestKey = null, bestCount = 0;
      for (const [k, c] of counts) if (c > bestCount) { bestKey = k; bestCount = c; }
      aggregated[field] = { value: safeJSON(bestKey, null), count: bestCount, total: totalVotes };
    }
    return jsonRes({ movieId, aggregated });
  }
  return jsonErr("Kullanıcı route bulunamadı", 404);
                                    }
