const API_BASE = "https://film-proxy.stavaft.workers.dev";
const TARGET_COUNT = 18;

function esc(s) {
  return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
function norm(s) { return String(s || "").trim().toLowerCase().replace(/\s+/g, " "); }
function yearOf(m) { return Number(String(m.release_date || "").slice(0, 4)) || Number(m.year) || null; }
function formatVotes(v) {
  if (v == null) return "";
  const n = Number(String(v).replace(/[^\d]/g, ""));
  if (!n) return "";
  return n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}B` : String(n);
}
function posterUrl(m, size = "w342") {
  const p = m.poster_path || m.poster || "";
  if (!p) return "";
  if (p.startsWith("http")) return p;
  return `https://image.tmdb.org/t/p/${size}${p}`;
}
function googleUrl(title, year) {
  const q = `${title || ""} ${year || ""}`.trim();
  return `https://www.google.com/search?q=${encodeURIComponent(q)}`;
}

const STATIC_OPTIONS = {
  story_period: [
    { id: "bc", label: "Milattan önce" },
    ...Array.from({ length: 19 }, (_, i) => ({ id: `c${i + 1}`, label: `${i + 1}. yüzyıl` })),
    { id: "d1900", label: "1900'ler" }, { id: "d1910", label: "1910'lar" }, { id: "d1920", label: "1920'ler" },
    { id: "d1930", label: "1930'lar" }, { id: "d1940", label: "1940'lar" }, { id: "d1950", label: "1950'ler" },
    { id: "d1960", label: "1960'lar" }, { id: "d1970", label: "1970'ler" }, { id: "d1980", label: "1980'ler" },
    { id: "d1990", label: "1990'lar" }, { id: "d2000", label: "2000'ler" }, { id: "d2010", label: "2010'lar" },
    { id: "d2020", label: "2020'ler" }, { id: "future", label: "Geleceğe dair" }
  ],
  story_geography: [
    { id: "city", label: "Şehir" }, { id: "town", label: "Kasaba" }, { id: "village", label: "Köy" },
    { id: "mountain", label: "Dağlık ve yüksek kesimler" }, { id: "desert", label: "Çöl" }, { id: "steppe", label: "Bozkır" },
    { id: "forest", label: "Orman" }, { id: "seaside", label: "Deniz kenarı" }, { id: "riverside", label: "Nehir kenarı" },
    { id: "opensea", label: "Açık deniz" }, { id: "air", label: "Hava" }, { id: "space", label: "Dünya dışı" }
  ],
  season: [
    { id: "spring", label: "İlkbahar" }, { id: "summer", label: "Yaz" },
    { id: "autumn", label: "Sonbahar" }, { id: "winter", label: "Kış" }
  ],
  character_traits: [
    { id: "male_main", label: "Erkek ana karakter" }, { id: "female_main", label: "Kadın ana karakter" },
    { id: "child_main", label: "Çocuk ana karakter" }, { id: "lgbt_main", label: "LGBT+ ana karakter" },
    { id: "male_support", label: "Erkek yan karakter" }, { id: "female_support", label: "Kadın yan karakter" },
    { id: "child_support", label: "Çocuk yan karakter" }, { id: "lgbt_support", label: "LGBT+ yan karakter" },
    { id: "male_extra", label: "Erkek figüran" }, { id: "female_extra", label: "Kadın figüran" },
    { id: "child_extra", label: "Çocuk figüran" }, { id: "lgbt_extra", label: "LGBT+ figüran" },
    { id: "young_main", label: "Genç ana karakter" }, { id: "young_support", label: "Genç yan karakter" },
    { id: "young_extra", label: "Genç figüran" }, { id: "middle_main", label: "Orta yaşlı ana karakter" },
    { id: "middle_support", label: "Orta yaşlı yan karakter" }, { id: "middle_extra", label: "Orta yaşlı figüran" },
    { id: "old_main", label: "Yaşlı ana karakter" }, { id: "old_support", label: "Yaşlı yan karakter" },
    { id: "old_extra", label: "Yaşlı figüran" }, { id: "disabled_main", label: "Engelli ana karakter" },
    { id: "disabled_support", label: "Engelli yan karakter" }, { id: "disabled_extra", label: "Engelli figüran" },
    { id: "animal", label: "Ana veya yan karakter bir hayvan" }
  ],
  aspect_ratio: [
    { id: "1:1", label: "1:1" }, { id: "4:3", label: "4:3" }, { id: "16:9", label: "16:9" },
    { id: "18:9", label: "18:9" }, { id: "21:9", label: "21:9" }
  ],
  narrative_style: [
    { id: "multi", label: "Farklı hikayelerin ayrı ayrı anlatımı" },
    { id: "reverse", label: "Sondan başa doğru giden hikaye" },
    { id: "linear", label: "Baştan sona giden hikaye" },
    { id: "flashback", label: "Ara ara geriye dönüşler yapan hikaye" },
    { id: "end_first", label: "Sonu önce anlatılıp başı sonra anlatılan hikaye" },
    { id: "mid_first", label: "Ortası önce anlatılıp, öncesi ve sonrası sonra anlatılan hikaye" },
    { id: "fast", label: "Çok fazla olayın olduğu hareketli hikaye" },
    { id: "slow", label: "Çok az olayın olduğu durgun hikaye" },
    { id: "no_end", label: "Sonu olmayan hikaye" },
    { id: "alt_end", label: "Alternatif sonlu hikaye" },
    { id: "alt_narr", label: "Alternatif anlatımlı hikaye" }
  ],
  production_process: [
    { id: "amateur", label: "Amatör film" }, { id: "indie", label: "Bağımsız film" },
    { id: "art", label: "Sanat filmi" }, { id: "big", label: "Büyük prodüksiyon" },
    { id: "bmovie", label: "B movie" }, { id: "avant", label: "Avangart film" },
    { id: "studio", label: "Stüdyo filmi" }, { id: "no_music", label: "Müziksiz film" },
    { id: "rare_music", label: "Nadir Müzikli Film" }, { id: "handheld", label: "Hareketli kamera kullanımı" },
    { id: "propaganda", label: "Propaganda filmi" }, { id: "dogme", label: "Dogme 95" }
  ],
  sound: [
    { id: "ambient", label: "Sürekli doğal ortam gürültüsü" },
    { id: "music", label: "Yoğun müzik kullanımı" },
    { id: "effects", label: "Yoğun gürültülü efekt kullanımı" },
    { id: "voiceover_ext", label: "Dış ses kullanımı" },
    { id: "voiceover_int", label: "İç ses kullanımı" },
    { id: "silent", label: "Sessiz film" },
    { id: "dubbed", label: "Ses dublajı çoğunlukla stüdyoda yapılmış" }
  ],
  reality: [
    { id: "true", label: "Tamamen gerçek olaylara sadık" },
    { id: "mostly_true", label: "Çoğunlukla gerçek olaylara dayalı" },
    { id: "inspired", label: "Gerçek olaylardan esinlenmiş" },
    { id: "realistic", label: "Gerçekçi" },
    { id: "fictional", label: "Sıradışı ve aşırı tesadüfi olaylara dayalı tamamen kurgusal senaryo" },
    { id: "utopic", label: "Utopik" }
  ],
  story_dimensions: [
    { id: "has_sequel", label: "Devam filmi var" }, { id: "is_sequel", label: "Devam filmi" },
    { id: "series_tight", label: "Diziyle sıkı bağlantılı" }, { id: "series_loose", label: "Diziyle alakalı" },
    { id: "concept", label: "Konsept filmi" }, { id: "has_version", label: "Farklı versiyonu var" },
    { id: "same_event", label: "Aynı olay farklı film" }
  ],
  sex_details: [
    { id: "sexual_touch", label: "Cinsel temas var" }, { id: "kissing", label: "Öpüşme var" },
    { id: "sex", label: "Sevişme var" }, { id: "penetration", label: "Penatrasyon var" },
    { id: "male_genital", label: "Erkek cinsel organı gözüküyor" },
    { id: "female_genital", label: "Kadın cinsel organı gözüküyor" },
    { id: "female_breast", label: "Kadın emzirme organı gözüküyor" },
    { id: "male_butt", label: "Erkek kaba eti gözüküyor" },
    { id: "female_butt", label: "Kadın kaba eti gözüküyor" },
    { id: "extreme_nudity", label: "Teşhircilik yok ama aşırı çıplaklık var" },
    { id: "mild_nudity", label: "Çıplaklık az" }
  ]
};

const FAMILY_TRAITS = [
  { key: "tobacco", label: "Tütün ürünleri kullanımı" },
  { key: "alcohol", label: "Alkol kullanımı" },
  { key: "drugs", label: "Uyuşturucu kullanımı" },
  { key: "sex_nudity", label: "Cinsel sahneler ve çıplaklık" },
  { key: "violence", label: "Şiddet ve kan" },
  { key: "crimes_against_humanity", label: "İnsanlığa karşı suçlar" },
  { key: "terror", label: "Terör" },
  { key: "illegal", label: "Yasadışı eylemler" },
  { key: "lgbt", label: "LGBT+ içeriği" },
  { key: "pedophilia", label: "Pedofili, ensest ve diğer cinsel sapkınlıklar" },
  { key: "unmarried", label: "Nikahsız ilişkiler" },
  { key: "profanity", label: "Argo ve küfür kullanımı" },
  { key: "disturbing", label: "Ürpertici veya ürkütücü sahneler" },
  { key: "racism", label: "Irkçılık, ayrımcılık, dini değerlere hakaret ve nefret suçu" }
];
const INTENSITY = [
  ["none", "Hiç yok"],
  ["few", "Bir veya birkaç sahnede var"],
  ["side", "Yan konu (yoğun)"],
  ["main", "Ana konu (çok yoğun)"]
];
const APPROACH = [
  ["bad", "Kötü gösteriyor"],
  ["neutral", "Tarafsız kalıyor"],
  ["legit", "Meşrulaştırıyor"]
];

function renderFamilyGuide() {
  const list = document.getElementById("familyList");
  if (!list) return;
  list.innerHTML = FAMILY_TRAITS.map(t => `
    <div class="family-item" data-family-key="${esc(t.key)}">
      <p class="family-title">${esc(t.label)}</p>
      <p class="family-subtitle">İçerik</p>
      <div class="family-levels">
        ${INTENSITY.map(([v, l]) => `<label><input type="radio" name="int_${esc(t.key)}" value="${v}" data-radio="1"> ${esc(l)}</label>`).join("")}
      </div>
      <p class="family-subtitle">Yaklaşım</p>
      <div class="family-levels">
        ${APPROACH.map(([v, l]) => `<label><input type="radio" name="app_${esc(t.key)}" value="${v}" data-radio="1"> ${esc(l)}</label>`).join("")}
      </div>
      ${t.key === "sex_nudity" ? `
        <div class="ms" data-ms data-name="sex_details">
          <span class="ms-label">Diğer şeyler</span>
          <div class="ms-box"><div class="ms-chips-and-input"><div class="ms-chips"></div><input class="ms-input" type="text" placeholder="Ayrıntı ara veya yaz..."></div><button type="button" class="ms-arrow">▼</button></div>
          <div class="ms-panel"><div class="ms-panel-head"><button type="button" class="ms-select-all" data-state="">Tümünü seç</button></div><div class="ms-options"></div><div class="ms-suggestions"></div></div>
          <div class="ms-extra"><label><input type="checkbox" class="ms-conflict"> Çakışan filmleri dahil et</label></div>
        </div>
      ` : ""}
      <label class="family-invisible"><input type="checkbox" class="family-invisible-check"> Gösterilmeyen içeriği değerlendirme</label>
    </div>
  `).join("");
  list.querySelectorAll("[data-ms]").forEach(root => { if (!MS_STATE.get(root)) msInit(root); });
  list.querySelectorAll('input[type="radio"][data-radio="1"]').forEach(r => {
    r.addEventListener("click", () => {
      if (r.dataset.wasChecked === "1") { r.checked = false; r.dataset.wasChecked = ""; }
      else { r.dataset.wasChecked = "1"; }
      const name = r.name;
      list.querySelectorAll(`input[name="${name}"]`).forEach(o => { if (o !== r) o.dataset.wasChecked = ""; });
      syncSexDetails();
    });
  });
  syncSexDetails();
}
function syncSexDetails() {
  document.querySelectorAll('[data-family-key="sex_nudity"]').forEach(el => {
    const noneRadio = el.querySelector('input[name="int_sex_nudity"][value="none"]');
    const ms = el.querySelector('[data-ms][data-name="sex_details"]');
    const disabled = !!noneRadio?.checked;
    if (ms) {
      ms.style.pointerEvents = disabled ? "none" : "";
      ms.style.opacity = disabled ? "0.45" : "";
      if (disabled) {
        const panel = ms.querySelector(".ms-panel");
        if (panel) panel.classList.remove("open");
      }
    }
  });
}

let watchedList = [];
function parseWatchedCSV(text) {
  const lines = text.replace(/^\uFEFF/, "").trim().split(/\r?\n/);
  if (!lines.length) return [];
  const headers = lines[0].split(",").map(h => h.trim().replace(/^"|"$/g, ""));
  const idx = name => headers.findIndex(h => h.toLowerCase() === name.toLowerCase());
  const iTitle = idx("Original Title"), iYear = idx("Year"), iConst = idx("Const"), iDir = idx("Directors");
  if (iTitle < 0) throw new Error("CSV'de 'Original Title' sütunu yok.");
  const splitLine = (line) => {
    const out = []; let cur = ""; let q = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (c === '"') { if (q && line[i+1] === '"') { cur += '"'; i++; } else q = !q; }
      else if (c === "," && !q) { out.push(cur); cur = ""; }
      else cur += c;
    }
    out.push(cur);
    return out;
  };
  return lines.slice(1).map(line => {
    const cols = splitLine(line);
    return {
      originalTitle: (cols[iTitle] || "").trim(),
      year: parseInt(cols[iYear]) || null,
      imdbId: iConst >= 0 ? (cols[iConst] || "").trim() : "",
      directors: iDir >= 0 ? (cols[iDir] || "").trim() : ""
    };
  }).filter(r => r.originalTitle);
}
function filterWatchedLocally(movies) {
  if (!watchedList.length) return movies;
  const key = (t, y) => `${norm(t)}|${y || 0}`;
  const set = new Set(watchedList.map(w => key(w.originalTitle, w.year)));
  return movies.filter(m => !set.has(key(m.original_title || m.title, yearOf(m))));
}
function verifyWatched(result) {
  const w = watchedList.find(x => x.imdbId && x.imdbId === result.imdbID);
  if (!w) return { verified: false, reason: "IMDb ID eşleşmedi" };
  if (w.directors) {
    const a = norm(result.directors || "");
    const b = norm(w.directors);
    if (a && !a.includes(b.split(",")[0].trim())) return { verified: false, reason: "Yönetmen eşleşmedi" };
  }
  return { verified: true, reason: "IMDb ID + yönetmen doğrulandı" };
}

function currentMode() {
  return {
    useWebResearch: document.getElementById("useWebResearch")?.checked ?? false,
    useAI: document.getElementById("useAI")?.checked ?? false
  };
}
function updateModeHint() {
  const { useWebResearch, useAI } = currentMode();
  const el = document.getElementById("modeHint");
  if (!el) return;
  let msg = "";
  if (useWebResearch && useAI) msg = "En doğru sonuç: önce web'den kanıt toplanır, yetersizse AI devreye girer.";
  else if (useWebResearch && !useAI) msg = "Hızlı mod: yalnızca web kaynakları. AI'ya özgü alanlar boş kalabilir.";
  else if (!useWebResearch && useAI) msg = "AI modu: web kanıtı olmadan tahmin; doğruluk düşebilir.";
  else msg = "Yalnızca klasik kaynaklar (TMDB, OMDb, Wikidata, Commons). AI alanları boş kalır.";
  el.textContent = msg;
}

function collectFilters() {
  const filters = {};
  document.querySelectorAll("[data-ms]").forEach(root => {
    const name = root.dataset.name;
    if (name === "sex_details") return;
    const v = msGetValues(root);
    const conflict = root.querySelector(".ms-conflict")?.checked ?? false;
    if (v.include.length || v.exclude.length) {
      filters[name] = { include: v.include, exclude: v.exclude, conflict };
    }
  });
  const num = (id, def) => { const el = document.getElementById(id); const v = el ? parseFloat(el.value) : NaN; return Number.isFinite(v) ? v : def; };
  filters.imdbMin = num("imdbMin", 0); filters.imdbMax = num("imdbMax", 10);
  filters.tmdbMin = num("tmdbMin", 0); filters.tmdbMax = num("tmdbMax", 10);
  filters.imdbVotesMin = num("imdbVotesMin", 0);
  filters.tmdbVotesMin = num("tmdbVotesMin", 0);
  filters.yearMin = num("yearMin", null); filters.yearMax = num("yearMax", null);
  filters.runtimeMin = num("runtimeMin", null); filters.runtimeMax = num("runtimeMax", null);
  const ratio = (id, enabledId) => {
    const en = document.getElementById(enabledId);
    if (!en || !en.checked) return null;
    const el = document.getElementById(id);
    return el ? parseFloat(el.value) : null;
  };
  const nr = ratio("nightRatio", "enableLight"); if (nr != null) filters.nightRatioMin = nr;
  const ir = ratio("indoorRatio", "enablePlace"); if (ir != null) filters.indoorRatioMin = ir;
  const dd = ratio("dialogueDensity", "enableDialogue"); if (dd != null) filters.dialogueDensityMin = dd;
  const cr = ratio("colorRatio", "enableColor"); if (cr != null) filters.colorRatioMin = cr;
  const lc = ratio("locationCount", "enablePlaceCount"); if (lc != null) filters.locationCountMin = lc;
  const mainMin = num("charMainMin", null), mainMax = num("charMainMax", null);
  const suppMin = num("charSuppMin", null), suppMax = num("charSuppMax", null);
  const extraMin = num("charExtraMin", null), extraMax = num("charExtraMax", null);
  if (mainMin != null || mainMax != null || suppMin != null || suppMax != null || extraMin != null || extraMax != null) {
    filters.characterDensity = { mainMin, mainMax, supportMin: suppMin, supportMax: suppMax, extraMin, extraMax };
  }
  const family = {};
  document.querySelectorAll("[data-family-key]").forEach(el => {
    const key = el.dataset.familyKey;
    const int = el.querySelector(`input[name="int_${key}"]:checked`)?.value || "";
    const app = el.querySelector(`input[name="app_${key}"]:checked`)?.value || "";
    const inv = el.querySelector(".family-invisible-check")?.checked ?? false;
    let details = null;
    if (key === "sex_nudity") {
      const ms = el.querySelector('[data-ms][data-name="sex_details"]');
      if (ms) {
        const v = msGetValues(ms);
        if (v.include.length || v.exclude.length) details = { include: v.include, exclude: v.exclude, conflict: ms.querySelector(".ms-conflict")?.checked ?? false };
      }
    }
    if (int || app || details) family[key] = { intensity: int, approach: app, evaluateInvisible: inv, details };
  });
  if (Object.keys(family).length) filters.family_content = family;
  return filters;
}

function buildDiscoverParams(filters, page) {
  const params = new URLSearchParams();
  params.set("language", "tr-TR");
  params.set("page", String(page || 1));
  params.set("include_adult", "false");

  const votesActive = (filters.tmdbVotesMin != null && filters.tmdbVotesMin > 0) || (filters.imdbVotesMin != null && filters.imdbVotesMin > 0);
  params.set("sort_by", votesActive ? "vote_average.desc" : "popularity.desc");
  if (votesActive) {
    const vc = Math.max(filters.tmdbVotesMin || 0, filters.imdbVotesMin || 0);
    if (vc > 0) params.set("vote_count.gte", String(vc));
  }

  const validId = (id) => id != null && id !== "" && id !== "__space__";

  if (filters.genres?.include?.length) {
    const ids = filters.genres.include.map(g => g.id).filter(validId);
    if (ids.length) params.set("with_genres", ids.join(","));
  }
  if (filters.genres?.exclude?.length) {
    const ids = filters.genres.exclude.map(g => g.id).filter(validId);
    if (ids.length) params.set("without_genres", ids.join(","));
  }
  if (filters.original_language?.include?.length) {
    const id = filters.original_language.include[0]?.id;
    if (validId(id)) params.set("with_original_language", id);
  }
  if (filters.production_countries?.include?.length) {
    const ids = filters.production_countries.include.map(c => c.id).filter(validId);
    if (ids.length) params.set("with_origin_country", ids.join("|"));
  }
  if (filters.tmdbMin > 0) params.set("vote_average.gte", String(filters.tmdbMin));
  if (filters.tmdbMax < 10) params.set("vote_average.lte", String(filters.tmdbMax));
  if (filters.yearMin != null) params.set("primary_release_date.gte", `${filters.yearMin}-01-01`);
  if (filters.yearMax != null) params.set("primary_release_date.lte", `${filters.yearMax}-12-31`);
  if (filters.runtimeMin != null) params.set("with_runtime.gte", String(filters.runtimeMin));
  if (filters.runtimeMax != null) params.set("with_runtime.lte", String(filters.runtimeMax));

  console.warn("discover params:", params.toString());
  return params;
}

async function runResearch(movies, filters, { refresh = false, onProgress } = {}) {
  const { useWebResearch, useAI } = currentMode();
  const res = await fetch(`${API_BASE}/research`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Accept": "text/event-stream" },
    body: JSON.stringify({ movies: movies.slice(0, TARGET_COUNT), filters, useWebResearch, useAI, refresh })
  });
  if (!res.ok || !res.body) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Araştırma hatası: ${res.status}`);
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  const collected = [];
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const parts = buffer.split("\n\n");
    buffer = parts.pop() || "";
    for (const part of parts) {
      const line = part.split("\n").find(l => l.startsWith("data: "));
      if (!line) continue;
      let msg;
      try { msg = JSON.parse(line.slice(6)); } catch { continue; }
      if (msg.type === "start") onProgress?.({ percent: 0, text: `Başlıyor (${msg.total} film)` });
      else if (msg.type === "step") {
        const pct = Math.round((msg.index / msg.total) * 100);
        const stageText = msg.stage === "zenginleştiriliyor"
          ? `${msg.title} — kaynaklar çekiliyor (${(msg.fields || []).join(", ")})`
          : msg.stage === "önbellekten" ? `${msg.title} — önbellekten`
          : `${msg.title} — okunuyor`;
        onProgress?.({ percent: pct, text: stageText });
      }
      else if (msg.type === "movie") {
        collected.push(msg.movie);
        const pct = Math.round(((msg.index + 1) / msg.total) * 100);
        onProgress?.({ percent: pct, text: `${msg.movie.original_title || msg.movie.title} tamamlandı` });
      }
      else if (msg.type === "done") {
        const list = (msg.movies || collected).map(m => ({ ...m, ai_requested: useAI, web_requested: useWebResearch }));
        return list;
      }
      else if (msg.type === "error") throw new Error(msg.message || "Bilinmeyen hata");
    }
  }
  return collected.map(m => ({ ...m, ai_requested: useAI, web_requested: useWebResearch }));
}

function renderFilmCard(m, filters = {}) {
  const original = m.original_title || m.title || "Bilinmeyen Film";
  const trTitle = m.title && m.title !== m.original_title ? m.title : "";
  const year = yearOf(m);
  const imdb = m.imdbRating || null;
  const votes = formatVotes(m.imdbVotes);
  const genres = Array.isArray(m.genres) ? m.genres.map(g => g.name || g).join(", ") : "";
  const countries = Array.isArray(m.production_countries) ? m.production_countries.map(c => c.name || c).join(", ") : "";
  const langs = Array.isArray(m.spoken_languages) ? m.spoken_languages.map(l => l.name || l).join(", ") : "";

  const detailRows = [
    ["TMDB Puanı", m.vote_average != null ? Number(m.vote_average).toFixed(1) : null],
    ["Süre", m.runtime != null ? `${m.runtime} dk` : null],
    ["Gece / Gündüz", m.night_ratio != null ? `${m.night_ratio}% / ${m.day_ratio ?? (100 - m.night_ratio)}%` : null],
    ["İç / Dış Mekân", m.indoor_ratio != null ? `${m.indoor_ratio}% / ${100 - m.indoor_ratio}%` : null],
    ["Mekân Sayısı", m.location_count ?? null],
    ["Diyalog Yoğunluğu", m.dialogue_density != null ? `${m.dialogue_density}%` : null],
    ["Renk / S&B", m.color_ratio != null ? `${m.color_ratio}% renkli` : null],
    ["En-Boy Oranı", m.aspect_ratio ?? null],
    ["Mevsim", Array.isArray(m.season) ? m.season.join(", ") : m.season ?? null],
    ["Hikâye Yeri", Array.isArray(m.story_locations) ? m.story_locations.join(", ") : null],
    ["Çekim Yeri", Array.isArray(m.filming_locations) && m.filming_locations.length ? m.filming_locations.join(", ") : null],
    ["Özgün Eser", m.original_work ?? null],
    ["İlişkili Filmler", Array.isArray(m.related_films) && m.related_films.length ? m.related_films.join(", ") : null],
    ["Filtre Eşleşmesi", m.filter_match === true ? "Uyuyor" : m.filter_match === false ? "Uymuyor" : null],
    ["Filtre Notları", Array.isArray(m.filter_reasons) && m.filter_reasons.length ? m.filter_reasons.join("; ") : null],
    ["Bilinmeyen Alan", m.unknown ? "Bazı alanlar değerlendirilemedi (mod kapalı olabilir)" : null]
  ].filter(([, v]) => v !== null && v !== undefined && v !== "");

  const detailsHtml = detailRows.map(([label, value]) => `<div class="detail-row"><span class="label">${esc(label)}</span><span class="value">${esc(value)}</span></div>`).join("");
  const overview = m.overview || m.summary || "";
  const overviewHtml = overview ? `<div class="film-overview" id="ov-${esc(m.id)}"><p>${esc(overview)}</p></div>` : "";
  const images = Array.isArray(m.commons_images) ? m.commons_images.slice(0, 10) : [];
  const imagesHtml = images.length ? `
    <div class="film-gallery" id="gal-${esc(m.id)}">
      ${images.map(img => `<a href="${esc(img.pageUrl || img.url)}" target="_blank" rel="noopener"><img src="${esc(img.url)}" alt="${esc(img.title || "")}" loading="lazy"></a>`).join("")}
    </div>` : "";
  const poster = posterUrl(m);
  const watchedInfo = verifyWatched(m);
  const watchedBadge = watchedInfo.verified ? `<div class="film-watched-badge">İzlendi olarak doğrulandı (${esc(watchedInfo.reason)})</div>` : "";
  const unknownClass = m.unknown ? " film-card--unknown" : "";
  const gUrl = googleUrl(original, year);

  const notes = [];
  if (m.ai_requested && m.ai_available === false) notes.push("AI analizi şu an kullanılamıyor; sonuçlar sabit kaynaklardan gösteriliyor.");
  if (m.web_requested && m.web_available === false) notes.push("Web araştırması şu an kullanılamıyor; sonuçlar sabit kaynaklardan gösteriliyor.");
  const availabilityNote = notes.length ? `<div class="film-note">${notes.map(esc).join(" ")}</div>` : "";

  return `
    <article class="film-card${unknownClass}" data-movie-id="${esc(m.id)}">
      <a class="film-poster-link" href="${esc(gUrl)}" target="_blank" rel="noopener">
        ${poster ? `<img class="film-poster" src="${esc(poster)}" alt="${esc(original)} posteri" loading="lazy">` : `<div class="film-poster" aria-hidden="true"></div>`}
      </a>
      <div class="film-info">
        <button type="button" class="film-refresh" data-refresh-id="${esc(m.id)}" title="Yenile" aria-label="Yenile">⟳</button>
        <h3 class="film-title">
          <a href="${esc(gUrl)}" target="_blank" rel="noopener">${esc(original)}</a>
          ${trTitle ? ` <span class="tr-title">(${esc(trTitle)})</span>` : ""}
        </h3>
        <div class="film-meta-line">
          ${year ? `<span class="film-year">${esc(year)}</span>` : ""}
          ${imdb ? `<span class="imdb-rating">IMDb ${esc(imdb)}</span>${votes ? ` <span class="imdb-votes">(${esc(votes)} oy)</span>` : ""}` : ""}
        </div>
        ${genres ? `<div class="film-genres">${esc(genres)}</div>` : ""}
        ${countries ? `<div class="film-countries">${esc(countries)}</div>` : ""}
        ${langs ? `<div class="film-languages">${esc(langs)}</div>` : ""}
        ${watchedBadge}
        ${availabilityNote}
        <div class="film-actions">
          <button type="button" data-toggle="details" data-target="det-${esc(m.id)}">Daha fazla</button>
          ${overview ? `<button type="button" data-toggle="overview" data-target="ov-${esc(m.id)}">Özeti göster</button>` : ""}
          ${images.length ? `<button type="button" data-toggle="gallery" data-target="gal-${esc(m.id)}">Görseller</button>` : ""}
        </div>
        <div class="film-details" id="det-${esc(m.id)}">${detailsHtml}</div>
        ${overviewHtml}
        ${imagesHtml}
      </div>
    </article>`;
}
function renderFilmList(movies, container, filters = {}) {
  container.innerHTML = movies.length ? movies.map(m => renderFilmCard(m, filters)).join("") : `<p class="empty">Sonuç bulunamadı.</p>`;
}

function bindFilmCardEvents(container) {
  container.addEventListener("click", (e) => {
    const btn = e.target.closest("button");
    if (!btn) return;
    if (btn.dataset.toggle) {
      const el = document.getElementById(btn.dataset.target);
      if (!el) return;
      el.classList.toggle("open");
      const isOpen = el.classList.contains("open");
      if (btn.dataset.toggle === "details") btn.textContent = isOpen ? "Daha az" : "Daha fazla";
      if (btn.dataset.toggle === "overview") btn.textContent = isOpen ? "Özeti gizle" : "Özeti göster";
      if (btn.dataset.toggle === "gallery") btn.textContent = isOpen ? "Görselleri gizle" : "Görseller";
      return;
    }
    if (btn.dataset.refreshId) {
      const card = btn.closest(".film-card");
      btn.disabled = true; btn.textContent = "…";
      refreshMovie(btn.dataset.refreshId, card).catch(err => { console.error(err); btn.textContent = "⟳"; })
        .finally(() => { btn.disabled = false; if (btn.textContent === "…") btn.textContent = "⟳"; });
    }
  });
}
async function refreshMovie(movieId, cardEl) {
  const movie = window.__lastMovies?.find(m => String(m.id) === String(movieId));
  if (!movie) return;
  const filters = window.__lastFilters || {};
  const data = await runResearch([movie], filters, { refresh: true });
  const updated = data[0];
  if (!updated || !cardEl) return;
  const wrapper = document.createElement("div");
  wrapper.innerHTML = renderFilmCard(updated, filters);
  cardEl.replaceWith(wrapper.firstElementChild);
}

const MS_STATE = new WeakMap();
function msInit(root) {
  if (MS_STATE.get(root)) return;
  const state = { selected: new Map(), freeText: [] };
  MS_STATE.set(root, state);
  const box = root.querySelector(".ms-box");
  const chips = root.querySelector(".ms-chips");
  const input = root.querySelector(".ms-input");
  const arrow = root.querySelector(".ms-arrow");
  const panel = root.querySelector(".ms-panel");
  const optionsEl = root.querySelector(".ms-options");
  const selectAllBtn = root.querySelector(".ms-select-all");

  const name = root.dataset.name;
  let options = STATIC_OPTIONS[name] || [];
  if (!options.length) {
    try { options = JSON.parse(root.dataset.options || "[]"); } catch { options = []; }
  }

  const renderOptions = () => {
    const q = norm(input.value);
    const filtered = q ? options.filter(o => norm(o.label).includes(q)) : options;
    optionsEl.innerHTML = filtered.map(o => {
      const st = state.selected.get(String(o.id)) || "";
      return `<div class="ms-option" data-id="${esc(o.id)}">
        <span>${esc(o.label)}</span>
        <button type="button" class="ms-check" data-id="${esc(o.id)}" data-state="${st}">${st === "include" ? "✓" : st === "exclude" ? "×" : ""}</button>
      </div>`;
    }).join("");
    if (!filtered.length) {
      optionsEl.innerHTML = `<div class="ms-empty" style="padding:8px 10px;font-size:0.8rem;color:var(--text-muted);">Eşleşen seçenek yok. Yazdığınız değer serbest değer olarak eklenecek.</div>`;
    }
  };
  const renderChips = () => {
    const items = [];
    for (const [id, st] of state.selected) {
      const opt = options.find(o => String(o.id) === String(id));
      if (opt) items.push({ label: opt.label, id, st, free: false });
    }
    for (const t of state.freeText) items.push({ label: t, st: "include", free: true });
    chips.innerHTML = items.map(it =>
      `<span class="ms-chip" data-state="${it.st}" ${it.free ? 'data-free="1"' : `data-id="${esc(it.id)}"`}>
         ${esc(it.label)}<button type="button" data-remove ${it.free ? 'data-free="1"' : `data-id="${esc(it.id)}"`}>✕</button>
       </span>`
    ).join("");
  };
  const cycle = c => c === "" ? "include" : c === "include" ? "exclude" : "";

  optionsEl.addEventListener("click", (e) => {
    const btn = e.target.closest(".ms-check");
    if (!btn) return;
    e.stopPropagation();
    const id = String(btn.dataset.id);
    const next = cycle(state.selected.get(id) || "");
    if (next) state.selected.set(id, next); else state.selected.delete(id);
    input.value = "";
    renderOptions(); renderChips();
  });
  chips.addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-remove]");
    if (!btn) return;
    if (btn.dataset.free) {
      const label = btn.closest(".ms-chip").childNodes[0].textContent.trim();
      state.freeText = state.freeText.filter(t => t !== label);
    } else state.selected.delete(String(btn.dataset.id));
    renderOptions(); renderChips();
  });
  selectAllBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    const cur = selectAllBtn.dataset.state || "";
    const next = cycle(cur);
    selectAllBtn.dataset.state = next;
    selectAllBtn.textContent = next === "include" ? "Tümünü seç ✓" : next === "exclude" ? "Tümünü seç ×" : "Tümünü seç";
    if (!next) state.selected.clear();
    else for (const o of options) state.selected.set(String(o.id), next);
    input.value = "";
    renderOptions(); renderChips();
  });
  arrow.addEventListener("click", (e) => {
    e.stopPropagation();
    panel.classList.toggle("open");
    box.classList.toggle("open", panel.classList.contains("open"));
    arrow.classList.toggle("open", panel.classList.contains("open"));
  });
  box.addEventListener("click", (e) => {
    if (e.target.closest(".ms-arrow")) return;
    if (e.target === input || !e.target.closest(".ms-chip")) {
      panel.classList.add("open");
      box.classList.add("open");
      arrow.classList.add("open");
    }
    input.focus();
  });
  document.addEventListener("click", (e) => {
    if (!root.contains(e.target)) {
      panel.classList.remove("open");
      box.classList.remove("open");
      arrow.classList.remove("open");
    }
  });

  input.addEventListener("input", renderOptions);
  input.addEventListener("keydown", (e) => {
    if (e.key !== "Enter" && e.key !== ",") return;
    e.preventDefault();
    const raw = input.value.trim();
    if (!raw) return;
    const parts = raw.split(";");
    const inc = (parts[0] || "").split(",").map(t => t.trim()).filter(Boolean);
    const exc = (parts[1] || "").split(",").map(t => t.trim()).filter(Boolean);
    for (const tok of inc) {
      const opt = options.find(o => norm(o.label) === norm(tok));
      if (opt) state.selected.set(String(opt.id), "include");
      else if (!state.freeText.includes(tok)) state.freeText.push(tok);
    }
    for (const tok of exc) {
      const opt = options.find(o => norm(o.label) === norm(tok));
      if (opt) state.selected.set(String(opt.id), "exclude");
      else if (!state.freeText.includes("!" + tok)) state.freeText.push("!" + tok);
    }
    input.value = "";
    renderOptions(); renderChips();
  });

  renderOptions(); renderChips();
}
function msGetValues(root) {
  const st = MS_STATE.get(root);
  if (!st) return { include: [], exclude: [] };
  const name = root.dataset.name;
  let options = STATIC_OPTIONS[name] || [];
  if (!options.length) { try { options = JSON.parse(root.dataset.options || "[]"); } catch { options = []; } }
  const include = [], exclude = [];
  for (const [id, s] of st.selected) {
    const opt = options.find(o => String(o.id) === id);
    const label = opt ? opt.label : id;
    if (s === "include") include.push({ id, label });
    else if (s === "exclude") exclude.push({ id, label });
  }
  for (const t of st.freeText) {
    if (t.startsWith("!")) exclude.push({ id: null, label: t.slice(1) });
    else include.push({ id: null, label: t });
  }
  return { include, exclude };
}

function syncRatioLabels() {
  const pairs = [
    ["nightRatio", "gece", "gündüz"],
    ["indoorRatio", "iç mekân", "dış mekân"],
    ["locationCount", "tek mekân", "çoklu mekân"],
    ["dialogueDensity", "sessizlik", "yoğun konuşma"],
    ["colorRatio", "siyah beyaz", "renkli"]
  ];
  for (const [id, leftLabel, rightLabel] of pairs) {
    const el = document.getElementById(id);
    if (!el) continue;
    const v = Number(el.value);
    const val = document.getElementById("val-" + id);
    const l = document.getElementById("lbl-" + id + "-left");
    const r = document.getElementById("lbl-" + id + "-right");
    if (val) val.textContent = `%${v}`;
    if (l) l.textContent = `${leftLabel} %${100 - v}`;
    if (r) r.textContent = `${rightLabel} %${v}`;
  }
}
function bindRatioToggles() {
  const map = {
    enableLight: "nightRatio",
    enablePlace: "indoorRatio",
    enablePlaceCount: "locationCount",
    enableDialogue: "dialogueDensity",
    enableColor: "colorRatio"
  };
  for (const [enId, sliderId] of Object.entries(map)) {
    const en = document.getElementById(enId);
    const sl = document.getElementById(sliderId);
    if (!en || !sl) continue;
    en.addEventListener("change", () => { sl.disabled = !en.checked; });
    sl.addEventListener("input", syncRatioLabels);
    sl.disabled = !en.checked;
  }
  syncRatioLabels();
}

const searchState = {
  query: "",
  page: 1,
  filters: null,
  lastMovies: [],
  exhausted: false
};

async function fetchMoviesPage({ query, filters, page }) {
  if (query) {
    const params = new URLSearchParams();
    params.set("query", query);
    params.set("language", "tr-TR");
    params.set("page", String(page));
    const res = await fetch(`${API_BASE}/tmdb/search/movie?${params.toString()}`);
    if (!res.ok) throw new Error(`TMDB arama hatası: ${res.status}`);
    const data = await res.json();
    console.warn("search page", page, "results", (data.results || []).length, "totalPages", data.total_pages);
    return { results: data.results || [], totalPages: data.total_pages || 1 };
  } else {
    const params = buildDiscoverParams(filters, page);
    const res = await fetch(`${API_BASE}/tmdb/discover/movie?${params.toString()}`);
    if (!res.ok) throw new Error(`TMDB discover hatası: ${res.status}`);
    const data = await res.json();
    console.warn("discover page", page, "results", (data.results || []).length, "totalPages", data.total_pages);
    return { results: data.results || [], totalPages: data.total_pages || 1 };
  }
}

async function performSearch() {
  const container = document.getElementById("results");
  const query = document.getElementById("searchQuery")?.value.trim() || "";
  if (!container) return;

  const filters = collectFilters();
  const hasQuery = query.length > 0;
  const hasFilters = Object.keys(filters).some(k => {
    const v = filters[k];
    if (v == null) return false;
    if (typeof v === "object") return true;
    if (typeof v === "number") return v > 0 && v !== 10;
    return false;
  });
  if (!hasQuery && !hasFilters) { container.innerHTML = `<p class="error">Film adı veya en az bir filtre girin.</p>`; return; }

  searchState.query = query;
  searchState.page = 1;
  searchState.filters = filters;
  searchState.lastMovies = [];
  searchState.exhausted = false;

  container.innerHTML = `
    <div class="progress" id="progressBox">
      <div class="progress-bar"><div class="progress-fill" id="progressFill" style="width:0%"></div></div>
      <div class="progress-text" id="progressText">Hazırlanıyor...</div>
    </div>
    <div id="resultsList"></div>
    <div id="moreWrap" style="text-align:center;margin-top:12px;"></div>`;

  await loadNextPage();
}

async function loadNextPage() {
  const listEl = document.getElementById("resultsList");
  const moreWrap = document.getElementById("moreWrap");
  if (!listEl) return;

  try {
    let collected = [];
    let totalPages = 1;

    while (collected.length < TARGET_COUNT && searchState.page <= totalPages) {
      const pageData = await fetchMoviesPage({
        query: searchState.query,
        filters: searchState.filters,
        page: searchState.page
      });
      totalPages = pageData.totalPages || 1;
      const results = pageData.results || [];
      if (!results.length) break;

      const fresh = results.filter(m => !searchState.lastMovies.some(x => String(x.id) === String(m.id)));
      const visible = filterWatchedLocally(fresh);
      collected = collected.concat(visible);

      if (collected.length < TARGET_COUNT) searchState.page += 1;
      else break;
    }

    if (!collected.length) {
      if (searchState.page === 1 || searchState.lastMovies.length === 0) {
        listEl.innerHTML = `<p class="empty">Sonuç bulunamadı.</p>`;
      }
      if (moreWrap) moreWrap.innerHTML = "";
      document.getElementById("progressBox")?.remove();
      return;
    }

    const toResearch = collected.slice(0, TARGET_COUNT);
    window.__searchMovies = toResearch;

    const researched = await runResearch(toResearch, searchState.filters, {
      refresh: false,
      onProgress: ({ percent, text }) => {
        const fill = document.getElementById("progressFill");
        const txt = document.getElementById("progressText");
        if (fill) fill.style.width = `${percent}%`;
        if (txt) txt.textContent = `%${percent} — ${text}`;
      }
    });

    const passing = researched.filter(m => m.filter_match !== false);

    searchState.lastMovies = [...searchState.lastMovies, ...passing];
    window.__lastMovies = searchState.lastMovies;
    window.__lastFilters = searchState.filters;

    document.getElementById("progressBox")?.remove();
    if (searchState.lastMovies.length) {
      renderFilmList(searchState.lastMovies, listEl, searchState.filters);
    } else {
      listEl.innerHTML = `<p class="empty">Filtrelere uyan sonuç bulunamadı.</p>`;
    }

    // Eğer hedefe ulaşamadıysak ve daha sayfa varsa otomatik devam
    if (passing.length < TARGET_COUNT && searchState.page < totalPages) {
      searchState.page += 1;
      return loadNextPage();
    }

    if (searchState.page >= totalPages) {
      if (moreWrap) moreWrap.innerHTML = `<p class="empty">Başka sonuç yok.</p>`;
      searchState.exhausted = true;
    } else {
      if (moreWrap) moreWrap.innerHTML = `<button type="button" id="moreBtn" style="padding:10px 16px;border:1px solid var(--card-border);background:transparent;color:var(--text-main);border-radius:8px;cursor:pointer;font-size:0.85rem;">Aramayı sürdür</button>`;
      document.getElementById("moreBtn")?.addEventListener("click", async () => {
        searchState.page += 1;
        const btn = document.getElementById("moreBtn");
        if (btn) { btn.disabled = true; btn.textContent = "Yükleniyor..."; }
        await loadNextPage();
      });
    }
  } catch (e) {
    console.error(e);
    document.getElementById("progressBox")?.remove();
    if (listEl) listEl.insertAdjacentHTML("beforeend", `<p class="error">${esc(e.message)}</p>`);
  }
}

function clearAllFilters() {
  document.querySelectorAll("[data-ms]").forEach(root => {
    const st = MS_STATE.get(root);
    if (st) { st.selected.clear(); st.freeText = []; }
    const chips = root.querySelector(".ms-chips");
    if (chips) chips.innerHTML = "";
    const opts = root.querySelector(".ms-options");
    if (opts) opts.querySelectorAll(".ms-check").forEach(b => { b.dataset.state = ""; b.textContent = ""; });
    const sel = root.querySelector(".ms-select-all");
    if (sel) { sel.dataset.state = ""; sel.textContent = "Tümünü seç"; }
    const conf = root.querySelector(".ms-conflict");
    if (conf) conf.checked = false;
    const panel = root.querySelector(".ms-panel");
    if (panel) panel.classList.remove("open");
    const box = root.querySelector(".ms-box");
    if (box) box.classList.remove("open");
    const arrow = root.querySelector(".ms-arrow");
    if (arrow) arrow.classList.remove("open");
    const inp = root.querySelector(".ms-input");
    if (inp) inp.value = "";
  });
  for (const id of ["imdbMin","tmdbMin","imdbVotesMin","tmdbVotesMin"]) { const el = document.getElementById(id); if (el) el.value = "0"; }
  for (const id of ["imdbMax","tmdbMax"]) { const el = document.getElementById(id); if (el) el.value = "10"; }
  for (const id of ["yearMin","yearMax","runtimeMin","runtimeMax","charMainMin","charMainMax","charSuppMin","charSuppMax","charExtraMin","charExtraMax"]) { const el = document.getElementById(id); if (el) el.value = ""; }
  for (const id of ["nightRatio","indoorRatio","locationCount","dialogueDensity","colorRatio"]) {
    const el = document.getElementById(id); if (el) { el.value = "50"; el.disabled = true; }
  }
  for (const id of ["enableLight","enablePlace","enablePlaceCount","enableDialogue","enableColor"]) { const el = document.getElementById(id); if (el) el.checked = false; }
  document.querySelectorAll("[data-family-key]").forEach(el => {
    el.querySelectorAll('input[type="radio"]').forEach(r => { r.checked = false; r.dataset.wasChecked = ""; });
    const inv = el.querySelector(".family-invisible-check"); if (inv) inv.checked = false;
  });
  syncSexDetails();
  syncRatioLabels();
  const q = document.getElementById("searchQuery"); if (q) q.value = "";
  const r = document.getElementById("results"); if (r) r.innerHTML = "";
  searchState.lastMovies = [];
  searchState.page = 1;
  searchState.exhausted = false;
}

document.addEventListener("DOMContentLoaded", async () => {
  renderFamilyGuide();

  const fillOptions = async (name, endpoint, mapper) => {
    const root = document.querySelector(`[data-ms][data-name="${name}"]`);
    if (!root) return;
    try {
      const res = await fetch(`${API_BASE}${endpoint}`);
      if (!res.ok) return;
      const data = await res.json();
      STATIC_OPTIONS[name] = mapper(data);
    } catch (e) { console.warn(`${name} listesi:`, e.message); }
  };
  await Promise.all([
    fillOptions("genres", "/tmdb/genre/movie/list?language=tr-TR", d => (d.genres || []).map(g => ({ id: g.id, label: g.name }))),
    fillOptions("original_language", "/tmdb/configuration/languages", d => (d || []).map(l => ({ id: l.iso_639_1, label: l.turkish_name || l.english_name || l.name }))),
    fillOptions("production_countries", "/tmdb/configuration/countries?language=tr-TR", d => (d || []).map(c => ({ id: c.iso_3166_1, label: c.native_name || c.english_name || c.iso_3166_1 })))
  ]);

  if (STATIC_OPTIONS.production_countries) {
    const regions = STATIC_OPTIONS.production_countries.map(c => ({ id: c.id, label: c.label }));
    regions.push({ id: "__space__", label: "Dünya dışı" });
    STATIC_OPTIONS.story_locations = regions;
    STATIC_OPTIONS.filming_locations = regions;
  }

  document.querySelectorAll("[data-ms]").forEach(msInit);
  bindRatioToggles();
  document.getElementById("useWebResearch")?.addEventListener("change", updateModeHint);
  document.getElementById("useAI")?.addEventListener("change", updateModeHint);
  updateModeHint();

  const csvInput = document.getElementById("csvWatched");
  const csvClear = document.getElementById("csvClear");
  const csvStatus = document.getElementById("csvStatus");
  if (csvInput) {
    csvInput.addEventListener("change", (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        try {
          watchedList = parseWatchedCSV(String(reader.result || ""));
          csvStatus.textContent = `${watchedList.length} izlenen film yüklendi.`;
          if (csvClear) csvClear.style.display = "inline-block";
        } catch (err) {
          csvStatus.textContent = `CSV hatası: ${err.message}`;
          if (csvClear) csvClear.style.display = "none";
        }
      };
      reader.onerror = () => { csvStatus.textContent = "CSV okunamadı."; };
      reader.readAsText(file, "UTF-8");
    });
  }
  if (csvClear) {
    csvClear.addEventListener("click", () => {
      watchedList = [];
      if (csvInput) csvInput.value = "";
      csvStatus.textContent = "CSV yüklenmedi.";
      csvClear.style.display = "none";
    });
  }

  const resultsContainer = document.getElementById("results");
  if (resultsContainer) bindFilmCardEvents(resultsContainer);
  document.getElementById("searchBtn")?.addEventListener("click", performSearch);
  document.getElementById("searchQuery")?.addEventListener("keydown", e => { if (e.key === "Enter") performSearch(); });
  document.getElementById("clearAllBtn")?.addEventListener("click", clearAllFilters);
});
