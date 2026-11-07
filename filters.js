// filters.js — passesLocalFilters artık unknown durumunda da eler.
import { SEMANTIC_FIELDS, FIELD_DEFS } from "./fields.config.js";
import { norm, yearOf, safeJSON } from "./db.js";

const DEFAULT_MIN_IMDB_VOTES = 100;
const INTENSITY_TR = { none: "hiç yok", few: "bir veya birkaç sahnede var", side: "yan konu (yoğun)", main: "ana konu (çok yoğun)" };
const APPROACH_TR = { bad: "kötü gösteriyor", neutral: "tarafsız kalıyor", legit: "meşrulaştırıyor" };
const TRAIT_TR = {
  tobacco: "tütün ve nikotin ürünleri kullanımı", alcohol: "alkol kullanımı", drugs: "uyuşturucu ve yasadışı madde kullanımı",
  sex_nudity: "cinsellik, çıplaklık ve cinsel sahneler",
  violence: "şiddet, kan, dövüş, yaralanma, işkence ve ölüm sahneleri",
  crimes_against_humanity: "insanlığa karşı suçlar, soykırım ve toplu katliam",
  terror: "terör, terörizm ve terör örgütleri",
  illegal: "yasadışı eylemler, suç, kaçakçılık ve kanun dışı faaliyetler",
  lgbt: "LGBT+ içeriği, eşcinsel ilişki ve cinsiyet kimliği",
  pedophilia: "pedofili, çocuk istismarı, ensest, reşit olmayanlarla cinsellik ve diğer cinsel sapkınlıklar",
  unmarried: "nikahsız ilişkiler, evlilik dışı birliktelik",
  profanity: "argo, küfür, hakaret ve kaba dil",
  disturbing: "ürkütücü, rahatsız edici, mide bulandırıcı veya travmatik sahneler",
  racism: "ırkçılık, ayrımcılık, dini değerlere hakaret, nefret söylemi ve nefret suçu"
};
const DEFAULT_FILTER_INFO = {
  "filter_info.season": "[YZ bağlamı]\n- winter: Hikâye kışın geçiyor.\n- summer: Hikâye yazın geçiyor.\n- spring: Hikâye ilkbaharda geçiyor.\n- autumn: Hikâye sonbaharda geçiyor.",
  "filter_info.reality": "[YZ bağlamı]\n- true: Gerçek olaylara birebir sadık.\n- mostly_true: Gerçek olaylara dayalı, sanatsal özgürlük var.\n- inspired: Gerçek olaylardan esinlenmiş.\n- realistic: Kurgusal ama gerçekçi.\n- fictional: Tamamen kurgusal.\n- utopic: Ütopik/distopik gelecek.",
  "filter_info.production_process": "[YZ bağlamı]\n- amateur: Çok düşük bütçe.\n- indie: Stüdyo dışı bağımsız.\n- art: Deneysel anlatım.\n- big: 100M$+ bütçe.\n- bmovie: Düşük bütçeli tür sineması.\n- avant: Avangart.\n- studio: Klasik Hollywood.\n- no_music: Müzik yok.\n- rare_music: Az müzik.\n- handheld: El kamerası.\n- propaganda: İdeolojik mesaj.\n- dogme: Dogme 95.",
  "filter_info.narrative_style": "[YZ bağlamı]\n- multi: Bağımsız hikâyeler.\n- reverse: Sondan başa.\n- linear: Düz.\n- flashback: Geri dönüşlü.\n- end_first: Sonu önce.\n- mid_first: Orta önce.\n- fast: Hızlı tempolu.\n- slow: Durgun.\n- no_end: Açık uçlu.\n- alt_end: Alternatif son.\n- alt_narr: Alternatif anlatım.",
  "filter_info.sound": "[YZ bağlamı]\n- ambient: Doğal ortam sesi.\n- music: Yoğun müzik.\n- effects: Yoğun efekt.\n- voiceover_ext: Dış ses.\n- voiceover_int: İç ses.\n- silent: Sessiz film.\n- dubbed: Dublaj.",
  "filter_info.story_geography": "[YZ bağlamı]\n- city: Şehir.\n- town: Kasaba.\n- village: Köy.\n- mountain: Dağlık.\n- desert: Çöl.\n- steppe: Bozkır.\n- forest: Orman.\n- seaside: Deniz kenarı.\n- riverside: Nehir kenarı.\n- opensea: Açık deniz.\n- air: Havada.",
  "filter_info.character_traits": "[YZ bağlamı]\nKarakter ana/yan/figüran + cinsiyet/yaş/engel kombinasyonu.",
  "filter_info.story_dimensions": "[YZ bağlamı]\n- has_sequel: Devam filmi var.\n- is_sequel: Devam filmi.\n- series_sequel: Bir dizideki hikayenin devamı.\n- series_prequel: Bir dizideki hikayenin öncesi.\n- series_spinoff: Bir dizideki karakterlerin farklı bir hikayesi.\n- concept: Konsept filmi.\n- similar_script_version: Aynı hikayeyi benzer bir senaryoyla anlatan başka bir film var.\n- same_plot_diff_script: Aynı hikayeyi farklı bir senaryoyla anlatan başka bir film var.\n- same_plot_diff_angle: Aynı hikayenin farklı bir yönünü anlatan başka bir film var.",
  "filter_info.story_period": "[YZ bağlamı]\nHikâyenin geçtiği tarihsel dönem. Kodlar: bc = milattan önce; c1..c19 = 1.-19. yüzyıl; d1900 = 1900'ler; d1910 = 1910'lar; d1920 = 1920'ler; d1930 = 1930'lar; d1940 = 1940'lar; d1950 = 1950'ler; d1960 = 1960'lar; d1970 = 1970'ler; d1980 = 1980'lar; d1990 = 1990'lar; d2000 = 2000'ler; d2010 = 2010'lar; d2020 = 2020'ler; future = gelecek.",
  "filter_info.story_locations": "[YZ bağlamı]\n- city: Şehir.\n- town: Kasaba.\n- village: Köy.\n- mountain: Dağlık.\n- desert: Çöl.\n- steppe: Bozkır.\n- forest: Orman.\n- seaside: Deniz kenarı.\n- riverside: Nehir kenarı.\n- opensea: Açık deniz.\n- air: Havada.",
  "filter_info.family_content": "[YZ bağlamı]\nintensity: none=hiç yok, few=birkaç sahne, side=yan konu, main=ana konu. approach: bad=kötü, neutral=tarafsız, legit=meşrulaştırıyor.",
  "filter_info.color": "[YZ bağlamı]\n- black_white: Tamamen siyah beyaz.\n- color: Tamamen renkli.\n- mostly_color: Çoğunlukla renkli.\n- mostly_bw: Çoğunlukla siyah beyaz.\n- blue_filter: Baskın mavi tonlu.\n- yellow_filter: Baskın sarı tonlu.\n- selective_color: Seçici renk.\n- colorized: Sonradan renklendirilmiş.\n- limited_palette: Sınırlı renk paleti.\n- sepia: Sepya tonu.\n- mono_tint: Tek renk monokrom.\n- bw_red_accent: Siyah beyaz + kırmızı vurgu.\n- mixed_bw_color: Renkli ve siyah beyaz karışık.",
  "filter_info.dialogue_density_subtitle": "Diyalog yoğunluğu altyazı metninden hesaplanır: karakter sayısı / süre_dk / 10 = yüzde."
};

export function buildFilterSentence(filters) {
  const f = filters || {};
  const parts = [];
  if (f.genres?.include?.length) { const n = f.genres.include.map(x => x.label || x).filter(Boolean); if (n.length) parts.push(`türü ${n.join(" veya ")} olan`); }
  if (f.genres?.exclude?.length) { const n = f.genres.exclude.map(x => x.label || x).filter(Boolean); if (n.length) parts.push(`${n.join(", ")} türünde olmamalı`); }
  const setInclude = (field, prefix) => { const v = f[field]; if (!v?.include?.length) return; const n = v.include.map(x => x.label || x).filter(Boolean); if (n.length) parts.push(`${prefix}: ${n.join(" veya ")}`); };
  const setExclude = (field, suffix) => { const v = f[field]; if (!v?.exclude?.length) return; const n = v.exclude.map(x => x.label || x).filter(Boolean); if (n.length) parts.push(`${suffix} ${n.join(", ")} olmamalı`); };
  setInclude("season", "hikâyesi şu mevsimde geçen"); setExclude("season", "hikâyesi şu mevsimlerde geçmemeli:");
  setInclude("reality", "gerçeklik"); setExclude("reality", "gerçeklik açısından:");
  setInclude("production_process", "yapım süreci"); setExclude("production_process", "yapım süreci şunlardan olmamalı:");
  setInclude("narrative_style", "anlatım tarzı"); setExclude("narrative_style", "anlatım tarzı şunlardan olmamalı:");
  setInclude("sound", "ses özelliği"); setExclude("sound", "ses özelliği şunlardan olmamalı:");
  setInclude("story_geography", "coğrafya"); setExclude("story_geography", "coğrafya şunlardan olmamalı:");
  setInclude("story_period", "dönem"); setExclude("story_period", "dönem şunlardan olmamalı:");
  setInclude("character_traits", "karakter özellikleri"); setExclude("character_traits", "karakter özellikleri şunlardan olmamalı:");
  setInclude("story_dimensions", "hikâye boyutları"); setExclude("story_dimensions", "hikâye boyutları şunlardan olmamalı:");
  setInclude("aspect_ratio", "en-boy oranı"); setExclude("aspect_ratio", "en-boy oranı şunlardan olmamalı:");
  setInclude("color", "görsel renk stili"); setExclude("color", "görsel renk stili şunlardan olmamalı:");
  if (f.family_content) for (const [key, val] of Object.entries(f.family_content)) {
    if (!val) continue;
    const label = TRAIT_TR[key] || key;
    const intensity = INTENSITY_TR[val.intensity];
    if (intensity) parts.push(`${label} içeriği ${intensity}`);
    if (val.approach && APPROACH_TR[val.approach]) parts.push(`${label} yaklaşımı ${APPROACH_TR[val.approach]}`);
  }
  if (f.characterDensity) {
    const c = f.characterDensity; const clauses = [];
    if (c.mainMin != null || c.mainMax != null) clauses.push(`ana karakter sayısı ${c.mainMin ?? "?"}-${c.mainMax ?? "?"}`);
    if (c.supportMin != null || c.supportMax != null) clauses.push(`yan karakter sayısı ${c.supportMin ?? "?"}-${c.supportMax ?? "?"}`);
    if (c.extraMin != null || c.extraMax != null) clauses.push(`figüran sayısı ${c.extraMin ?? "?"}-${c.extraMax ?? "?"}`);
    if (clauses.length) parts.push(clauses.join(", "));
  }
  if (f.locationMin != null || f.locationMax != null) parts.push(`mekân sayısı ${f.locationMin ?? "?"}-${f.locationMax ?? "?"}`);
  return parts.length ? parts.join(". ") + "." : "";
}
export function buildFilterContext(filters, configAll) {
  const f = filters || {};
  const lines = [];
  const activeFields = new Set();
  for (const field of SEMANTIC_FIELDS) if (f[field] && (f[field].include?.length || f[field].exclude?.length)) activeFields.add(field);
  if (f.family_content && Object.keys(f.family_content).length) activeFields.add("family_content");
  if (f.characterDensity) activeFields.add("characterDensity");
  for (const field of activeFields) {
    const info = configAll[`filter_info.${field}`]; if (!info) continue;
    const usedSlugs = new Set();
    if (f[field]?.include) for (const x of f[field].include) if (x.id) usedSlugs.add(x.id);
    if (f[field]?.exclude) for (const x of f[field].exclude) if (x.id) usedSlugs.add(x.id);
    const yzIdx = info.indexOf("[YZ bağlamı]");
    let contextPart = yzIdx >= 0 ? info.slice(yzIdx + "[YZ bağlamı]".length).trim() : "";
    if (!contextPart) continue;
    if (usedSlugs.size > 0) contextPart = contextPart.split("\n").filter(l => { const m = l.trim().match(/^[-•]\s*([a-z_0-9]+):/i); return !m || usedSlugs.has(m[1].toLowerCase()); }).join("\n").trim();
    if (contextPart) lines.push(`${field}:\n${contextPart}`);
  }
  return lines.join("\n\n");
}
export function semanticSignature(filters) {
  const f = filters || {};
  const active = {};
  for (const field of SEMANTIC_FIELDS) if (f[field] && (f[field].include?.length || f[field].exclude?.length)) active[field] = f[field];
  if (f.family_content && Object.keys(f.family_content).length) active.family_content = f.family_content;
  if (f.characterDensity) active.characterDensity = f.characterDensity;
  const sorted = Object.keys(active).sort().reduce((o, k) => { o[k] = active[k]; return o; }, {});
  return JSON.stringify(sorted);
}
export function hasSemanticFilters(filters) { return semanticSignature(filters) !== "{}"; }
export function ratioFieldsNeeded(filters) {
  const f = filters || {};
  const fields = [];
  if (f.dayRatioMin != null) fields.push("day_ratio");
  if (f.outdoorRatioMin != null) fields.push("indoor_ratio");
  if (f.dialogueDensityMin != null) fields.push("dialogue_density");
  return fields;
}
export function locationFieldsNeeded(filters) { const f = filters || {}; return (f.locationMin != null || f.locationMax != null) ? ["location_count"] : []; }

function toNum(v) {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "string" && /^n\/?a$/i.test(v.trim())) return null;
  const n = Number(String(v).replace(/[^\d.-]/g, ""));
  return Number.isFinite(n) ? n : null;
}
function matchSet(profileField, filterObj, altProfileField) {
  if (!filterObj) return { match: true, unknown: false, conflict: false, reasons: [] };
  const raw = Array.isArray(profileField) ? profileField.map(norm) : (profileField ? [norm(profileField)] : []);
  const altRaw = Array.isArray(altProfileField) ? altProfileField.map(norm) : (altProfileField ? [norm(altProfileField)] : []);
  const allRaw = [...raw, ...altRaw];
  const empty = allRaw.length === 0;
  const reasons = [];
  let match = true, unknown = false, conflict = false;
  const matches = (x) => {
    const v = norm(x.label || x);
    if (allRaw.includes(v)) return true;
    if (x.id != null && x.id !== "" && allRaw.includes(norm(x.id))) return true;
    return allRaw.some(h => h.includes(v) || v.includes(h));
  };
  if (filterObj.include?.length) {
    const matched = filterObj.include.filter(x => matches(x));
    if (matched.length === 0) {
      if (empty) { unknown = true; reasons.push(`bilinmiyor: ${filterObj.include.map(x => x.label || x).join(", ")}`); }
      else { match = false; reasons.push(`eksik: ${filterObj.include.map(x => x.label || x).join(", ")}`); }
    }
  }
  if (filterObj.exclude?.length) {
    const hit = filterObj.exclude.filter(x => matches(x));
    if (hit.length) { match = false; conflict = true; reasons.push(`hariç: ${hit.map(x => x.label || x).join(", ")}`); }
  }
  return { match, unknown, conflict, reasons };
}
function matchIdSet(profileIds, filterObj) {
  if (!filterObj) return { match: true, unknown: false, reasons: [] };
  const have = (profileIds || []).map(x => String(x).trim()).filter(Boolean);
  if (filterObj.include?.length) {
    const matched = filterObj.include.filter(x => x.id != null && have.includes(String(x.id).trim()));
    if (matched.length === 0) {
      if (have.length === 0) return { match: true, unknown: true, reasons: ["bilinmiyor"] };
      return { match: false, unknown: false, reasons: [`eksik: ${filterObj.include.map(x => x.label || x.id).join(", ")}`] };
    }
  }
  if (filterObj.exclude?.length) {
    const hit = filterObj.exclude.filter(x => x.id != null && have.includes(String(x.id).trim()));
    if (hit.length) return { match: false, unknown: false, reasons: [`hariç: ${hit.map(x => x.label || x).join(", ")}`] };
  }
  return { match: true, unknown: false, reasons: [] };
}
function matchRated(profileRated, filterObj) {
  if (!filterObj) return { match: true, unknown: false, reasons: [] };
  const have = profileRated ? norm(profileRated) : "";
  if (!have) return { match: true, unknown: true, reasons: ["Yaş sınırı bilinmiyor"] };
  if (filterObj.include?.length) {
    const labels = filterObj.include.map(x => norm(x.label || x));
    if (!labels.includes(have)) return { match: false, unknown: false, reasons: [`Yaş sınırı ${profileRated} uygun değil`] };
  }
  if (filterObj.exclude?.length) {
    const labels = filterObj.exclude.map(x => norm(x.label || x));
    if (labels.includes(have)) return { match: false, unknown: false, reasons: [`Yaş sınırı ${profileRated} hariç tutuldu`] };
  }
  return { match: true, unknown: false, reasons: [] };
}
function matchAwards(profileAwards, profileNominations, filterObj) {
  if (!filterObj) return { match: true, unknown: false, reasons: [] };
  const awards = (profileAwards || []).map(x => String(x).trim());
  const noms = (profileNominations || []).map(x => String(x).trim());
  const all = new Set([...awards, ...noms]);
  if (!all.size) return { match: true, unknown: true, reasons: ["Ödül bilgisi bilinmiyor"] };
  if (filterObj.include?.length) {
    const matched = filterObj.include.filter(x => x.id != null && all.has(String(x.id)));
    if (matched.length === 0) return { match: false, unknown: false, reasons: [`Ödül eksik: ${filterObj.include.map(x => x.label || x.id).join(", ")}`] };
  }
  return { match: true, unknown: false, reasons: [] };
}

// === YENİ: director/writers/cast için unknown durumunda da ele ===
function passesLocalFilters(profile, filters) {
  const imdb = Number(String(profile.imdbRating || "").replace(/[^\d.]/g, "")) || null;
  if (filters.imdbMin > 0 && imdb != null && imdb < filters.imdbMin) return false;
  if (filters.imdbMax < 10 && imdb != null && imdb > filters.imdbMax) return false;
  const minVotes = filters.imdbVotesMin == null ? DEFAULT_MIN_IMDB_VOTES : Number(filters.imdbVotesMin);
  if (minVotes > 0 && imdb != null) {
    const ivRaw = String(profile.imdbVotes || "").replace(/[^\d]/g, "");
    if (ivRaw && Number(ivRaw) < minVotes) return false;
  }
  const year = yearOf(profile) || null;
  if (filters.yearMin != null && year != null && year < filters.yearMin) return false;
  if (filters.yearMax != null && year != null && year > filters.yearMax) return false;
  const runtime = toNum(profile.runtime);
  if (filters.runtimeMin != null && runtime != null && runtime < filters.runtimeMin) return false;
  if (filters.runtimeMax != null && runtime != null && runtime > filters.runtimeMax) return false;
  if (filters.rated && !matchRated(profile.rated, filters.rated).match) return false;
  if (filters.director) { const r = matchIdSet(profile.director_ids, filters.director); if (!r.match || r.unknown) return false; }
  if (filters.writers) { const r = matchIdSet(profile.writers_ids, filters.writers); if (!r.match || r.unknown) return false; }
  if (filters.cast) { const r = matchIdSet(profile.cast_ids, filters.cast); if (!r.match || r.unknown) return false; }
  return true;
}
function evalFilmingLocations(profile, f, metatakeLocations, filmmapLocations) {
  if (!f) return { match: true, unknown: false, reason: null };
  const wdLocs = (profile.filming_locations || []).map(norm);
  const wdCountries = (profile.filming_countries || []).map(norm);
  const fmLocs = (filmmapLocations || []).map(x => norm(x.name || x.city || ""));
  const fmCountries = (filmmapLocations || []).map(x => norm(x.country || ""));
  const mtLocs = (metatakeLocations || []).map(x => norm(x.name || x.city || ""));
  const mtCountries = (metatakeLocations || []).map(x => norm(x.country || ""));
  const allLocs = [...wdLocs, ...fmLocs, ...mtLocs].filter(Boolean);
  const allCountries = [...wdCountries, ...fmCountries, ...mtCountries].filter(Boolean);
  const empty = allLocs.length === 0 && allCountries.length === 0;
  const hasStudio = allLocs.some(x => /studio|stüdyo/.test(x));
  const matches = (x) => {
    const v = norm(x.label || x);
    if (v === "__studio__" || v === "stüdyo") return hasStudio;
    if (allCountries.includes(v)) return true;
    return allLocs.some(loc => loc.includes(v) || v.includes(loc));
  };
  if (f.include?.length) {
    const matched = f.include.filter(x => matches(x));
    if (matched.length === 0) {
      if (empty) return { match: true, unknown: true, reason: "Çekim yeri: bilinmiyor" };
      return { match: false, unknown: false, reason: `Çekim yeri eksik: ${f.include.map(x => x.label || x).join(", ")}` };
    }
  }
  if (f.exclude?.length) {
    const hit = f.exclude.filter(x => matches(x));
    if (hit.length) return { match: false, unknown: false, reason: `Çekim yeri hariç: ${hit.map(x => x.label || x).join(", ")}` };
  }
  return { match: true, unknown: false, reason: null };
}
function evalRange(profile, field, min, max, label, state, strict) {
  if (min == null && max == null) return;
  const v = toNum(profile[field]);
  if (v === null) {
    if (strict) { state.match = false; state.reasons.push(`${label}: bilinmiyor (elendi)`); }
    else { state.unknown = true; state.reasons.push(`${label}: bilinmiyor`); }
    return;
  }
  if ((min != null && v < min) || (max != null && v > max)) { state.match = false; state.reasons.push(`${label}: ${v} aralık dışı`); }
}
function ratioThreshold(x) {
  if (x === 0) return { min: 0, max: 0 };
  if (x === 100) return { min: 100, max: 100 };
  return { min: Math.max(0, x - 20), max: Math.min(100, x + 20) };
}
function evalRatioFilters(profile, filters, state) {
  if (filters.dayRatioMin != null) {
    const t = ratioThreshold(filters.dayRatioMin); const v = toNum(profile.day_ratio);
    if (v === null) { state.unknown = true; state.reasons.push("Gündüz oranı: bilinmiyor"); }
    else if (v < t.min || v > t.max) { state.match = false; state.reasons.push(`Gündüz %${v} [${t.min}-${t.max}] dışı`); }
  }
  if (filters.outdoorRatioMin != null) {
    const t = ratioThreshold(filters.outdoorRatioMin); const indoor = toNum(profile.indoor_ratio);
    if (indoor === null) { state.unknown = true; state.reasons.push("Dış mekân oranı: bilinmiyor"); }
    else { const outdoor = 100 - indoor; if (outdoor < t.min || outdoor > t.max) { state.match = false; state.reasons.push(`Dış mekân %${outdoor} [${t.min}-${t.max}] dışı`); } }
  }
  if (filters.dialogueDensityMin != null) {
    const t = ratioThreshold(filters.dialogueDensityMin);
    const v = toNum(profile.dialogue_density); const vs = toNum(profile.dialogue_density_subtitle);
    const chosen = (v != null) ? v : vs;
    if (chosen === null) { state.unknown = true; state.reasons.push("Diyalog yoğunluğu: bilinmiyor"); }
    else if (chosen < t.min || chosen > t.max) { state.match = false; state.reasons.push(`Diyalog %${chosen} [${t.min}-${t.max}] dışı`); }
  }
}
export function getLocationCount(profile, metatakeLocations, filmmapLocations) {
  const exact = toNum(profile.location_count);
  if (exact !== null && exact > 0) return { count: exact, estimated: false, source: "ai" };
  if (profile.location_mode) {
    const map = { single: 1, mostly_single: 2, few: 3, many: 6 };
    const mode = String(profile.location_mode).trim().toLowerCase();
    if (map[mode] !== undefined) return { count: map[mode], estimated: true, source: "ai-mode" };
  }
  const wdCount = (profile.filming_locations || []).length;
  const fmCount = (filmmapLocations || []).length;
  const best = Math.max(wdCount, fmCount);
  if (best > 0) return { count: best, estimated: true, source: "filming" };
  return { count: null, estimated: true, source: null };
}
function evalLocationCount(profile, filters, state, metatakeLocations, filmmapLocations) {
  if (filters.locationMin == null && filters.locationMax == null) return;
  const info = getLocationCount(profile, metatakeLocations, filmmapLocations);
  if (info.count === null) { state.unknown = true; state.reasons.push("Mekân sayısı: bilinmiyor"); return; }
  if (filters.locationMin != null && info.count < filters.locationMin) { state.match = false; state.reasons.push(`Mekân sayısı ${info.count} < ${filters.locationMin}`); }
  if (filters.locationMax != null && info.count > filters.locationMax) { state.match = false; state.reasons.push(`Mekân sayısı ${info.count} > ${filters.locationMax}`); }
}
export function evaluateFilters(profile, filters, semanticVerdict, metatakeLocations, filmmapLocations) {
  const state = { match: true, reasons: [], unknown: false, conflicts: false };
  if (!passesLocalFilters(profile, filters)) { state.match = false; state.reasons.push("Kesin filtre uyuşmadı"); return state; }
  const setChecks = [
    ["genres_ids", "genres", "Tür", "genres"],
    ["spoken_languages_ids", "original_language", "Dil", "spoken_languages"],
    ["production_countries_ids", "production_countries", "Ülke", "production_countries"],
    ["story_locations", "story_locations", "Hikâye yeri", null],
    ["story_period", "story_period", "Dönem", null],
    ["story_geography", "story_geography", "Coğrafya", null],
    ["season", "season", "Mevsim", null],
    ["character_traits", "character_traits", "Karakter niteliği", null],
    ["aspect_ratio", "aspect_ratio", "En-boy oranı", null],
    ["narrative_style", "narrative_style", "Anlatım tarzı", null],
    ["production_process", "production_process", "Çekim süreci", null],
    ["sound", "sound", "Ses", null],
    ["reality", "reality", "Gerçeklik", null],
    ["story_dimensions", "story_dimensions", "Hikâye boyutları", null],
    ["color_style", "color", "Görsel renk stili", null]
  ];
  for (const [pf, ff, label, altField] of setChecks) {
    const f = filters[ff]; if (!f) continue;
    const alt = altField ? profile[altField] : undefined;
    const res = matchSet(profile[pf], f, alt);
    if (!res.match) state.match = false;
    if (res.unknown) state.unknown = true;
    if (res.conflict) state.conflicts = true;
    for (const r of res.reasons) state.reasons.push(`${label} ${r}`);
  }
  if (filters.company) { const res = matchIdSet(profile.production_companies_ids, filters.company); if (!res.match) state.match = false; if (res.unknown) state.unknown = true; }
  if (filters.keywords) { const res = matchIdSet(profile.keywords_ids, filters.keywords); if (!res.match) state.match = false; if (res.unknown) state.unknown = true; }
  if (filters.award) { const res = matchAwards(profile.awards_ids, profile.nominated_ids, filters.award); if (!res.match) state.match = false; if (res.unknown) state.unknown = true; for (const r of res.reasons) state.reasons.push(r); }
  if (filters.filming_locations) { const res = evalFilmingLocations(profile, filters.filming_locations, metatakeLocations, filmmapLocations); if (!res.match) state.match = false; if (res.unknown) state.unknown = true; if (res.reason) state.reasons.push(res.reason); }
  evalRatioFilters(profile, filters, state);
  evalLocationCount(profile, filters, state, metatakeLocations, filmmapLocations);
  if (filters.characterDensity) {
    const c = filters.characterDensity; const fc = profile.family_content || {};
    evalRange(fc, "main_characters", c.mainMin, c.mainMax, "Ana karakter", state, false);
    evalRange(fc, "supporting_characters", c.supportMin, c.supportMax, "Yan karakter", state, false);
    evalRange(fc, "extras", c.extraMin, c.extraMax, "Figüran", state, false);
  }
  if (semanticVerdict && semanticVerdict.verdict === "no") { state.match = false; state.reasons.push(semanticVerdict.reason || "Semantik filtre uyuşmadı"); }
  else if (semanticVerdict && semanticVerdict.verdict === "unknown") { state.unknown = true; if (semanticVerdict.reason) state.reasons.push(semanticVerdict.reason); }
  return state;
      }
