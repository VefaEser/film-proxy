// user-ui2.js — Part 2/2 (Profile page, Admin panel, Vote modal, Comment section)
(function () {
  "use strict";

  const API_BASE = "https://film-proxy.stavaft.workers.dev";

  async function loadScript(path) {
    if (document.querySelector(`script[src="${path}"]`)) return;
    return new Promise((res) => {
      const s = document.createElement("script");
      s.src = path;
      s.onload = res;
      s.onerror = res;
      document.head.appendChild(s);
    });
  }

  function ensureUI2Ready() {
    return new Promise((resolve) => {
      if (window.UserUI && window.UserUI.modal) return resolve();
      const check = setInterval(() => {
        if (window.UserUI && window.UserUI.modal) { clearInterval(check); resolve(); }
      }, 50);
    });
  }

  // ---------- Profile Page ----------
  async function showProfilePage() {
    await ensureUI2Ready();
    const ui = window.UserUI;
    const me = ui.getCurrentUser();
    if (!me) { ui.showLoginModal(); return; }

    const old = document.getElementById("uui-profile-page");
    if (old) old.remove();
    const page = document.createElement("div");
    page.id = "uui-profile-page";
    page.style.cssText = "position:fixed;inset:0;background:rgba(0,0,0,0.9);z-index:9998;display:flex;align-items:flex-start;justify-content:center;padding:16px;overflow-y:auto;";
    page.innerHTML = `
      <div style="background:#1f2937;border:1px solid #374151;border-radius:12px;max-width:1000px;width:100%;padding:16px;margin:24px 0;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;">
          <div>
            <h2 style="margin:0;color:#f3f4f6;font-size:1.2rem;">Profilim</h2>
            <div style="color:#9ca3af;font-size:0.8rem;margin-top:4px;">
              ${ui.esc(me.username)} · Kayıt #${me.registerNumber}${me.isAdmin ? " · Admin" : ""}
            </div>
          </div>
          <button type="button" id="uui-profile-close" style="background:transparent;border:none;color:#9ca3af;font-size:1.4rem;cursor:pointer;">✕</button>
        </div>

        <div style="display:flex;gap:8px;margin-bottom:14px;flex-wrap:wrap;">
          <label style="display:flex;align-items:center;gap:6px;color:#f3f4f6;font-size:0.85rem;">
            <input type="checkbox" id="uui-public-toggle" ${me.isPublic ? "checked" : ""}> Listelerimi herkese açık yap
          </label>
          <button type="button" id="uui-change-pass" style="${ui.btnSecondary}">Şifre Değiştir</button>
          <button type="button" id="uui-rename" style="${ui.btnSecondary}">Kullanıcı Adı Değiştir</button>
          ${me.isAdmin ? `<button type="button" id="uui-open-admin" style="${ui.btnSecondary}">Yönetim Paneli</button>` : ""}
        </div>

        <div style="display:flex;gap:8px;margin-bottom:14px;flex-wrap:wrap;">
          <button type="button" data-tab="watched" class="uui-tab" style="${ui.btnStyle}max-width:200px;">İzlediklerim</button>
          <button type="button" data-tab="want" class="uui-tab" style="${ui.btnSecondary}max-width:200px;">İzleyeceklerim</button>
          <button type="button" data-tab="wont" class="uui-tab" style="${ui.btnSecondary}max-width:200px;">İzlemeyeceklerim</button>
        </div>

        <div id="uui-list-view" style="border-top:1px solid #374151;padding-top:14px;"></div>
      </div>`;
    document.body.appendChild(page);
    page.querySelector("#uui-profile-close").addEventListener("click", () => page.remove());
    page.addEventListener("click", (e) => { if (e.target === page) page.remove(); });

    const publicToggle = page.querySelector("#uui-public-toggle");
    publicToggle.addEventListener("change", async () => {
      try { await ui.API("/user/profile", { method: "PUT", body: { isPublic: publicToggle.checked } }); }
      catch (e) { alert(e.message); publicToggle.checked = !publicToggle.checked; }
    });
    page.querySelector("#uui-change-pass").addEventListener("click", showChangePassword);
    page.querySelector("#uui-rename").addEventListener("click", showRenameUser);
    if (me.isAdmin) page.querySelector("#uui-open-admin").addEventListener("click", showAdminPanel);

    let currentTab = "watched";
    let currentPage = 1;
    let currentSort = "year";

    const loadList = async () => {
      const view = page.querySelector("#uui-list-view");
      view.innerHTML = `<p style="color:#9ca3af;font-size:0.85rem;">Yükleniyor...</p>`;
      try {
        const r = await ui.API(`/user/lists/${currentTab}?page=${currentPage}&sort=${currentSort}`);
        const { items, total, pageSize } = r;
        const totalPages = Math.max(1, Math.ceil(total / pageSize));
        view.innerHTML = `
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;flex-wrap:wrap;gap:8px;">
            <div style="color:#f3f4f6;font-size:0.85rem;">
              Toplam <strong>${total}</strong> film
            </div>
            <div style="display:flex;gap:6px;">
              <button type="button" id="uui-sort-year" style="${currentSort === "year" ? ui.btnStyle : ui.btnSecondary}width:auto;">Yıla göre</button>
              <button type="button" id="uui-sort-imdb" style="${currentSort === "imdb" ? ui.btnStyle : ui.btnSecondary}width:auto;">IMDb'ye göre</button>
            </div>
          </div>
          <div style="margin-bottom:10px;display:flex;gap:8px;flex-wrap:wrap;">
            <input type="file" id="uui-csv-${currentTab}" accept=".csv,text/csv" style="font-size:0.8rem;">
            <span style="color:#9ca3af;font-size:0.75rem;">Bu listeye CSV aktar (Const, Original Title, Title, URL, Imdb Rating, Num Votes, Runtime, Year, Genres, Directors)</span>
          </div>
          <div id="uui-list-items"></div>
          <div style="display:flex;justify-content:space-between;align-items:center;margin-top:12px;gap:8px;">
            <button type="button" id="uui-prev" ${currentPage <= 1 ? "disabled" : ""} style="${ui.btnSecondary}">← Önceki</button>
            <span style="color:#9ca3af;font-size:0.8rem;">Sayfa ${currentPage} / ${totalPages}</span>
            <button type="button" id="uui-next" ${currentPage >= totalPages ? "disabled" : ""} style="${ui.btnSecondary}">Sonraki →</button>
          </div>
        `;
        const listEl = view.querySelector("#uui-list-items");
        if (!items.length) {
          listEl.innerHTML = `<p style="color:#9ca3af;font-size:0.85rem;">Bu listede henüz film yok.</p>`;
        } else {
          listEl.innerHTML = items.map(it => `
            <div style="background:#111827;border:1px solid #374151;border-radius:8px;padding:10px;margin-bottom:6px;display:flex;justify-content:space-between;align-items:center;gap:8px;">
              <div style="min-width:0;flex:1;">
                <div style="color:#f3f4f6;font-weight:600;font-size:0.88rem;">${ui.esc(it.title_original || it.title_tr || it.movie_id)}${it.year ? ` <span style="color:#60a5fa;font-weight:500;">(${it.year})</span>` : ""}</div>
                <div style="color:#9ca3af;font-size:0.75rem;margin-top:2px;">${it.imdb_rating ? `IMDb ${it.imdb_rating}` : ""} ${it.directors ? `· ${ui.esc(it.directors)}` : ""}</div>
              </div>
              <button type="button" data-remove="${ui.esc(it.movie_id)}" style="${ui.btnSecondary}">Kaldır</button>
            </div>
          `).join("");
          listEl.querySelectorAll("[data-remove]").forEach(b => b.addEventListener("click", async () => {
            try { await ui.API(`/user/lists/remove/${currentTab}/${encodeURIComponent(b.dataset.remove)}`, { method: "DELETE" }); loadList(); }
            catch (e) { alert(e.message); }
          }));
        }
        view.querySelector("#uui-prev")?.addEventListener("click", () => { if (currentPage > 1) { currentPage--; loadList(); } });
        view.querySelector("#uui-next")?.addEventListener("click", () => { currentPage++; loadList(); });
        view.querySelector("#uui-sort-year")?.addEventListener("click", () => { currentSort = "year"; currentPage = 1; loadList(); });
        view.querySelector("#uui-sort-imdb")?.addEventListener("click", () => { currentSort = "imdb"; currentPage = 1; loadList(); });
        const csvInput = view.querySelector(`#uui-csv-${currentTab}`);
        csvInput?.addEventListener("change", async (e) => {
          const f = e.target.files?.[0];
          if (!f) return;
          const text = await f.text();
          try {
            const r = await ui.API("/user/csv-import", { method: "POST", body: { listType: currentTab, csvText: text } });
            alert(`CSV aktarıldı. Eklenen: ${r.added}, çakışma: ${r.conflicts}, toplam: ${r.total}`);
            loadList();
          } catch (err) { alert("CSV hatası: " + err.message); }
        });
      } catch (e) {
        view.innerHTML = `<p style="color:#f87171;font-size:0.85rem;">${ui.esc(e.message)}</p>`;
      }
    };

    page.querySelectorAll(".uui-tab").forEach(b => b.addEventListener("click", () => {
      currentTab = b.dataset.tab;
      currentPage = 1;
      page.querySelectorAll(".uui-tab").forEach(x => x.style.cssText = ui.btnSecondary + "max-width:200px;");
      b.style.cssText = ui.btnStyle + "max-width:200px;";
      loadList();
    }));

    loadList();
  }

  async function showChangePassword() {
    const ui = window.UserUI;
    const root = ui.modal("Şifre Değiştir", `
      <div id="cpass-err" style="color:#f87171;font-size:0.82rem;margin-bottom:8px;display:none;"></div>
      ${ui.inputRow("Mevcut şifre", `<input type="password" id="cp-old" style="${ui.inputStyle}">`)}
      ${ui.inputRow("Yeni şifre (min 6)", `<input type="password" id="cp-new" style="${ui.inputStyle}">`)}
      <button type="button" id="cp-submit" style="${ui.btnStyle}">Kaydet</button>
    `);
    root.querySelector("#cp-submit").addEventListener("click", async () => {
      const err = root.querySelector("#cpass-err"); err.style.display = "none";
      try {
        await ui.API("/auth/change-password", { method: "POST", body: {
          oldPassword: root.querySelector("#cp-old").value,
          newPassword: root.querySelector("#cp-new").value
        }});
        root.remove();
        alert("Şifre güncellendi.");
      } catch (e) { err.textContent = e.message; err.style.display = "block"; }
    });
  }

  async function showRenameUser() {
    const ui = window.UserUI;
    const root = ui.modal("Kullanıcı Adı Değiştir", `
      <div id="ren-err" style="color:#f87171;font-size:0.82rem;margin-bottom:8px;display:none;"></div>
      ${ui.inputRow("Yeni kullanıcı adı", `<input type="text" id="ren-name" style="${ui.inputStyle}">`)}
      <button type="button" id="ren-submit" style="${ui.btnStyle}">Kaydet</button>
    `);
    root.querySelector("#ren-submit").addEventListener("click", async () => {
      const err = root.querySelector("#ren-err"); err.style.display = "none";
      try {
        const r = await ui.API("/auth/rename", { method: "POST", body: { username: root.querySelector("#ren-name").value.trim() } });
        await ui.refreshMe();
        ui.updateHeader();
        root.remove();
        alert("Kullanıcı adı güncellendi: " + r.username);
      } catch (e) { err.textContent = e.message; err.style.display = "block"; }
    });
  }

  // ---------- Admin Panel ----------
  async function showAdminPanel() {
    const ui = window.UserUI;
    const root = document.createElement("div");
    root.id = "uui-admin-panel";
    root.style.cssText = "position:fixed;inset:0;background:rgba(0,0,0,0.9);z-index:9999;display:flex;align-items:flex-start;justify-content:center;padding:16px;overflow-y:auto;";
    root.innerHTML = `
      <div style="background:#1f2937;border:1px solid #374151;border-radius:12px;max-width:1100px;width:100%;padding:16px;margin:24px 0;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;">
          <h2 style="margin:0;color:#f3f4f6;font-size:1.2rem;">Yönetim Paneli</h2>
          <button type="button" id="uui-admin-close" style="background:transparent;border:none;color:#9ca3af;font-size:1.4rem;cursor:pointer;">✕</button>
        </div>
        <div style="display:flex;gap:8px;margin-bottom:14px;flex-wrap:wrap;">
          <button type="button" data-atab="users" class="uui-atab" style="${ui.btnStyle}width:auto;">Kullanıcılar</button>
          <button type="button" data-atab="comments" class="uui-atab" style="${ui.btnSecondary}width:auto;">Yorumlar</button>
          <button type="button" data-atab="suggestions" class="uui-atab" style="${ui.btnSecondary}width:auto;">Öneriler</button>
        </div>
        <div id="uui-admin-view"></div>
      </div>`;
    document.body.appendChild(root);
    root.querySelector("#uui-admin-close").addEventListener("click", () => root.remove());
    root.addEventListener("click", (e) => { if (e.target === root) root.remove(); });

    const view = root.querySelector("#uui-admin-view");
    let activeTab = "users";
    let page = 1;

    const loadTab = async () => {
      view.innerHTML = `<p style="color:#9ca3af;">Yükleniyor...</p>`;
      if (activeTab === "users") {
        try {
          const r = await ui.API(`/admin/users?page=${page}`);
          const { users, total } = r;
          view.innerHTML = `
            <div style="color:#9ca3af;font-size:0.85rem;margin-bottom:10px;">Toplam ${total} kullanıcı</div>
            ${users.map(u => `
              <div style="background:#111827;border:1px solid #374151;border-radius:8px;padding:10px;margin-bottom:8px;">
                <div style="display:flex;justify-content:space-between;flex-wrap:wrap;gap:8px;">
                  <div>
                    <strong style="color:#f3f4f6;">${ui.esc(u.username)}</strong>
                    <span style="color:#60a5fa;">#${u.register_number}</span>
                    ${u.is_admin ? `<span style="color:#fbbf24;font-size:0.75rem;margin-left:6px;">ADMIN</span>` : ""}
                    ${u.is_approved ? `<span style="color:#34d399;font-size:0.75rem;margin-left:6px;">ONAYLI</span>` : ""}
                    ${u.is_suspended ? `<span style="color:#f87171;font-size:0.75rem;margin-left:6px;">ASKIYA ALINMIŞ</span>` : ""}
                  </div>
                  <div style="display:flex;gap:4px;flex-wrap:wrap;">
                    <button type="button" data-act="approve" data-id="${u.id}" data-val="${u.is_approved ? 0 : 1}" style="${ui.btnSecondary}font-size:0.72rem;">${u.is_approved ? "Onayı Kaldır" : "Onayla"}</button>
                    <button type="button" data-act="suspend" data-id="${u.id}" data-val="${u.is_suspended ? 0 : 1}" style="${ui.btnSecondary}font-size:0.72rem;">${u.is_suspended ? "Askıdan Al" : "Askıya Al"}</button>
                    <button type="button" data-act="admin" data-id="${u.id}" data-val="${u.is_admin ? 0 : 1}" style="${ui.btnSecondary}font-size:0.72rem;">${u.is_admin ? "Admin Kaldır" : "Admin Yap"}</button>
                    <button type="button" data-act="delete" data-id="${u.id}" style="${ui.btnSecondary}color:#f87171;font-size:0.72rem;">Sil</button>
                  </div>
                </div>
              </div>
            `).join("")}
          `;
          view.querySelectorAll("[data-act]").forEach(b => b.addEventListener("click", async () => {
            const id = parseInt(b.dataset.id);
            const act = b.dataset.act;
            try {
              if (act === "approve") await ui.API(`/admin/users/${id}`, { method: "PUT", body: { isApproved: b.dataset.val === "1" } });
              else if (act === "suspend") await ui.API(`/admin/users/${id}`, { method: "PUT", body: { isSuspended: b.dataset.val === "1" } });
              else if (act === "admin") await ui.API(`/admin/users/${id}`, { method: "PUT", body: { isAdmin: b.dataset.val === "1" } });
              else if (act === "delete") { if (confirm("Kullanıcıyı silmek istediğinize emin misiniz?")) await ui.API(`/admin/users/${id}`, { method: "PUT", body: { deleted: true } }); }
              loadTab();
            } catch (e) { alert(e.message); }
          }));
        } catch (e) { view.innerHTML = `<p style="color:#f87171;">${ui.esc(e.message)}</p>`; }
      } else if (activeTab === "comments") {
        try {
          const r = await ui.API(`/admin/comments?status=pending`);
          const { comments } = r;
          view.innerHTML = comments.length ? comments.map(c => `
            <div style="background:#111827;border:1px solid #374151;border-radius:8px;padding:10px;margin-bottom:8px;">
              <div style="color:#9ca3af;font-size:0.75rem;margin-bottom:4px;">${ui.esc(c.username)} · ${ui.esc(c.movie_id)}</div>
              <div style="color:#f3f4f6;font-size:0.85rem;margin-bottom:8px;">${ui.esc(c.content)}</div>
              <div style="display:flex;gap:6px;">
                <button type="button" data-cact="approved" data-cid="${c.id}" style="${ui.btnSecondary}color:#34d399;font-size:0.72rem;">Onayla</button>
                <button type="button" data-cact="rejected" data-cid="${c.id}" style="${ui.btnSecondary}color:#f87171;font-size:0.72rem;">Reddet</button>
              </div>
            </div>
          `).join("") : `<p style="color:#9ca3af;">Onay bekleyen yorum yok.</p>`;
          view.querySelectorAll("[data-cact]").forEach(b => b.addEventListener("click", async () => {
            try { await ui.API(`/admin/comments/${b.dataset.cid}`, { method: "PUT", body: { status: b.dataset.cact } }); loadTab(); }
            catch (e) { alert(e.message); }
          }));
        } catch (e) { view.innerHTML = `<p style="color:#f87171;">${ui.esc(e.message)}</p>`; }
      } else if (activeTab === "suggestions") {
        try {
          const r = await ui.API(`/admin/suggestions?status=pending`);
          const { suggestions } = r;
          view.innerHTML = suggestions.length ? suggestions.map(s => `
            <div style="background:#111827;border:1px solid #374151;border-radius:8px;padding:10px;margin-bottom:8px;">
              <div style="color:#9ca3af;font-size:0.75rem;">${ui.esc(s.username)} · ${ui.esc(s.movie_id)} · ${ui.esc(s.field)}</div>
              <div style="color:#f3f4f6;font-size:0.85rem;margin:4px 0;">Önerilen: ${ui.esc(JSON.stringify(s.value))}</div>
              <div style="display:flex;gap:6px;">
                <button type="button" data-sact="approved" data-sid="${s.id}" style="${ui.btnSecondary}color:#34d399;font-size:0.72rem;">Onayla</button>
                <button type="button" data-sact="rejected" data-sid="${s.id}" style="${ui.btnSecondary}color:#f87171;font-size:0.72rem;">Reddet</button>
              </div>
            </div>
          `).join("") : `<p style="color:#9ca3af;">Onay bekleyen öneri yok.</p>`;
          view.querySelectorAll("[data-sact]").forEach(b => b.addEventListener("click", async () => {
            try { await ui.API(`/admin/suggestions/${b.dataset.sid}`, { method: "PUT", body: { status: b.dataset.sact } }); loadTab(); }
            catch (e) { alert(e.message); }
          }));
        } catch (e) { view.innerHTML = `<p style="color:#f87171;">${ui.esc(e.message)}</p>`; }
      }
    };
    root.querySelectorAll(".uui-atab").forEach(b => b.addEventListener("click", () => {
      activeTab = b.dataset.atab;
      page = 1;
      root.querySelectorAll(".uui-atab").forEach(x => x.style.cssText = ui.btnSecondary + "width:auto;");
      b.style.cssText = ui.btnStyle + "width:auto;";
      loadTab();
    }));
    loadTab();
  }

  // ---------- Vote Modal ----------
  async function showVoteModal(movieId, movieData) {
    const ui = window.UserUI;
    const me = ui.getCurrentUser();
    if (!me) { ui.showLoginModal(); return; }
    let existing = {};
    try { const r = await ui.API(`/user/votes/${encodeURIComponent(movieId)}`); existing = r.votes || {}; }
    catch {}
    const traitList = [
      { key: "violence", label: "Şiddet ve kan" },
      { key: "sex_nudity", label: "Cinsellik ve çıplaklık" },
      { key: "profanity", label: "Argo ve küfür" },
      { key: "drugs", label: "Uyuşturucu kullanımı" },
      { key: "alcohol", label: "Alkol kullanımı" },
      { key: "tobacco", label: "Tütün kullanımı" },
      { key: "lgbt", label: "LGBT+ içeriği" },
      { key: "racism", label: "Irkçılık/ayrımcılık" },
      { key: "disturbing", label: "Ürkütücü sahneler" }
    ];
    const intensity = [["none", "Hiç yok"], ["few", "Birkaç sahnede"], ["side", "Yan konu"], ["main", "Ana konu"]];
    const root = ui.modal(`"${ui.esc(movieData?.original_title || movieId)}" — Değerlendirme Önerisi`, `
      <p style="color:#9ca3af;font-size:0.8rem;margin:0 0 12px;">Bu filmde gördüğünüz içeriği işaretleyin. Önerileriniz admin onayına sunulur ve topluluk oyu olarak sayılır.</p>
      <div id="uui-vote-err" style="color:#f87171;font-size:0.8rem;margin-bottom:8px;display:none;"></div>
      ${traitList.map(t => {
        const cur = existing[t.key]?.intensity || "";
        return `
        <div style="border:1px solid #374151;border-radius:8px;padding:8px;margin-bottom:8px;">
          <div style="color:#f3f4f6;font-size:0.85rem;margin-bottom:6px;">${ui.esc(t.label)}</div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:4px;">
            ${intensity.map(([v, l]) => `<label style="display:flex;align-items:center;gap:4px;font-size:0.72rem;color:#9ca3af;"><input type="radio" name="v_${t.key}" value="${v}" ${cur === v ? "checked" : ""}> ${ui.esc(l)}</label>`).join("")}
          </div>
        </div>`;
      }).join("")}
      <button type="button" id="uui-vote-submit" style="${ui.btnStyle}margin-top:8px;">Kaydet</button>
      <p style="color:#34d399;font-size:0.8rem;margin-top:10px;display:none;" id="uui-vote-ok">Önerileriniz kaydedildi, teşekkürler.</p>
    `);
    root.querySelector("#uui-vote-submit").addEventListener("click", async () => {
      const err = root.querySelector("#uui-vote-err");
      const ok = root.querySelector("#uui-vote-ok");
      err.style.display = "none";
      const votes = {};
      for (const t of traitList) {
        const checked = root.querySelector(`input[name="v_${t.key}"]:checked`);
        if (checked) votes[t.key] = { intensity: checked.value };
      }
      try {
        await ui.API(`/social/edit-suggestions/${encodeURIComponent(movieId)}`, { method: "POST", body: { suggestions: votes } });
        ok.style.display = "block";
      } catch (e) { err.textContent = e.message; err.style.display = "block"; }
    });
  }

  // ---------- Comment Section ----------
  async function showCommentsModal(movieId, movieData) {
    const ui = window.UserUI;
    const me = ui.getCurrentUser();
    const root = ui.modal(`"${ui.esc(movieData?.original_title || movieId)}" — Yorumlar`, `
      <div id="uui-comments-list" style="margin-bottom:12px;"><p style="color:#9ca3af;font-size:0.85rem;">Yükleniyor...</p></div>
      ${me ? `
        <textarea id="uui-comment-input" placeholder="Yorumunuz (3-2000 karakter). Admin onayından sonra yayınlanır." rows="3" style="${ui.inputStyle}resize:vertical;margin-bottom:6px;"></textarea>
        <button type="button" id="uui-comment-submit" style="${ui.btnStyle}">Yorumu Gönder</button>
        <p id="uui-comment-ok" style="color:#34d399;font-size:0.8rem;margin-top:6px;display:none;">Yorumunuz onay kuyruğuna alındı.</p>
      ` : `<p style="color:#9ca3af;font-size:0.85rem;">Yorum yapmak için giriş yapın.</p>`}
    `);
    const load = async () => {
      try {
        const r = await ui.API(`/social/comments/${encodeURIComponent(movieId)}`);
        const list = r.comments || [];
        const listEl = root.querySelector("#uui-comments-list");
        if (!list.length) listEl.innerHTML = `<p style="color:#9ca3af;font-size:0.85rem;">Henüz yorum yok.</p>`;
        else listEl.innerHTML = list.map(c => `
          <div style="background:#111827;border:1px solid #374151;border-radius:8px;padding:10px;margin-bottom:6px;">
            <div style="color:#9ca3af;font-size:0.75rem;margin-bottom:2px;"><strong style="color:#f3f4f6;">${ui.esc(c.username)}</strong> · ${new Date(c.created_at * 1000).toLocaleString("tr-TR")}</div>
            <div style="color:#f3f4f6;font-size:0.85rem;">${ui.esc(c.content)}</div>
          </div>
        `).join("");
      } catch (e) { root.querySelector("#uui-comments-list").innerHTML = `<p style="color:#f87171;">${ui.esc(e.message)}</p>`; }
    };
    root.querySelector("#uui-comment-submit")?.addEventListener("click", async () => {
      try {
        await ui.API(`/social/comments/${encodeURIComponent(movieId)}`, { method: "POST", body: { content: root.querySelector("#uui-comment-input").value } });
        root.querySelector("#uui-comment-input").value = "";
        root.querySelector("#uui-comment-ok").style.display = "block";
      } catch (e) { alert(e.message); }
    });
    load();
  }

  // ---------- Card decoration (attach buttons to film cards) ----------
  function decorateCard(cardEl, movie) {
    if (!cardEl || !movie || cardEl.dataset.uuiDecorated === "1") return;
    cardEl.dataset.uuiDecorated = "1";
    const actions = cardEl.querySelector(".film-actions");
    if (!actions) return;
    const movieId = String(movie.id);
    const btnStyle = "font-size:0.78rem;padding:4px 10px;border:1px solid var(--card-border);background:transparent;color:var(--text-main);border-radius:6px;cursor:pointer;";

    if (!actions.querySelector(".uui-vote-btn")) {
      const vb = document.createElement("button");
      vb.type = "button"; vb.className = "uui-vote-btn"; vb.textContent = "Öneri";
      vb.style.cssText = btnStyle;
      vb.addEventListener("click", () => showVoteModal(movieId, movie));
      actions.appendChild(vb);
    }
    if (!actions.querySelector(".uui-comment-btn")) {
      const cb = document.createElement("button");
      cb.type = "button"; cb.className = "uui-comment-btn"; cb.textContent = "Yorumlar";
      cb.style.cssText = btnStyle;
      cb.addEventListener("click", () => showCommentsModal(movieId, movie));
      actions.appendChild(cb);
    }

    const me = window.UserUI.getCurrentUser();
    if (me) {
      if (!actions.querySelector(".uui-mark-row")) {
        const row = document.createElement("span");
        row.className = "uui-mark-row";
        row.style.cssText = "display:inline-flex;gap:4px;";
        ["watched", "want", "wont"].forEach(lt => {
          const b = document.createElement("button");
          b.type = "button"; b.textContent = lt === "watched" ? "İzledim" : lt === "want" ? "İzleyeceğim" : "İzlemem";
          b.style.cssText = btnStyle;
          b.addEventListener("click", async () => {
            try {
              await window.UserUI.API("/user/lists/add", { method: "POST", body: {
                listType: lt, movieId: "tmdb:" + movieId, imdbId: movie.imdb_id || movie.imdbID || "",
                titleOriginal: movie.original_title || "", titleTr: movie.title || "", year: movie.release_date?.slice(0,4) || null,
                imdbRating: movie.imdbRating || null
              }});
              b.style.background = "#34d399"; b.style.color = "#fff";
              setTimeout(() => { b.style.background = ""; b.style.color = ""; }, 1500);
            } catch (e) { alert(e.message); }
          });
          row.appendChild(b);
        });
        actions.appendChild(row);
      }
    }
  }

  // Expose + auto-hook to renderFilmList
  window.UserUI = window.UserUI || {};
  window.UserUI.renderProfileShortcut = async () => {
    // No-op (kept for API symmetry); profile access via header button
  };
  window.UserUI.showProfilePage = showProfilePage;
  window.UserUI.showAdminPanel = showAdminPanel;
  window.UserUI.showVoteModal = showVoteModal;
  window.UserUI.showCommentsModal = showCommentsModal;
  window.UserUI.decorateCard = decorateCard;

  // Hook into renderFilmList via MutationObserver
  const observer = new MutationObserver((mutations) => {
    for (const m of mutations) {
      for (const node of m.addedNodes) {
        if (node.nodeType === 1 && node.classList?.contains("film-card")) {
          const id = node.dataset.movieId;
          const movies = window.__lastMovies || [];
          const movie = movies.find(x => String(x.id) === String(id));
          if (movie) decorateCard(node, movie);
        }
      }
    }
  });
  const resultsEl = document.getElementById("results");
  if (resultsEl) observer.observe(resultsEl, { childList: true, subtree: true });
  else {
    document.addEventListener("DOMContentLoaded", () => {
      const el = document.getElementById("results");
      if (el) observer.observe(el, { childList: true, subtree: true });
    });
  }
})();
