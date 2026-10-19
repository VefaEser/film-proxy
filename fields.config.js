/**
 * ttl: saniye cinsinden cache ömrü.
 *   sayı  → bu süre sonunda alan stale sayılır, yeniden çekilir
 *   null  → SADECE "her zaman stale" anlamına gelir (cache'lenmez). Bu dosyada
 *           kullanılmıyor; tüm alanlar somut TTL'e sahiptir.
 *
 * required: true → upstream API düşse bile bu alan çekilemezse
 *                 film "kısmi veri" olarak işaretlenir.
 *
 * source: "llm" → Gemini (birincil) veya Groq (yedek) tarafından doldurulur.
 */
const days = (n) => n * 86400;

export const SCHEMA_VERSION = 2;

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

  // LLM (Gemini birincil / Groq yedek) — 90 gün
  story_locations:    { source: "llm", ttl: days(90) },
  story_period:       { source: "llm", ttl: days(90) },
  story_geography:    { source: "llm", ttl: days(90) },
  character_traits:   { source: "llm", ttl: days(90) },
  narrative_style:    { source: "llm", ttl: days(90) },
  production_process: { source: "llm", ttl: days(90) },
  sound:              { source: "llm", ttl: days(90) },
  reality:            { source: "llm", ttl: days(90) },
  story_dimensions:   { source: "llm", ttl: days(90) },
  family_content:     { source: "llm", ttl: days(90) },
  night_ratio:        { source: "llm", ttl: days(90) },
  day_ratio:          { source: "llm", ttl: days(90) },
  indoor_ratio:       { source: "llm", ttl: days(90) },
  location_count:     { source: "llm", ttl: days(90) },
  dialogue_density:   { source: "llm", ttl: days(90) },
  color_ratio:        { source: "llm", ttl: days(90) },
  aspect_ratio:       { source: "llm", ttl: days(90) },
  season:             { source: "llm", ttl: days(90) },
  related_films:      { source: "llm", ttl: days(90) },

  // OMDb — 7 gün
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

// Kategori alanları için geçerli değerler — {{RULES}} placeholder'ı sadece
// istenen alanlara ait satırlarla doldurulur (token tasarrufu).
export const FIELD_RULES = {
  season: 'season: "winter"|"summer"|"spring"|"autumn"',
  reality: 'reality: "true"|"mostly_true"|"inspired"|"realistic"|"fictional"|"utopic"',
  narrative_style: 'narrative_style: "multi"|"reverse"|"linear"|"flashback"|"end_first"|"mid_first"|"fast"|"slow"|"no_end"|"alt_end"|"alt_narr"',
  production_process: 'production_process: "amateur"|"indie"|"art"|"big"|"bmovie"|"avant"|"studio"|"no_music"|"rare_music"|"handheld"|"propaganda"|"dogme"',
  sound: 'sound: "ambient"|"music"|"effects"|"voiceover_ext"|"voiceover_int"|"silent"|"dubbed"',
  story_geography: 'story_geography: "city"|"town"|"village"|"mountain"|"desert"|"steppe"|"forest"|"seaside"|"riverside"|"opensea"|"air"',
  character_traits: 'character_traits: "male_main"|"female_main"|"child_main"|"lgbt_main"|"male_support"|"female_support"|"child_support"|"lgbt_support"|"young_main"|"middle_main"|"old_main"|"disabled_main"|"animal" vb.',
  story_dimensions: 'story_dimensions: "has_sequel"|"is_sequel"|"series_tight"|"series_loose"|"concept"|"has_version"|"same_event"'
};
