// auth.js
// Kayıt/giriş/şifre sıfırlama + güvenlik + permissions döndürme.
// Faz 3: CORS temizlendi (index.js son katmanı doğru origin ekler), askıya alınmış kullanıcı oturumu engellendi.
const PBKDF2_ITER = 100000;
const SESSION_TTL = 30 * 86400;
const RECOVER_TTL = 900;
const MAX_FAILED_ATTEMPTS = 5;
const LOCK_DURATION_SEC = 900;

// === CORS: sadece method + header. Origin ve Credentials index.js son katmanı tarafından
// corsHeaders(request) ile eklenir. Yerel "*" + "true" kombinasyonu geçersizdir (tarayıcı reddeder). ===
const CORS = {
  "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type,Authorization"
};

function jsonRes(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), { status, headers: { ...CORS, "Content-Type": "application/json; charset=utf-8", ...extraHeaders } });
}
function jsonErr(msg, status = 500) { return jsonRes({ error: String(msg) }, status); }
function bufToHex(buf) { return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, "0")).join(""); }
function randomHex(bytes) { const arr = new Uint8Array(bytes); crypto.getRandomValues(arr); return [...arr].map(b => b.toString(16).padStart(2, "0")).join(""); }
async function hashPassword(pw, saltHex) {
  const salt = new Uint8Array(saltHex.match(/.{2}/g).map(h => parseInt(h, 16)));
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(pw), { name: "PBKDF2" }, false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", salt, iterations: PBKDF2_ITER, hash: "SHA-256" }, key, 256);
  return bufToHex(bits);
}
async function sha256Hex(s) { const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)); return bufToHex(buf); }
function getCookie(req, name) {
  const cookie = req.headers.get("Cookie") || "";
  for (const part of cookie.split(";")) { const [k, ...v] = part.trim().split("="); if (k === name) return v.join("="); }
  return null;
}
function sessionCookieHeader(token, maxAge) { return `sid=${token}; Path=/; HttpOnly; Secure; SameSite=None; Max-Age=${maxAge}`; }
function clearSessionCookie() { return `sid=; Path=/; HttpOnly; Secure; SameSite=None; Max-Age=0`; }
function isValidEmail(s) { return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(s || "").trim()); }

export function timingSafeEqualStr(a, b) {
  if (typeof a !== "string" || typeof b !== "string") return false;
  const len = Math.max(a.length, b.length);
  let diff = a.length ^ b.length;
  for (let i = 0; i < len; i++) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return diff === 0;
}

async function fetchPermissions(env, userId) {
  if (!env.DB || !userId) return [];
  try {
    const { results } = await env.DB.prepare("SELECT permission FROM user_permissions WHERE user_id = ?").bind(userId).all();
    return (results || []).map(r => r.permission);
  } catch { return []; }
}

async function verifyTurnstile(env, token, ip) {
  if (!env.TURNSTILE_SECRET_KEY) return true;
  if (!token) return false;
  try {
    const body = new URLSearchParams();
    body.set("secret", env.TURNSTILE_SECRET_KEY);
    body.set("response", String(token));
    if (ip) body.set("remoteip", String(ip));
    const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", { method: "POST", body });
    const data = await res.json();
    return data.success === true;
  } catch { return false; }
}

async function checkIpLock(env, ip) {
  if (!env.DB || !ip) return { locked: false };
  try {
    const row = await env.DB.prepare("SELECT attempts, locked_until_ts FROM login_attempts WHERE ip = ?").bind(ip).first();
    if (!row) return { locked: false };
    const now = Math.floor(Date.now() / 1000);
    if (row.locked_until_ts && row.locked_until_ts > now) return { locked: true, until: row.locked_until_ts };
    return { locked: false };
  } catch { return { locked: false }; }
}
async function recordIpFailure(env, ip) {
  if (!env.DB || !ip) return;
  const now = Math.floor(Date.now() / 1000);
  try {
    const row = await env.DB.prepare("SELECT attempts FROM login_attempts WHERE ip = ?").bind(ip).first();
    const attempts = (row?.attempts || 0) + 1;
    const lockUntil = attempts >= MAX_FAILED_ATTEMPTS ? now + LOCK_DURATION_SEC : null;
    await env.DB.prepare(
      `INSERT INTO login_attempts (ip, attempts, last_attempt_ts, locked_until_ts) VALUES (?, ?, ?, ?)
       ON CONFLICT(ip) DO UPDATE SET attempts = excluded.attempts, last_attempt_ts = excluded.last_attempt_ts, locked_until_ts = COALESCE(excluded.locked_until_ts, login_attempts.locked_until_ts)`
    ).bind(ip, attempts, now, lockUntil).run();
  } catch (e) { console.warn("ip attempt write:", e.message); }
}
async function resetIpFailures(env, ip) {
  if (!env.DB || !ip) return;
  try { await env.DB.prepare("DELETE FROM login_attempts WHERE ip = ?").bind(ip).run(); } catch {}
}

async function checkUserLock(env, userId) {
  if (!env.DB || !userId) return { locked: false };
  try {
    const row = await env.DB.prepare("SELECT failed_attempts, locked_until_ts FROM user_lockouts WHERE user_id = ?").bind(userId).first();
    if (!row) return { locked: false };
    const now = Math.floor(Date.now() / 1000);
    if (row.locked_until_ts && row.locked_until_ts > now) return { locked: true, until: row.locked_until_ts };
    return { locked: false };
  } catch { return { locked: false }; }
}
async function recordUserFailure(env, userId) {
  if (!env.DB || !userId) return;
  const now = Math.floor(Date.now() / 1000);
  try {
    const row = await env.DB.prepare("SELECT failed_attempts FROM user_lockouts WHERE user_id = ?").bind(userId).first();
    const attempts = (row?.failed_attempts || 0) + 1;
    const lockUntil = attempts >= MAX_FAILED_ATTEMPTS ? now + LOCK_DURATION_SEC : null;
    await env.DB.prepare(
      `INSERT INTO user_lockouts (user_id, failed_attempts, locked_until_ts) VALUES (?, ?, ?)
       ON CONFLICT(user_id) DO UPDATE SET failed_attempts = excluded.failed_attempts, locked_until_ts = COALESCE(excluded.locked_until_ts, user_lockouts.locked_until_ts)`
    ).bind(userId, attempts, lockUntil).run();
  } catch (e) { console.warn("user lock write:", e.message); }
}
async function resetUserFailures(env, userId) {
  if (!env.DB || !userId) return;
  try { await env.DB.prepare("DELETE FROM user_lockouts WHERE user_id = ?").bind(userId).run(); } catch {}
}

async function getSession(env, token) {
  if (!env.DB || !token) return null;
  const hash = await sha256Hex(token);
  try {
    const row = await env.DB.prepare(
      `SELECT s.id AS session_id, s.user_id, s.expires_at, u.username, u.is_admin, u.is_suspended, u.is_public, u.register_number, u.is_approved, u.is_email_verified
       FROM user_sessions s JOIN users u ON u.id = s.user_id
       WHERE s.token_hash = ? AND s.expires_at > ? AND u.deleted_at IS NULL AND s.user_agent != 'recover'`
    ).bind(hash, Math.floor(Date.now() / 1000)).first();
    return row || null;
  } catch (e) { console.warn("session:", e.message); return null; }
}
async function createSession(env, userId, ip, ua) {
  const token = randomHex(32);
  const hash = await sha256Hex(token);
  const now = Math.floor(Date.now() / 1000);
  const exp = now + SESSION_TTL;
  await env.DB.prepare(
    `INSERT INTO user_sessions (id, user_id, token_hash, expires_at, created_at, ip, user_agent) VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).bind(randomHex(8), userId, hash, exp, now, ip || "", (ua || "").slice(0, 200)).run();
  return { token, expiresAt: exp };
}
async function deleteSession(env, token) {
  if (!env.DB || !token) return;
  const hash = await sha256Hex(token);
  await env.DB.prepare("DELETE FROM user_sessions WHERE token_hash = ?").bind(hash).run();
}
async function findUserByLogin(env, login) {
  if (!env.DB) return null;
  const isNum = /^\d+$/.test(login);
  try {
    return isNum
      ? await env.DB.prepare("SELECT * FROM users WHERE register_number = ? AND deleted_at IS NULL").bind(Number(login)).first()
      : await env.DB.prepare("SELECT * FROM users WHERE username = ? COLLATE NOCASE AND deleted_at IS NULL").bind(login).first();
  } catch { return null; }
}
async function nextRegisterNumber(env) {
  const row = await env.DB.prepare("SELECT value FROM app_config WHERE key = 'users.next_register_number'").bind().first();
  let n = parseInt(row?.value) || 12345;
  await env.DB.prepare(
    `INSERT INTO app_config (key, value, updated_at) VALUES ('users.next_register_number', ?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
  ).bind(String(n + 1), Math.floor(Date.now() / 1000)).run();
  return n;
}
async function ensureAdminUser(env) {
  if (!env.DB) return null;
  try {
    let admin = await env.DB.prepare("SELECT * FROM users WHERE is_admin = 1 AND deleted_at IS NULL ORDER BY id ASC LIMIT 1").first();
    if (admin) return admin;
    const regNum = await nextRegisterNumber(env);
    const salt = randomHex(16);
    const now = Math.floor(Date.now() / 1000);
    const result = await env.DB.prepare(
      `INSERT INTO users (register_number, username, email, password_hash, password_salt, security_questions_json,
        is_admin, is_approved, is_public, is_suspended, is_email_verified, created_at, updated_at)
       VALUES (?, 'admin', NULL, ?, ?, NULL, 1, 1, 0, 0, 1, ?, ?)`
    ).bind(regNum, "ADMIN_NO_LOGIN_" + salt, salt, now, now).run();
    const id = result.meta.last_row_id;
    return await env.DB.prepare("SELECT * FROM users WHERE id = ?").bind(id).first();
  } catch (e) { console.warn("ensureAdminUser:", e.message); return null; }
}

export async function handleAuth(request, env, ctx) {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  const url = new URL(request.url);
  const path = url.pathname.replace(/^\/auth/, "");

  if (path === "/register" && request.method === "POST") {
    let body; try { body = await request.json(); } catch { return jsonErr("Geçersiz JSON", 400); }
    const ip = request.headers.get("CF-Connecting-IP") || "";
    const turnstileToken = body.turnstileToken || "";
    const okCaptcha = await verifyTurnstile(env, turnstileToken, ip);
    if (!okCaptcha) return jsonErr("CAPTCHA doğrulaması başarısız", 400);
    const username = String(body.username || "").trim();
    const password = String(body.password || "");
    const email = String(body.email || "").trim();
    const securityQuestions = Array.isArray(body.securityQuestions) ? body.securityQuestions : [];
    if (!/^[A-Za-z0-9_.-]{3,32}$/.test(username)) return jsonErr("Kullanıcı adı 3-32 karakter (harf, rakam, _ . -)", 400);
    if (password.length < 6) return jsonErr("Şifre en az 6 karakter olmalı", 400);
    if (!email) return jsonErr("E-posta adresi zorunludur", 400);
    if (!isValidEmail(email)) return jsonErr("Geçerli bir e-posta adresi girin", 400);
    if (securityQuestions.length !== 3) return jsonErr("3 güvenlik sorusu gerekli", 400);
    try {
      const existing = await env.DB.prepare("SELECT id FROM users WHERE username = ? COLLATE NOCASE AND deleted_at IS NULL").bind(username).first();
      if (existing) return jsonErr("Bu kullanıcı adı zaten alınmış", 409);
    } catch {}
    try {
      const salt = randomHex(16);
      const hash = await hashPassword(password, salt);
      const regNum = await nextRegisterNumber(env);
      const now = Math.floor(Date.now() / 1000);
      const hashedQ = [];
      for (const q of securityQuestions) {
        const normAns = String(q.answer || "").trim().toLowerCase();
        if (!normAns) return jsonErr("Güvenlik cevabı boş olamaz", 400);
        const qSalt = randomHex(16);
        hashedQ.push({ key: String(q.key || ""), answerHash: await hashPassword(normAns, qSalt), answerSalt: qSalt });
      }
      const result = await env.DB.prepare(
        `INSERT INTO users (register_number, username, email, password_hash, password_salt, security_questions_json,
          is_admin, is_approved, is_public, is_suspended, is_email_verified, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, 0, 0, 0, 0, 0, ?, ?)`
      ).bind(regNum, username, email, hash, salt, JSON.stringify(hashedQ), now, now).run();
      return jsonRes({
        ok: true, userId: result.meta.last_row_id, username, registerNumber: regNum,
        pendingApproval: true, permissions: [],
        notice: "Kaydınız alındı. Yönetici onayından sonra üyeliğiniz aktifleşecek. Lütfen gerçek bir e-posta adresi kullandığınızdan emin olun; e-posta doğrulaması gerekebilir."
      });
    } catch (e) { return jsonErr(e.message, 500); }
  }

  if (path === "/login" && request.method === "POST") {
    let body; try { body = await request.json(); } catch { return jsonErr("Geçersiz JSON", 400); }
    const ip = request.headers.get("CF-Connecting-IP") || "";
    const ipLock = await checkIpLock(env, ip);
    if (ipLock.locked) return jsonErr(`Çok fazla başarısız deneme. ${Math.ceil((ipLock.until - Math.floor(Date.now() / 1000)) / 60)} dk sonra tekrar deneyin.`, 429);
    const login = String(body.login || "").trim();
    const password = String(body.password || "");
    if (!login || !password) return jsonErr("Kullanıcı adı/numara ve şifre gerekli", 400);
    const user = await findUserByLogin(env, login);
    if (!user) { await recordIpFailure(env, ip); return jsonErr("Kullanıcı bulunamadı", 401); }
    if (user.is_suspended) return jsonErr("Hesap askıya alınmış", 403);
    const userLock = await checkUserLock(env, user.id);
    if (userLock.locked) return jsonErr(`Hesabınız geçici olarak kilitli. ${Math.ceil((userLock.until - Math.floor(Date.now() / 1000)) / 60)} dk sonra tekrar deneyin. Admin ile iletişime geçebilirsiniz.`, 429);
    if (!user.is_approved && !user.is_admin) return jsonErr("Hesabınız yönetici onayı bekliyor. Onaylandığında giriş yapabilirsiniz.", 403);
    const check = await hashPassword(password, user.password_salt);
    if (!timingSafeEqualStr(check, user.password_hash)) {
      await recordIpFailure(env, ip);
      await recordUserFailure(env, user.id);
      return jsonErr("Şifre yanlış", 401);
    }
    await resetIpFailures(env, ip);
    await resetUserFailures(env, user.id);
    const permissions = await fetchPermissions(env, user.id);
    const session = await createSession(env, user.id, ip, request.headers.get("User-Agent") || "");
    return new Response(JSON.stringify({
      ok: true, userId: user.id, username: user.username, registerNumber: user.register_number,
      isAdmin: !!user.is_admin, isPublic: !!user.is_public, isApproved: !!user.is_approved, isEmailVerified: !!user.is_email_verified,
      permissions
    }), { status: 200, headers: { ...CORS, "Content-Type": "application/json", "Set-Cookie": sessionCookieHeader(session.token, SESSION_TTL) } });
  }

  if (path === "/logout" && request.method === "POST") {
    const token = getCookie(request, "sid");
    if (token) await deleteSession(env, token);
    return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { ...CORS, "Content-Type": "application/json", "Set-Cookie": clearSessionCookie() } });
  }

  if (path === "/me" && request.method === "GET") {
    const token = getCookie(request, "sid");
    const sess = await getSession(env, token);
    if (sess) {
      // === YENİ: askıya alınmış kullanıcı oturumu geçersiz ===
      if (sess.is_suspended) return jsonRes({ ok: false, user: null, permissions: [] });
      const permissions = await fetchPermissions(env, sess.user_id);
      return jsonRes({
        ok: true, userId: sess.user_id, username: sess.username, registerNumber: sess.register_number,
        isAdmin: !!sess.is_admin, isPublic: !!sess.is_public, isApproved: !!sess.is_approved, isEmailVerified: !!sess.is_email_verified,
        permissions
      });
    }
    const auth = request.headers.get("Authorization") || "";
    if (env.ADMIN_TOKEN && auth === `Bearer ${env.ADMIN_TOKEN}`) {
      const admin = await ensureAdminUser(env);
      if (admin) {
        const s = await createSession(env, admin.id, "", "admin-bridge");
        return new Response(JSON.stringify({
          ok: true, userId: admin.id, username: admin.username, registerNumber: admin.register_number,
          isAdmin: true, isPublic: !!admin.is_public, isApproved: true, isEmailVerified: true,
          permissions: ["refresh_movie", "edit_suggestions_approve", "comment_approve", "user_manage", "field_unlock", "csv_import_cards", "view_private"]
        }), { status: 200, headers: { ...CORS, "Content-Type": "application/json", "Set-Cookie": sessionCookieHeader(s.token, SESSION_TTL) } });
      }
    }
    return jsonRes({ ok: false, user: null, permissions: [] });
  }

  if (path === "/recover/start" && request.method === "POST") {
    let body; try { body = await request.json(); } catch { return jsonErr("Geçersiz JSON", 400); }
    const login = String(body.login || "").trim();
    const user = await findUserByLogin(env, login);
    if (!user) return jsonErr("Kullanıcı bulunamadı", 404);
    const questions = user.security_questions_json ? JSON.parse(user.security_questions_json) : [];
    if (!questions.length) return jsonErr("Bu hesap için güvenlik sorusu tanımlanmamış", 400);
    return jsonRes({ ok: true, questions: questions.map(q => ({ key: q.key })) });
  }

  if (path === "/recover/verify" && request.method === "POST") {
    let body; try { body = await request.json(); } catch { return jsonErr("Geçersiz JSON", 400); }
    const login = String(body.login || "").trim();
    const answers = Array.isArray(body.answers) ? body.answers : [];
    const user = await findUserByLogin(env, login);
    if (!user) return jsonErr("Kullanıcı bulunamadı", 404);
    const questions = user.security_questions_json ? JSON.parse(user.security_questions_json) : [];
    if (answers.length !== questions.length) return jsonErr("Cevap sayısı eşleşmiyor", 400);
    for (let i = 0; i < questions.length; i++) {
      const normAns = String(answers[i] || "").trim().toLowerCase();
      const salt = questions[i].answerSalt || user.password_salt;
      const h = await hashPassword(normAns, salt);
      if (!timingSafeEqualStr(h, questions[i].answerHash)) return jsonErr("Güvenlik cevabı yanlış", 401);
    }
    const token = randomHex(32);
    const hash = await sha256Hex(token);
    const now = Math.floor(Date.now() / 1000);
    await env.DB.prepare(`INSERT INTO user_sessions (id, user_id, token_hash, expires_at, created_at, ip, user_agent) VALUES (?, ?, ?, ?, ?, '', 'recover')`)
      .bind(randomHex(8), user.id, hash, now + RECOVER_TTL, now).run();
    return new Response(JSON.stringify({ ok: true, resetToken: token }), { status: 200, headers: { ...CORS, "Content-Type": "application/json" } });
  }

  if (path === "/recover/reset" && request.method === "POST") {
    let body; try { body = await request.json(); } catch { return jsonErr("Geçersiz JSON", 400); }
    const resetToken = String(body.resetToken || "");
    const newPassword = String(body.password || "");
    if (!resetToken || newPassword.length < 6) return jsonErr("Token ve şifre (min 6) gerekli", 400);
    const hash = await sha256Hex(resetToken);
    const now = Math.floor(Date.now() / 1000);
    const row = await env.DB.prepare(`SELECT user_id FROM user_sessions WHERE token_hash = ? AND expires_at > ? AND user_agent = 'recover'`).bind(hash, now).first();
    if (!row) return jsonErr("Geçersiz veya süresi dolmuş token", 401);
    const newSalt = randomHex(16);
    const newHash = await hashPassword(newPassword, newSalt);
    await env.DB.prepare("UPDATE users SET password_hash = ?, password_salt = ?, updated_at = ? WHERE id = ?").bind(newHash, newSalt, now, row.user_id).run();
    await env.DB.prepare("DELETE FROM user_sessions WHERE user_id = ?").bind(row.user_id).run();
    return jsonRes({ ok: true });
  }

  if (path === "/change-password" && request.method === "POST") {
    const sess = await getSession(env, getCookie(request, "sid"));
    if (!sess) return jsonErr("Giriş gerekli", 401);
    if (sess.is_suspended) return jsonErr("Hesap askıya alınmış", 403);
    let body; try { body = await request.json(); } catch { return jsonErr("Geçersiz JSON", 400); }
    const oldPw = String(body.oldPassword || "");
    const newPw = String(body.newPassword || "");
    if (newPw.length < 6) return jsonErr("Yeni şifre en az 6 karakter", 400);
    const user = await env.DB.prepare("SELECT password_hash, password_salt FROM users WHERE id = ?").bind(sess.user_id).first();
    if (!user) return jsonErr("Kullanıcı bulunamadı", 404);
    const oldHash = await hashPassword(oldPw, user.password_salt);
    if (!timingSafeEqualStr(oldHash, user.password_hash)) return jsonErr("Mevcut şifre yanlış", 401);
    const newSalt = randomHex(16);
    const newHash = await hashPassword(newPw, newSalt);
    await env.DB.prepare("UPDATE users SET password_hash = ?, password_salt = ?, updated_at = ? WHERE id = ?").bind(newHash, newSalt, Math.floor(Date.now() / 1000), sess.user_id).run();
    await env.DB.prepare("DELETE FROM user_sessions WHERE user_id = ?").bind(sess.user_id).run();
    return jsonRes({ ok: true, message: "Şifre güncellendi. Lütfen yeniden giriş yapın." });
  }

  if (path === "/rename" && request.method === "POST") {
    const sess = await getSession(env, getCookie(request, "sid"));
    if (!sess) return jsonErr("Giriş gerekli", 401);
    if (sess.is_suspended) return jsonErr("Hesap askıya alınmış", 403);
    let body; try { body = await request.json(); } catch { return jsonErr("Geçersiz JSON", 400); }
    const newName = String(body.username || "").trim();
    if (!/^[A-Za-z0-9_.-]{3,32}$/.test(newName)) return jsonErr("Geçersiz kullanıcı adı", 400);
    const existing = await env.DB.prepare("SELECT id FROM users WHERE username = ? COLLATE NOCASE AND id != ? AND deleted_at IS NULL").bind(newName, sess.user_id).first();
    if (existing) return jsonErr("Bu kullanıcı adı zaten alınmış", 409);
    await env.DB.prepare("UPDATE users SET username = ?, updated_at = ? WHERE id = ?").bind(newName, Math.floor(Date.now() / 1000), sess.user_id).run();
    return jsonRes({ ok: true, username: newName });
  }

  return jsonErr("Auth route bulunamadı", 404);
}

export async function getCurrentUser(env, request) {
  const token = getCookie(request, "sid");
  return await getSession(env, token);
}
export async function getCurrentUserWithAdminBridge(env, request) {
  const sess = await getCurrentUser(env, request);
  // === YENİ: askıya alınmış kullanıcı oturumu geçersiz sayılır ===
  if (sess && sess.is_suspended) return null;
  if (sess) return sess;
  const auth = request.headers.get("Authorization") || "";
  if (env.ADMIN_TOKEN && auth === `Bearer ${env.ADMIN_TOKEN}`) {
    const admin = await ensureAdminUser(env);
    if (admin) return { user_id: admin.id, username: admin.username, is_admin: 1, is_public: admin.is_public, register_number: admin.register_number, is_approved: 1, is_email_verified: 1 };
  }
  return null;
                                } 
