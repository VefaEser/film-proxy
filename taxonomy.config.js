// taxonomy.config.js — Birleştirici modül (TAXONOMY_VERSION 2.0.0)
// 76 alt tür + 155 klişe + 75 tema = 306 kavram
// 4 alt modülden beslenir, dışarıya tek bir API sunar.
import { SUBGENRES } from "./taxonomy.subgenres.js";
import { TROPES, TROPE_SUBTYPES } from "./taxonomy.tropes.js";
import { THEMES } from "./taxonomy.themes.js";
import { TMDB_KEYWORD_MAP, TMDB_KEYWORD_CANDIDATES, getKeywordIdsForSlug, hasKeywordForSlug } from "./taxonomy.keywords.js";

export const TAXONOMY_VERSION = "2.0.0";

// Re-export (mevcut kod uyumu için)
export { SUBGENRES, TROPES, THEMES, TROPE_SUBTYPES };
export { TMDB_KEYWORD_MAP, TMDB_KEYWORD_CANDIDATES, getKeywordIdsForSlug, hasKeywordForSlug };

// ============================================================
// KATEGORİ SETLERİ
// ============================================================
export const SUBGENRE_SLUGS = new Set(SUBGENRES.map(x => x.slug));
export const TROPE_SLUGS = new Set(TROPES.map(x => x.slug));
export const THEME_SLUGS = new Set(THEMES.map(x => x.slug));
export const ALL_TAXONOMY_SLUGS = new Set([...SUBGENRE_SLUGS, ...TROPE_SLUGS, ...THEME_SLUGS]);

// Kategori meta (frontend için)
export const TAXONOMY_CATEGORIES = [
  { key: "subgenres", label: "Alt türler",              count: SUBGENRES.length },
  { key: "tropes",    label: "Klişeler / anlatı motifleri", count: TROPES.length },
  { key: "themes",    label: "Temalar",                 count: THEMES.length }
];

// ============================================================
// YARDIMCILAR
// ============================================================

// Bir slug'ı bulur, hangi kategoride olduğunu döner.
export function findSlugCategory(slug) {
  const s = String(slug || "").trim();
  if (!s) return null;
  if (SUBGENRE_SLUGS.has(s)) return "subgenres";
  if (TROPE_SLUGS.has(s)) return "tropes";
  if (THEME_SLUGS.has(s)) return "themes";
  return null;
}

// Slug geçerli mi (herhangi bir kategoride)?
export function isValidTaxonomySlug(slug) {
  return findSlugCategory(slug) !== null;
}

// Slug'ın kategoriye uygun olup olmadığını kontrol eder.
export function isValidSlugForCategory(slug, category) {
  const s = String(slug || "").trim();
  if (category === "subgenres") return SUBGENRE_SLUGS.has(s);
  if (category === "tropes") return TROPE_SLUGS.has(s);
  if (category === "themes") return THEME_SLUGS.has(s);
  return false;
}

// Name/alias araması — kullanıcı özel girişi için.
// Dönen: { category, slug, matchType } | null
export function matchUserInputToTaxonomy(input) {
  const q = String(input || "").trim().toLowerCase();
  if (!q) return null;
  const normStr = (s) => String(s || "").toLowerCase().trim();

  const tryMatch = (arr, category) => {
    // 1) Tam slug
    for (const e of arr) if (normStr(e.slug) === q) return { category, slug: e.slug, matchType: "slug" };
    // 2) Tam TR/EN ad
    for (const e of arr) {
      if (normStr(e.name_tr) === q || normStr(e.name_en) === q) return { category, slug: e.slug, matchType: "name" };
    }
    // 3) Alias
    for (const e of arr) {
      const all = [...(e.aliases_tr || []), ...(e.aliases_en || [])];
      if (all.some(a => normStr(a) === q)) return { category, slug: e.slug, matchType: "alias" };
    }
    // 4) Kısmi eşleşme (ad içinde)
    for (const e of arr) {
      if (normStr(e.name_tr).includes(q) || normStr(e.name_en).includes(q)) return { category, slug: e.slug, matchType: "partial" };
    }
    return null;
  };

  return tryMatch(SUBGENRES, "subgenres") ||
         tryMatch(TROPES, "tropes") ||
         tryMatch(THEMES, "themes");
}

// Bir kategorideki tüm slug'ları liste olarak döner.
export function getSlugsForCategory(category) {
  if (category === "subgenres") return [...SUBGENRE_SLUGS];
  if (category === "tropes") return [...TROPE_SLUGS];
  if (category === "themes") return [...THEME_SLUGS];
  return [];
}

// Bir slug'ın tüm detaylarını getirir.
export function getTaxonomyEntry(slug) {
  const s = String(slug || "").trim();
  if (!s) return null;
  const cat = findSlugCategory(s);
  if (!cat) return null;
  const arr = cat === "subgenres" ? SUBGENRES : cat === "tropes" ? TROPES : THEMES;
  return arr.find(e => e.slug === s) || null;
}

// Sözlük bütünlüğü doğrulaması — startup'ta opsiyonel çağrılabilir.
export function validateTaxonomy() {
  const errors = [];
  const seenSlugs = new Set();
  const all = [...SUBGENRES, ...TROPES, ...THEMES];
  for (const e of all) {
    if (!e.slug) { errors.push(`Boş slug: ${JSON.stringify(e).slice(0, 60)}`); continue; }
    if (seenSlugs.has(e.slug)) errors.push(`Duplicate slug: ${e.slug}`);
    seenSlugs.add(e.slug);
    if (!e.name_tr || !e.name_en) errors.push(`Eksik isim: ${e.slug}`);
    if (!e.definition_tr || !e.definition_en) errors.push(`Eksik tanım: ${e.slug}`);
    if (e.subtype && !TROPE_SUBTYPES.has(e.subtype)) errors.push(`Geçersiz subtype: ${e.slug} → ${e.subtype}`);
  }
  for (const t of TROPES) if (!t.subtype) errors.push(`Subtype eksik: ${t.slug}`);
  for (const e of all) {
    for (const rel of (e.related_slugs || [])) {
      if (!seenSlugs.has(rel)) errors.push(`Geçersiz related_slug: ${e.slug} → ${rel}`);
    }
  }
  return {
    ok: errors.length === 0,
    totalSubgenres: SUBGENRES.length,
    totalTropes: TROPES.length,
    totalThemes: THEMES.length,
    total: all.length,
    keywordMapped: Object.keys(TMDB_KEYWORD_MAP).length,
    keywordCandidates: Object.keys(TMDB_KEYWORD_CANDIDATES).length,
    errors
  };
         }
