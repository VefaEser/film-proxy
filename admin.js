// admin.js — Kullanıcı yönetimi, kilit açma, admin mesajları, yorum/öneri moderasyonu.
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

async function requireAdmin(env, request) {
  const sess = await getCurrentUserWithAdminBridge(env, request);
  if (!sess) throw Object.assign(new Error("Giriş gerekli"), { status: 401 });
  if (!sess.is_admin) throw Object.assign(new Error("Admin yetkisi gerekli"), { status: 403 });
  return sess;
}

const ALLOWED_PERMS = new Set(["refresh_movie","edit_suggestions_approve","comment_approve","user_manage","field_unlock","csv_import_cards","view_private"]);

export async function handleAdmin(request, env, ctx) {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  const url = new URL(request.url);
  const path = url.pathname.replace(/^\/admin/, "");
  const now = () => Math.floor(Date.now() / 1000);
  try {
    const sess = await requireAdmin(env, request);

    if (path === "/users" && request.method === "GET") {
      const page = Math.max(1, parseInt(url.searchParams.get("page") || "1"));
      const pageSize = 25;
      const offset = (page - 1) * pageSize;
      const { results } = await env.DB.prepare(
        `SELECT id, register_number, username, email, is_admin, is_approved, is_public, is_suspended, created_at, suspended_at
         FROM users WHERE deleted_at IS NULL ORDER BY id ASC LIMIT ? OFFSET ?`
      ).bind(pageSize, offset).all();
      const { results: countRows } = await env.DB.prepare("SELECT COUNT(*) AS c FROM users WHERE deleted_at IS NULL").all();
      const permsRows = await env.DB.prepare("SELECT user_id, permission FROM user_permissions").all();
      const permsByUser = new Map();
      for (const r of permsRows.results || []) { if (!permsByUser.has(r.user_id)) permsByUser.set(r.user_id, []); permsByUser.get(r.user_id).push(r.permission); }
      const users = (results || []).map(u => ({ ...u, permissions: permsByUser.get(u.id) || [] }));
      return jsonRes({ users, total: countRows[0]?.c || 0, page, pageSize });
    }
    if (path.startsWith("/users/") && request.method === "PUT") {
      const id = parseInt(path.replace("/users/", "").split("/")[0]);
      let body; try { body = await request.json(); } catch { return jsonErr("Geçersiz JSON", 400); }
      const updates = [], params = [];
      if (typeof body.isApproved === "boolean") { updates.push("is_approved = ?"); params.push(body.isApproved ? 1 : 0); }
      if (typeof body.isSuspended === "boolean") {
        updates.push("is_suspended = ?"); params.push(body.isSuspended ? 1 : 0);
        updates.push("suspended_at = ?"); params.push(body.isSuspended ? now() : null);
      }
      if (typeof body.isAdmin === "boolean") { updates.push("is_admin = ?"); params.push(body.isAdmin ? 1 : 0); }
      if (typeof body.username === "string" && body.username.trim()) {
        const newName = body.username.trim();
        if (!/^[A-Za-z0-9_.-]{3,32}$/.test(newName)) return jsonErr("Geçersiz kullanıcı adı", 400);
        const existing = await env.DB.prepare("SELECT id FROM users WHERE username = ? COLLATE NOCASE AND id != ? AND deleted_at IS NULL").bind(newName, id).first();
        if (existing) return jsonErr("Kullanıcı adı zaten alınmış", 409);
        updates.push("username = ?"); params.push(newName);
      }
      if (body.deleted === true) { updates.push("deleted_at = ?"); params.push(now()); }
      if (updates.length) { updates.push("updated_at = ?"); params.push(now(), id); await env.DB.prepare(`UPDATE users SET ${updates.join(", ")} WHERE id = ?`).bind(...params).run(); }
      return jsonRes({ ok: true });
    }

    if (path.match(/^\/users\/\d+\/permissions$/) && request.method === "PUT") {
      const id = parseInt(path.split("/")[2]);
      let body; try { body = await request.json(); } catch { return jsonErr("Geçersiz JSON", 400); }
      const perm = String(body.permission || "");
      if (!ALLOWED_PERMS.has(perm)) return jsonErr("Geçersiz izin", 400);
      if (body.grant) {
        await env.DB.prepare(
          `INSERT INTO user_permissions (user_id, permission, granted_by, granted_at) VALUES (?, ?, ?, ?)
           ON CONFLICT(user_id, permission) DO UPDATE SET granted_by = excluded.granted_by, granted_at = excluded.granted_at`
        ).bind(id, perm, sess.user_id, now()).run();
      } else {
        await env.DB.prepare("DELETE FROM user_permissions WHERE user_id = ? AND permission = ?").bind(id, perm).run();
      }
      return jsonRes({ ok: true });
    }

    // Admin kilidi açma
    if (path === "/unlock-ip" && request.method === "POST") {
      let body; try { body = await request.json(); } catch { return jsonErr("Geçersiz JSON", 400); }
      const ip = String(body.ip || "").trim();
      if (!ip) return jsonErr("ip gerekli", 400);
      await env.DB.prepare("DELETE FROM login_attempts WHERE ip = ?").bind(ip).run();
      return jsonRes({ ok: true });
    }
    if (path === "/unlock-user" && request.method === "POST") {
      let body; try { body = await request.json(); } catch { return jsonErr("Geçersiz JSON", 400); }
      const userId = parseInt(body.userId);
      if (!userId) return jsonErr("userId gerekli", 400);
      await env.DB.prepare("DELETE FROM user_lockouts WHERE user_id = ?").bind(userId).run();
      return jsonRes({ ok: true });
    }
    if (path === "/locked-accounts" && request.method === "GET") {
      const nowTs = Math.floor(Date.now() / 1000);
      const { results: ipLocks } = await env.DB.prepare("SELECT ip, attempts, last_attempt_ts, locked_until_ts FROM login_attempts WHERE locked_until_ts > ?").bind(nowTs).all();
      const { results: userLocks } = await env.DB.prepare(
        `SELECT l.user_id, l.failed_attempts, l.locked_until_ts, u.username FROM user_lockouts l JOIN users u ON u.id = l.user_id WHERE l.locked_until_ts > ?`
      ).bind(nowTs).all();
      return jsonRes({ ipLocks: ipLocks || [], userLocks: userLocks || [] });
    }

    // Admin mesajları
    if (path === "/messages" && request.method === "GET") {
      const { results } = await env.DB.prepare("SELECT id, email, subject, content, ip, created_at, read_at FROM admin_messages ORDER BY created_at DESC LIMIT 200").all();
      return jsonRes({ messages: results || [] });
    }
    if (path.match(/^\/messages\/\d+\/read$/) && request.method === "PUT") {
      const id = parseInt(path.split("/")[2]);
      await env.DB.prepare("UPDATE admin_messages SET read_at = ? WHERE id = ? AND read_at IS NULL").bind(now(), id).run();
      return jsonRes({ ok: true });
    }

    // Comments
    if (path === "/comments" && request.method === "GET") {
      const status = url.searchParams.get("status") || "pending";
      const { results } = await env.DB.prepare(
        `SELECT c.id, c.movie_id, c.content, c.status, c.created_at, u.username, u.id AS user_id
         FROM comments c JOIN users u ON u.id = c.user_id WHERE c.status = ? ORDER BY c.created_at ASC LIMIT 100`
      ).bind(status).all();
      return jsonRes({ comments: results || [] });
    }
    if (path.match(/^\/comments\/\d+$/) && request.method === "PUT") {
      const id = parseInt(path.split("/")[2]);
      let body; try { body = await request.json(); } catch { return jsonErr("Geçersiz JSON", 400); }
      const newStatus = String(body.status || "");
      if (!["approved","rejected","edited"].includes(newStatus)) return jsonErr("Geçersiz durum", 400);
      const content = body.content ? String(body.content).trim() : null;
      if (content) {
        await env.DB.prepare("UPDATE comments SET content = ?, status = ?, edited_by = ?, edited_at = ?, updated_at = ? WHERE id = ?").bind(content, newStatus, sess.user_id, now(), now(), id).run();
      } else {
        await env.DB.prepare("UPDATE comments SET status = ?, updated_at = ? WHERE id = ?").bind(newStatus, now(), id).run();
      }
      return jsonRes({ ok: true });
    }

    // Locks
    if (path.match(/^\/locks\/[^/]+\/[^/]+$/) && request.method === "POST") {
      const parts = path.split("/");
      await env.DB.prepare(`INSERT INTO movie_field_locks (movie_id, field, locked_by, locked_at) VALUES (?, ?, ?, ?) ON CONFLICT(movie_id, field) DO UPDATE SET locked_by = excluded.locked_by, locked_at = excluded.locked_at`)
        .bind(decodeURIComponent(parts[2]), decodeURIComponent(parts[3]), sess.user_id, now()).run();
      return jsonRes({ ok: true });
    }
    if (path.match(/^\/locks\/[^/]+\/[^/]+$/) && request.method === "DELETE") {
      const parts = path.split("/");
      await env.DB.prepare("DELETE FROM movie_field_locks WHERE movie_id = ? AND field = ?").bind(decodeURIComponent(parts[2]), decodeURIComponent(parts[3])).run();
      return jsonRes({ ok: true });
    }
    if (path.startsWith("/locks/") && request.method === "GET") {
      const movieId = decodeURIComponent(path.replace("/locks/", ""));
      const { results } = await env.DB.prepare("SELECT field, locked_by, locked_at FROM movie_field_locks WHERE movie_id = ?").bind(movieId).all();
      return jsonRes({ movieId, locks: results || [] });
    }

    // Suggestions
    if (path === "/suggestions" && request.method === "GET") {
      const status = url.searchParams.get("status") || "pending";
      const { results } = await env.DB.prepare(
        `SELECT s.id, s.movie_id, s.field, s.suggested_value_json, s.status, s.created_at, u.username FROM edit_suggestions s JOIN users u ON u.id = s.user_id WHERE s.status = ? ORDER BY s.created_at ASC LIMIT 100`
      ).bind(status).all();
      return jsonRes({ suggestions: (results || []).map(r => ({ ...r, value: safeJSON(r.suggested_value_json, null) })) });
    }
    if (path.match(/^\/suggestions\/\d+$/) && request.method === "PUT") {
      const id = parseInt(path.split("/")[2]);
      let body; try { body = await request.json(); } catch { return jsonErr("Geçersiz JSON", 400); }
      const newStatus = String(body.status || "");
      if (!["approved","rejected"].includes(newStatus)) return jsonErr("Geçersiz durum", 400);
      const sug = await env.DB.prepare("SELECT * FROM edit_suggestions WHERE id = ?").bind(id).first();
      if (!sug) return jsonErr("Öneri bulunamadı", 404);
      if (newStatus === "approved") {
        const movie = await env.DB.prepare("SELECT data_json FROM movie_profiles WHERE movie_id = ?").bind(sug.movie_id).first();
        if (movie) {
          const profile = safeJSON(movie.data_json, {}) || {};
          profile[sug.field] = safeJSON(sug.suggested_value_json, null);
          await env.DB.prepare("UPDATE movie_profiles SET data_json = ?, updated_at = ? WHERE movie_id = ?").bind(JSON.stringify(profile), now(), sug.movie_id).run();
        }
      }
      await env.DB.prepare("UPDATE edit_suggestions SET status = ?, reviewed_by = ?, reviewed_at = ? WHERE id = ?").bind(newStatus, sess.user_id, now(), id).run();
      return jsonRes({ ok: true });
    }
    return jsonErr("Admin route bulunamadı", 404);
  } catch (e) { return jsonErr(e.message, e.status || 500); }
        }
