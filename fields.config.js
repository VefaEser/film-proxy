/**
 * ttl: saniye cinsinden cache ömrü.
 *   sayı  → bu süre sonunda alan stale sayılır, yeniden çekilir
 *   null  → SADECE "her zaman stale" anlamına gelir (cache'lenmez). Bu dosyada
 *           kullanılmıyor; tüm alanlar somut TTL'e sahiptir.
 *
 * required: true → upstream API düşse bile bu alan çekilemezse
 *                 film "kısmi veri" olarak işaretlenir.
 *
 * source: "llm" → Groq (birincil) veya Gemini (yedek) tarafından doldurulur.
 */
const days = (n) => n * 86400;

export const SCHEMA_VERSION = 1;

export const FIELD_DEFS = {
  // TMDB (detay çağrısı) — 90 gün
  genres:                 { source: "tmdb", ttl: days(90), required: true },
  genres_ids:             { source: "tmdb", ttl: days(90), required: true },
  spoken_languages:       { source: "tmdb", ttl: days(90), required: true },
  spoken_languages_ids:   { source: "tmdb", ttl: days(90), required: true },
  production_countries:   { source: "tmdb", ttl: days(90), required: true },
  production_countries_ids: { source: "tmdb", ttl: days(90), required: true },
  runtime:                { source: "tmdb", ttl: days(90) },
  production_companies:   { source: "tmdb", ttl: days(90) },
  director:               { source: "tmdb", ttl: days(90) },
  writers:                { source: "tmdb", ttl: days(90) },
  producers:              { source: "tmdb", ttl: days(90) },
  cast:                   { source: "tmdb", ttl: days(90) },

  // LLM (Groq birincil / Gemini yedek) — 30 gün
  story_locations:    { source: "llm", ttl: days(30) },
  story_period:       { source: "llm", ttl: days(30) },
  story_geography:    { source: "llm", ttl: days(30) },
  character_traits:   { source: "llm", ttl: days(30) },
  narrative_style:    { source: "llm", ttl: days(30) },
  production_process: { source: "llm", ttl: days(30) },
  sound:              { source: "llm", ttl: days(30) },
  reality:            { source: "llm", ttl: days(30) },
  story_dimensions:   { source: "llm", ttl: days(30) },
  family_content:     { source: "llm", ttl: days(30) },
  night_ratio:        { source: "llm", ttl: days(30) },
  day_ratio:          { source: "llm", ttl: days(30) },
  indoor_ratio:       { source: "llm", ttl: days(30) },
  location_count:     { source: "llm", ttl: days(30) },
  dialogue_density:   { source: "llm", ttl: days(30) },
  color_ratio:        { source: "llm", ttl: days(30) },
  aspect_ratio:       { source: "llm", ttl: days(30) },
  season:             { source: "llm", ttl: days(30) },
  related_films:      { source: "llm", ttl: days(30) },

  // OMDb — 7 gün (puan/oy sık değişir)
  imdbRating:         { source: "omdb", ttl: days(7) },
  imdbVotes:          { source: "omdb", ttl: days(7) },
  imdbID:             { source: "omdb", ttl: days(7) },
  omdb_directors:     { source: "omdb", ttl: days(7) },
  actors:             { source: "omdb", ttl: days(7) },
  rated:              { source: "omdb", ttl: days(7) },
  awards:             { source: "omdb", ttl: days(7) },
  metascore:          { source: "omdb", ttl: days(7) },
  boxOffice:          { source: "omdb", ttl: days(7) },

  // Wikidata — 90 gün
  original_work:      { source: "wikidata", ttl: days(90) },
  filming_locations:  { source: "wikidata", ttl: days(90) },

  // Commons — 90 gün
  commons_images:     { source: "commons", ttl: days(90) },

  // Tavily — 30 gün
  web_evidence:       { source: "tavily", ttl: days(30) }
};

export const LLM_FIELDS = Object.entries(FIELD_DEFS)
  .filter(([, d]) => d.source === "llm")
  .map(([k]) => k);

export const VALID_SOURCES = [...new Set(Object.values(FIELD_DEFS).map(d => d.source))];
