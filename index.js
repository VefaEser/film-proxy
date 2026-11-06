// index.js — Ana giriş noktası. Modüler rotalar ve CORS sarmalayıcı.
import { corsHeaders } from "./cors.js";
import { handleAuth } from "./auth.js";
import { handleUser } from "./users.js";
import { handleSocial } from "./social.js";
import { handleAdmin } from "./admin.js";
import {
  GEMINI_MODEL_DEFAULT, GROQ_MODEL_DEFAULT,
  buildGeminiChain, buildGroqChain, isAdmin, response, jsonError,
  tmdb, omdb, tmdbRoute, handleImages, handleMovieDetails, handleResearchStream,
  getAllConfig, getLlmStats, getActiveDeadKeys, getFilterInfoAll, getAllStaticOptions,
  getMovieLists, metatakeExtended, filmmapLocations, deadKeysCache
} from "./worker-core.js";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type,Authorization"
};

async function handleRequest(request, env, ctx) {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  const _u = new URL(request.url);

  if (_u.pathname.startsWith("/auth/")) return await handleAuth(request, env, ctx);
  if (_u.pathname.startsWith("/user/")) return await handleUser(request, env, ctx);
  if (_u.pathname.startsWith("/social/")) return await handleSocial(request, env, ctx);
  if (_u.pathname.startsWith("/admin/users") || _u.pathname.startsWith("/admin/comments") ||
      _u.pathname.startsWith("/admin/locks") || _u.pathname.startsWith("/admin/suggestions") ||
      _u.pathname.startsWith("/admin/unlock") || _u.pathname.startsWith("/admin/messages")) {
    return await handleAdmin(request, env, ctx);
  }

  const url = _u;
  try {
    if (url.pathname === "/health") {
      return response({
        ok: true,
        geminiModel: env.GEMINI_MODEL || GEMINI_MODEL_DEFAULT, geminiModels: buildGeminiChain(env),
        groqModel: env.GROQ_MODEL || GROQ_MODEL_DEFAULT, groqModels: buildGroqChain(env),
        tmdb: !!env.TMDB_API_KEY, omdb: !!env.OMDB_API_KEY, tavily: !!env.TAVILY_API_KEY,
        opensubtitles: !!env.OPENSUBTITLES_API_KEY,
        subsource: !!env.SUBSOURCE_API_KEY, subdl: !!env.SUBDL_API_KEY,
        turnstile: !!env.TURNSTILE_SECRET_KEY,
        groqKeys: [!!env.GROQ_API_KEY_1, !!env.GROQ_API_KEY_2, !!env.GROQ_API_KEY_3],
        geminiKeys: [!!env.GEMINI_API_KEY_1, !!env.GEMINI_API_KEY_2, !!env.GEMINI_API_KEY_3],
        adminToken: !!env.ADMIN_TOKEN,
        metatake: true, filmmap: true, staticOptions: true,
        d1: !!env.DB, defaultMinImdbVotes: 100
      });
    }
    if (url.pathname === "/static/options" && request.method === "GET") {
      return response({ options: await getAllStaticOptions(env) });
    }
    if (url.pathname === "/metatake/locations" && request.method === "GET") {
      const movieId = url.searchParams.get("movie_id") || "";
      const title = url.searchParams.get("title") || "";
      if (!movieId && !title) return jsonError("movie_id veya title gerekli.", 400);
      const mt = await metatakeExtended(env, { id: movieId, title, original_title: title }, request.signal);
      return response({ locations: mt?.locations || [], confidence: mt?.confidence ?? null });
    }
    if (url.pathname === "/filmmap/locations" && request.method === "GET") {
      const movieId = url.searchParams.get("movie_id") || "";
      const title = url.searchParams.get("title") || "";
      if (!movieId && !title) return jsonError("movie_id veya title gerekli.", 400);
      const fm = await filmmapLocations(env, { id: movieId, title, original_title: title }, request.signal);
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
      const { setConfig } = await import("./config.js");
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
      const heartbeatTimer = setInterval(() => { try { writer.write(enc.encode(": ping\n\n")); } catch { clearInterval(heartbeatTimer); } }, 15000);
      const task = handleResearchStream(env, body, controller, request.signal)
        .catch(err => { try { controller.enqueue(enc.encode(`data: ${JSON.stringify({ type: "error", message: String(err.message || err) })}\n\n`)); } catch {} try { controller.close(); } catch {} })
        .finally(() => clearInterval(heartbeatTimer));
      if (ctx?.waitUntil) ctx.waitUntil(task);
      return new Response(readable, { headers: { ...CORS, "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-cache, no-transform", "X-Accel-Buffering": "no" } });
    }
    return jsonError("Uç nokta bulunamadı.", 404);
  } catch (e) {
    console.error(e.stack || e);
    const message = String(e.message || e);
    const status = e.status || (/API_KEY|Secret .*tanımlı değil|gerekli/.test(message) ? 503 : 500);
    return jsonError(message, status);
  }
}

export default {
  async fetch(request, env, ctx) {
    let response;
    try { response = await handleRequest(request, env, ctx); }
    catch (e) { response = new Response(JSON.stringify({ error: String(e.message || e) }), { status: 500, headers: { "Content-Type": "application/json; charset=utf-8" } }); }
    const newHeaders = new Headers(response.headers);
    for (const [k, v] of Object.entries(corsHeaders(request))) newHeaders.set(k, v);
    return new Response(response.body, { status: response.status, headers: newHeaders });
  }
};
