// user-ui1.js — Part 1/2 (Modals, Auth, Header)
// user-ui2.js — Part 2/2 (Profile page, Admin panel, Vote modal, Comment section)
(function () {
  "use strict";

  const API_BASE = "https://film-proxy.stavaft.workers.dev";
  let currentUser = null;

  const SECURITY_QUESTIONS = [
    { key: "favorite_movie", label: "Favori filmin?" },
    { key: "favorite_color", label: "Favori film rengin?" },
    { key: "watched_count", label: "İzlediğin film sayısı?" },
    { key: "avg_rating", label: "Ortalama film puanın?" },
    { key: "first_movie", label: "İlk izlediğin film?" },
    { key: "favorite_genre", label: "Favori film türün?" },
    { key: "favorite_country", label: "Favori film yapım ülkesi?" },
    { key: "favorite_city", label: "Favori film şehri?" },
    { key: "favorite_director", label: "Favori yönetmen?" },
    { key: "most_hated_movie", label: "En nefret ettiğin film?" },
    { key: "most_watched_year", label: "En çok film izlediğin yıl?" },
    { key: "most_watched_day", label: "En çok film izlediğin gün?" },
    { key: "most_watched_hour", label: "En çok film izlediğin saat?" }
  ];

  function esc(s) {
    return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  async function api(path, opts = {}) {
    const res = await fetch(`${API_BASE}${path}`, {
      method: opts.method || "GET",
      credentials: "include",
      headers: { "Content-Type": "application/json", ...(opts.headers || {}) },
      body: opts.body ? JSON.stringify(opts.body) : undefined
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    return data;
  }

  function modal(title, bodyHtml, opts = {}) {
    const existing = document.getElementById("uui-modal");
    if (existing) existing.remove();
    const root = document.createElement("div");
    root.id = "uui-modal";
    root.style.cssText = "position:fixed;inset:0;background:rgba(0,0,0,0.85);z-index:9999;display:flex;align-items:center;justify-content:center;padding:16px;";
    root.innerHTML = `
      <div style="background:#1f2937;border:1px solid #374151;border-radius:12px;max-width:520px;width:100%;max-height:90vh;display:flex;flex-direction:column;overflow:hidden;">
        <div style="display:flex;justify-content:space-between;align-items:center;padding:14px 16px;border-bottom:1px solid #374151;">
          <strong style="color:#f3f4f6;font-size:1rem;">${esc(title)}</strong>
          <button type="button" data-close="1" style="background:transparent;border:none;color:#9ca3af;font-size:1.2rem;cursor:pointer;">✕</button>
        </div>
        <div style="padding:16px;overflow-y:auto;flex:1;">${bodyHtml}</div>
        ${opts.footer ? `<div style="padding:12px 16px;border-top:1px solid #374151;">${opts.footer}</div>` : ""}
      </div>`;
    document.body.appendChild(root);
    root.querySelectorAll("[data-close]").forEach(b => b.addEventListener("click", () => root.remove()));
    root.addEventListener("click", (e) => { if (e.target === root) root.remove(); });
    document.addEventListener("keydown", function escClose(e) {
      if (e.key === "Escape") { root.remove(); document.removeEventListener("keydown", escClose); }
    });
    return root;
  }

  function inputRow(label, inputHtml) {
    return `<label style="display:flex;flex-direction:column;gap:4px;margin-bottom:10px;color:#f3f4f6;font-size:0.85rem;">
      <span style="color:#9ca3af;font-size:0.78rem;">${esc(label)}</span>
      ${inputHtml}
    </label>`;
  }
  const inputStyle = "padding:8px 10px;border:1px solid #374151;border-radius:6px;background:#111827;color:#f3f4f6;font-size:0.9rem;width:100%;box-sizing:border-box;";
  const btnStyle = "padding:10px 14px;background:#60a5fa;color:#fff;border:none;border-radius:8px;font-size:0.9rem;font-weight:600;cursor:pointer;width:100%;";
  const btnSecondary = "padding:8px 12px;background:transparent;color:#f3f4f6;border:1px solid #374151;border-radius:8px;font-size:0.85rem;cursor:pointer;";

  function showLoginModal() {
    const root = modal("Giriş Yap", `
      <div id="login-error" style="color:#f87171;font-size:0.82rem;margin-bottom:8px;display:none;"></div>
      ${inputRow("Kullanıcı adı veya kayıt numarası", `<input type="text" id="login-user" placeholder="kullanici veya 12345" style="${inputStyle}">`)}
      ${inputRow("Şifre", `<div style="position:relative;"><input type="password" id="login-pass" style="${inputStyle}padding-right:44px;"><button type="button" id="login-eye" style="position:absolute;right:4px;top:50%;transform:translateY(-50%);background:transparent;border:none;color:#9ca3af;cursor:pointer;font-size:0.9rem;padding:4px 8px;">👁</button></div>`)}
      <div style="margin-bottom:10px;font-size:0.8rem;color:#9ca3af;">Admin giriş için yönetim panelindeki token alanını kullanın.</div>
      <button type="button" id="login-submit" style="${btnStyle}">Giriş</button>
      <div style="margin-top:12px;display:flex;justify-content:space-between;gap:8px;">
        <button type="button" id="login-register" style="${btnSecondary}flex:1;">Hesap Aç</button>
        <button type="button" id="login-recover" style="${btnSecondary}flex:1;">Şifremi Unuttum</button>
      </div>
    `);
    const eye = root.querySelector("#login-eye");
    const pass = root.querySelector("#login-pass");
    eye.addEventListener("click", () => { pass.type = pass.type === "password" ? "text" : "password"; });
    root.querySelector("#login-submit").addEventListener("click", async () => {
      const err = root.querySelector("#login-error");
      err.style.display = "none";
      try {
        const login = root.querySelector("#login-user").value.trim();
        const password = pass.value;
        const r = await api("/auth/login", { method: "POST", body: { login, password } });
        currentUser = r;
        root.remove();
        updateHeader();
        await window.UserUI.renderProfileShortcut();
      } catch (e) { err.textContent = e.message; err.style.display = "block"; }
    });
    root.querySelector("#login-register").addEventListener("click", () => { root.remove(); showRegisterModal(); });
    root.querySelector("#login-recover").addEventListener("click", () => { root.remove(); showRecoverModal(); });
  }

  function showRegisterModal() {
    const qOptions = SECURITY_QUESTIONS.map(q => `<option value="${esc(q.key)}">${esc(q.label)}</option>`).join("");
    const root = modal("Hesap Aç", `
      <div id="reg-error" style="color:#f87171;font-size:0.82rem;margin-bottom:8px;display:none;"></div>
      ${inputRow("Kullanıcı adı (3-32 karakter, harf/rakam/_ . -)", `<input type="text" id="reg-user" style="${inputStyle}">`)}
      ${inputRow("E-posta (isteğe bağlı)", `<input type="email" id="reg-email" style="${inputStyle}">`)}
      ${inputRow("Şifre (min 6 karakter)", `<div style="position:relative;"><input type="password" id="reg-pass" style="${inputStyle}padding-right:44px;"><button type="button" id="reg-eye1" style="position:absolute;right:4px;top:50%;transform:translateY(-50%);background:transparent;border:none;color:#9ca3af;cursor:pointer;font-size:0.9rem;padding:4px 8px;">👁</button></div>`)}
      ${inputRow("Şifre (tekrar)", `<div style="position:relative;"><input type="password" id="reg-pass2" style="${inputStyle}padding-right:44px;"><button type="button" id="reg-eye2" style="position:absolute;right:4px;top:50%;transform:translateY(-50%);background:transparent;border:none;color:#9ca3af;cursor:pointer;font-size:0.9rem;padding:4px 8px;">👁</button></div>`)}
      <div style="margin:14px 0 8px;color:#9ca3af;font-size:0.78rem;">Şifre kurtarma için 3 güvenlik sorusu ve cevabı belirleyin:</div>
      ${[0, 1, 2].map(i => `
        <div style="border:1px solid #374151;border-radius:8px;padding:10px;margin-bottom:8px;">
          <select id="reg-q${i}" style="${inputStyle}margin-bottom:6px;">${qOptions}</select>
          <input type="text" id="reg-a${i}" placeholder="Cevap" style="${inputStyle}">
        </div>
      `).join("")}
      <button type="button" id="reg-submit" style="${btnStyle}margin-top:8px;">Kayıt Ol</button>
    `);
    root.querySelectorAll("#reg-eye1,#reg-eye2").forEach(eye => {
      eye.addEventListener("click", () => {
        const id = eye.id === "reg-eye1" ? "reg-pass" : "reg-pass2";
        const el = root.querySelector("#" + id);
        el.type = el.type === "password" ? "text" : "password";
      });
    });
    root.querySelector("#reg-submit").addEventListener("click", async () => {
      const err = root.querySelector("#reg-error");
      err.style.display = "none";
      try {
        const username = root.querySelector("#reg-user").value.trim();
        const email = root.querySelector("#reg-email").value.trim();
        const password = root.querySelector("#reg-pass").value;
        const password2 = root.querySelector("#reg-pass2").value;
        if (password !== password2) throw new Error("Şifreler eşleşmiyor");
        const securityQuestions = [0, 1, 2].map(i => ({
          key: root.querySelector(`#reg-q${i}`).value,
          answer: root.querySelector(`#reg-a${i}`).value.trim()
        }));
        if (securityQuestions.some(q => !q.answer)) throw new Error("Her güvenlik sorusuna cevap verin");
        const r = await api("/auth/register", { method: "POST", body: { username, email: email || undefined, password, securityQuestions } });
        currentUser = r;
        root.remove();
        alert(`Hesabınız açıldı. Kayıt numaranız: ${r.registerNumber}`);
        updateHeader();
        await window.UserUI.renderProfileShortcut();
      } catch (e) { err.textContent = e.message; err.style.display = "block"; }
    });
  }

  function showRecoverModal() {
    const root = modal("Şifremi Unuttum", `
      <div id="rec-error" style="color:#f87171;font-size:0.82rem;margin-bottom:8px;display:none;"></div>
      <div id="rec-step1">
        ${inputRow("Kullanıcı adı veya kayıt numarası", `<input type="text" id="rec-login" style="${inputStyle}">`)}
        <button type="button" id="rec-start" style="${btnStyle}">Devam</button>
      </div>
      <div id="rec-step2" style="display:none;">
        <div id="rec-questions"></div>
        <button type="button" id="rec-verify" style="${btnStyle}margin-top:8px;">Doğrula</button>
      </div>
      <div id="rec-step3" style="display:none;">
        ${inputRow("Yeni şifre (min 6)", `<input type="password" id="rec-pass" style="${inputStyle}">`)}
        <button type="button" id="rec-reset" style="${btnStyle}">Şifreyi Sıfırla</button>
      </div>
    `);
    let resetToken = null;
    const loginInput = () => root.querySelector("#rec-login").value.trim();
    root.querySelector("#rec-start").addEventListener("click", async () => {
      const err = root.querySelector("#rec-error"); err.style.display = "none";
      try {
        const r = await api("/auth/recover/start", { method: "POST", body: { login: loginInput() } });
        const qs = r.questions || [];
        root.querySelector("#rec-questions").innerHTML = qs.map((q, i) => {
          const label = SECURITY_QUESTIONS.find(s => s.key === q.key)?.label || q.key;
          return inputRow(label, `<input type="text" data-a="${i}" style="${inputStyle}">`);
        }).join("");
        root.querySelector("#rec-step1").style.display = "none";
        root.querySelector("#rec-step2").style.display = "block";
      } catch (e) { err.textContent = e.message; err.style.display = "block"; }
    });
    root.querySelector("#rec-verify").addEventListener("click", async () => {
      const err = root.querySelector("#rec-error"); err.style.display = "none";
      try {
        const answers = Array.from(root.querySelectorAll("[data-a]")).map(el => el.value.trim());
        const r = await api("/auth/recover/verify", { method: "POST", body: { login: loginInput(), answers } });
        resetToken = r.resetToken;
        root.querySelector("#rec-step2").style.display = "none";
        root.querySelector("#rec-step3").style.display = "block";
      } catch (e) { err.textContent = e.message; err.style.display = "block"; }
    });
    root.querySelector("#rec-reset").addEventListener("click", async () => {
      const err = root.querySelector("#rec-error"); err.style.display = "none";
      try {
        await api("/auth/recover/reset", { method: "POST", body: { resetToken, password: root.querySelector("#rec-pass").value } });
        alert("Şifreniz güncellendi. Giriş yapabilirsiniz.");
        root.remove();
        showLoginModal();
      } catch (e) { err.textContent = e.message; err.style.display = "block"; }
    });
  }

  function updateHeader() {
    const header = document.querySelector("header");
    if (!header) return;
    let bar = document.getElementById("uui-user-bar");
    if (!bar) {
      bar = document.createElement("div");
      bar.id = "uui-user-bar";
      bar.style.cssText = "position:absolute;top:16px;right:16px;display:flex;gap:8px;align-items:center;";
      header.style.position = "relative";
      header.appendChild(bar);
    }
    if (!currentUser) {
      bar.innerHTML = `<button type="button" id="uui-login-btn" style="${btnSecondary}">Giriş / Kayıt</button>`;
      bar.querySelector("#uui-login-btn").addEventListener("click", showLoginModal);
    } else {
      bar.innerHTML = `
        <button type="button" id="uui-profile-btn" style="${btnSecondary}">
          ${esc(currentUser.username)}${currentUser.isAdmin ? " · admin" : ""}
        </button>
        <button type="button" id="uui-logout-btn" style="${btnSecondary}">Çıkış</button>
      `;
      bar.querySelector("#uui-profile-btn").addEventListener("click", () => window.UserUI.showProfilePage());
      bar.querySelector("#uui-logout-btn").addEventListener("click", async () => {
        try { await api("/auth/logout", { method: "POST" }); } catch {}
        currentUser = null;
        updateHeader();
        window.UserUI.closeProfilePage();
      });
    }
  }

  async function refreshMe() {
    try {
      const r = await api("/auth/me");
      currentUser = r.ok ? r : null;
    } catch { currentUser = null; }
    return currentUser;
  }

  window.UserUI = window.UserUI || {};
  window.UserUI.API = api;
  window.UserUI.esc = esc;
  window.UserUI.inputStyle = inputStyle;
  window.UserUI.btnStyle = btnStyle;
  window.UserUI.btnSecondary = btnSecondary;
  window.UserUI.modal = modal;
  window.UserUI.inputRow = inputRow;
  window.UserUI.getCurrentUser = () => currentUser;
  window.UserUI.refreshMe = refreshMe;
  window.UserUI.updateHeader = updateHeader;
  window.UserUI.showLoginModal = showLoginModal;
  window.UserUI.showRegisterModal = showRegisterModal;
  window.UserUI.showRecoverModal = showRecoverModal;

  window.addEventListener("load", async () => {
    await refreshMe();
    updateHeader();
    if (window.UserUI.renderProfileShortcut) await window.UserUI.renderProfileShortcut();
  });
})();
