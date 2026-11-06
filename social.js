import { getCurrentUserWithAdminBridge } from "./auth.js";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type,Authorization",
  "Access-Control-Allow-Credentials": "true"
};
function jsonRes(data, status = 200) { return new Response(JSON.stringify(data), { status, headers: { ...CORS, "Content-Type": "application/json; charset=utf-8" } }); }
function jsonErr(msg, status = 500) { return jsonRes({ error: String(msg) }, status); }
function safeJSON(t, fb = null) { try { return JSON.parse(t); } catch { return fb; } }

export async function handleSocial(request, env, ctx) {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  const url = new URL(request.url);
  const path = url.pathname.replace(/^\/social/, "");
  const sess = await getCurrentUserWithAdminBridge(env, request);
  const now = () => Math.floor(Date.now() / 1000);

  if (path.startsWith("/comments/") && request.method === "GET") {
    const movieId = decodeURIComponent(path.replace("/comments/", ""));
    const { results } = await env.DB.prepare(
      `SELECT c.id, c.content, c.created_at, u.username, u.register_number
       FROM comments c JOIN users u ON u.id = c.user_id
       WHERE c.movie_id = ? AND c.status = 'approved' ORDER BY c.created_at DESC LIMIT 100`
    ).bind(movieId).all();
    return jsonRes({ movieId, comments: results || [] });
  }
  if (path.startsWith("/comments/") && request.method === "POST") {
    if (!sess) return jsonErr("Giriş gerekli", 401);
    const movieId = decodeURIComponent(path.replace("/comments/", ""));
    let body; try { body = await request.json(); } catch { return jsonErr("Geçersiz JSON", 400); }
    const content = String(body.content || "").trim();
    if (content.length < 3 || content.length > 2000) return jsonErr("Yorum 3-2000 karakter", 400);
    const result = await env.DB.prepare(
      `INSERT INTO comments (movie_id, user_id, content, status, created_at, updated_at) VALUES (?, ?, ?, 'pending', ?, ?)`
    ).bind(movieId, sess.user_id, content, now(), now()).run();
    return jsonRes({ ok: true, id: result.meta.last_row_id, status: "pending", message: "Yorumunuz onay kuyruğuna alındı." });
  }
  if (path.startsWith("/comments/") && request.method === "PUT") {
    if (!sess) return jsonErr("Giriş gerekli", 401);
    const id = parseInt(path.replace("/comments/", ""));
    let body; try { body = await request.json(); } catch { return jsonErr("Geçersiz JSON", 400); }
    const content = String(body.content || "").trim();
    if (content.length < 3 || content.length > 2000) return jsonErr("Yorum 3-2000 karakter", 400);
    const c = await env.DB.prepare("SELECT user_id, status FROM comments WHERE id = ?").bind(id).first();
    if (!c) return jsonErr("Yorum bulunamadı", 404);
    if (c.user_id !== sess.user_id) return jsonErr("Yetkisiz", 403);
    if (c.status !== "pending") return jsonErr("Sadece onay bekleyen yorum düzenlenebilir", 400);
    await env.DB.prepare("UPDATE comments SET content = ?, updated_at = ? WHERE id = ?").bind(content, now(), id).run();
    return jsonRes({ ok: true });
  }
  if (path.startsWith("/comments/") && request.method === "DELETE") {
    if (!sess) return jsonErr("Giriş gerekli", 401);
    const id = parseInt(path.replace("/comments/", ""));
    const c = await env.DB.prepare("SELECT user_id FROM comments WHERE id = ?").bind(id).first();
    if (!c) return jsonErr("Yorum bulunamadı", 404);
    if (c.user_id !== sess.user_id && !sess.is_admin) return jsonErr("Yetkisiz", 403);
    await env.DB.prepare("DELETE FROM comments WHERE id = ?").bind(id).run();
    return jsonRes({ ok: true });
  }
  if (path === "/messages" && request.method === "GET") {
    if (!sess) return jsonErr("Giriş gerekli", 401);
    const { results } = await env.DB.prepare(
      `SELECT m.id, m.from_user_id, m.content, m.read_at, m.created_at, u.username AS from_username
       FROM messages m JOIN users u ON u.id = m.from_user_id
       WHERE m.to_user_id = ? ORDER BY m.created_at DESC LIMIT 100`
    ).bind(sess.user_id).all();
    return jsonRes({ messages: results || [] });
  }
  if (path === "/messages" && request.method === "POST") {
    if (!sess) return jsonErr("Giriş gerekli", 401);
    let body; try { body = await request.json(); } catch { return jsonErr("Geçersiz JSON", 400); }
    const toUsername = String(body.toUsername || "").trim();
    const content = String(body.content || "").trim();
    if (!toUsername || !content) return jsonErr("Alıcı ve içerik gerekli", 400);
    if (content.length > 5000) return jsonErr("Mesaj çok uzun", 400);
    if (sess.username && toUsername.toLowerCase() === String(sess.username).toLowerCase()) return jsonErr("Kendinize mesaj gönderemezsiniz", 400);
    const to = await env.DB.prepare("SELECT id FROM users WHERE username = ? COLLATE NOCASE AND deleted_at IS NULL").bind(toUsername).first();
    if (!to) return jsonErr("Alıcı bulunamadı", 404);
    if (to.id === sess.user_id) return jsonErr("Kendinize mesaj gönderemezsiniz", 400);
    await env.DB.prepare(`INSERT INTO messages (from_user_id, to_user_id, content, created_at) VALUES (?, ?, ?, ?)`).bind(sess.user_id, to.id, content, now()).run();
    return jsonRes({ ok: true });
  }
  if (path.startsWith("/edit-suggestions/") && request.method === "POST") {
    if (!sess) return jsonErr("Giriş gerekli", 401);
    const movieId = decodeURIComponent(path.replace("/edit-suggestions/", ""));
    let body; try { body = await request.json(); } catch { return jsonErr("Geçersiz JSON", 400); }
    const suggestions = body.suggestions && typeof body.suggestions === "object" ? body.suggestions : {};
    const stmts = [];
    for (const [field, value] of Object.entries(suggestions)) {
      if (value === null || value === undefined) continue;
      stmts.push(env.DB.prepare(
        `INSERT INTO edit_suggestions (movie_id, user_id, field, suggested_value_json, status, created_at) VALUES (?, ?, ?, ?, 'pending', ?)`
      ).bind(movieId, sess.user_id, field, JSON.stringify(value), now()));
    }
    if (stmts.length) await env.DB.batch(stmts);
    return jsonRes({ ok: true, count: stmts.length, message: "Önerileriniz kaydedildi, teşekkürler." });
  }
  if (path.startsWith("/edit-suggestions/") && request.method === "GET") {
    if (!sess) return jsonErr("Giriş gerekli", 401);
    const movieId = decodeURIComponent(path.replace("/edit-suggestions/", ""));
    const { results } = await env.DB.prepare(
      `SELECT field, suggested_value_json, status, created_at FROM edit_suggestions WHERE movie_id = ? AND user_id = ? ORDER BY created_at DESC`
    ).bind(movieId, sess.user_id).all();
    const map = {};
    for (const r of results || []) map[r.field] = safeJSON(r.suggested_value_json, null);
    return jsonRes({ movieId, suggestions: map });
  }
  return jsonErr("Social route bulunamadı", 404);
}
