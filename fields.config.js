// fields.config.js — story_dimensions da karakter_traits gibi iki aşamalı
const days = (n) => n * 86400;
export const SCHEMA_VERSION = 9;

export const CHARACTER_TRAITS_LIST = [
  "male_main", "female_main", "child_main", "lgbt_main",
  "male_support", "female_support", "child_support", "lgbt_support",
  "male_extra", "female_extra", "child_extra", "lgbt_extra",
  "young_main", "middle_main", "old_main", "disabled_main", "animal"
];
export const STORY_DIMENSIONS_LIST = [
  "has_sequel", "is_sequel", "series_sequel", "series_prequel", "series_spinoff",
  "concept", "similar_script_version", "same_plot_diff_script", "same_plot_diff_angle"
];

export const FIELD_DEFS = {
  genres:                 { source: "tmdb", ttl: days(90), required: true },
  genres_ids:             { source: "tmdb", ttl: days(90), required: true },
  spoken_languages:       { source: "tmdb", ttl: days(90), required: true },
  spoken_languages_ids:   { source: "tmdb", ttl: days(90), required: true },
  original_language:      { source: "tmdb", ttl: days(90), required: true },
  production_countries:   { source: "tmdb", ttl: days(90), required: true },
  production_countries_ids: { source: "tmdb", ttl: days(90), required: true },
  runtime:                { source: "tmdb", ttl: days(90) },
  production_companies:   { source: "tmdb", ttl: days(90) },
  production_companies_ids: { source: "tmdb", ttl: days(90) },
  original_poster_path:   { source: "tmdb", ttl: days(90) },
  director:               { source: "tmdb", ttl: days(90) },
  director_ids:           { source: "tmdb", ttl: days(90) },
  writers:                { source: "tmdb", ttl: days(90) },
  writers_ids:            { source: "tmdb", ttl: days(90) },
  producers:              { source: "tmdb", ttl: days(90) },
  cast:                   { source: "tmdb", ttl: days(90) },
  cast_ids:               { source: "tmdb", ttl: days(90) },
  keywords:               { source: "tmdb", ttl: days(90) },
  keywords_ids:           { source: "tmdb", ttl: days(90) },
  story_locations:    { source: "llm", ttl: days(90), prefer: "metatake" },
  related_films:      { source: "llm", ttl: days(90), prefer: "metatake" },
  related_films_detail: { source: "llm", ttl: days(90), prefer: "metatake" },
  location_mode:      { source: "llm", ttl: days(90), prefer: "metatake" },
  location_count:     { source: "llm", ttl: days(90), prefer: "metatake" },
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
  dialogue_density:   { source: "llm", ttl: days(90) },
  color_ratio:        { source: "llm", ttl: days(90) },
  aspect_ratio:       { source: "llm", ttl: days(90) },
  season:             { source: "llm", ttl: days(90) },
  color_style:        { source: "llm", ttl: days(90) },
  imdbRating:         { source: "omdb", ttl: days(7) },
  imdbVotes:          { source: "omdb", ttl: days(7) },
  imdbID:             { source: "omdb", ttl: days(7) },
  omdb_directors:     { source: "omdb", ttl: days(7) },
  actors:             { source: "omdb", ttl: days(7) },
  rated:              { source: "omdb", ttl: days(7) },
  awards:             { source: "omdb", ttl: days(7) },
  metascore:          { source: "omdb", ttl: days(7) },
  boxOffice:          { source: "omdb", ttl: days(7) },
  omdb_poster:        { source: "omdb", ttl: days(7) },
  original_work:      { source: "wikidata", ttl: days(90) },
  filming_locations:  { source: "wikidata", ttl: days(90) },
  filming_countries:  { source: "wikidata", ttl: days(90) },
  awards_ids:         { source: "wikidata", ttl: days(90) },
  nominated_ids:      { source: "wikidata", ttl: days(90) },
  dialogue_density_subtitle: { source: "subtitles", ttl: days(90) },
  filmmap_locations:  { source: "filmmap", ttl: days(90) },
  metatake_locations: { source: "metatake", ttl: days(90) },
  metatake_confidence:{ source: "metatake", ttl: days(90) },
  commons_images:     { source: "commons", ttl: days(90) },
  web_evidence:       { source: "tavily", ttl: days(30) }
};
export const LLM_FIELDS = Object.entries(FIELD_DEFS).filter(([, d]) => d.source === "llm").map(([k]) => k);
export const VALID_SOURCES = [...new Set(Object.values(FIELD_DEFS).map(d => d.source))];

const _CHAR_TRAITS_JSON = CHARACTER_TRAITS_LIST.map(x => `"${x}"`).join(",");
const _STORY_DIMS_JSON = STORY_DIMENSIONS_LIST.map(x => `"${x}"`).join(",");

export const FIELD_RULES = {
  season: 'season: "winter"|"summer"|"spring"|"autumn"',
  reality: 'reality: "true"|"mostly_true"|"inspired"|"realistic"|"fictional"|"utopic"',
  narrative_style: 'narrative_style: "multi"|"reverse"|"linear"|"flashback"|"end_first"|"mid_first"|"fast"|"slow"|"no_end"|"alt_end"|"alt_narr"',
  production_process: 'production_process: "amateur"|"indie"|"art"|"big"|"bmovie"|"avant"|"studio"|"no_music"|"rare_music"|"handheld"|"propaganda"|"dogme"',
  sound: 'sound: "ambient"|"music"|"effects"|"voiceover_ext"|"voiceover_int"|"silent"|"dubbed"',
  story_geography: 'story_geography: "city"|"town"|"village"|"mountain"|"desert"|"steppe"|"forest"|"seaside"|"riverside"|"opensea"|"air"',
  character_traits: `character_traits: string[] — İKİ AŞAMALI:
1) ÖNCE zorunlu 17 slug listesinden en az birini seç (filtre eşleşmesi bunlarla yapılır): [${_CHAR_TRAITS_JSON}]
2) SONRA istediğin kadar serbest açıklama ekleyebilirsin (örn: "erkek dedektif", "yozlaşmış polis", "kadın avukat") — bunlar filtrelenmez, kartta bilgi olarak gösterilir.`,
  // === YENİ: story_dimensions da iki aşamalı ===
  story_dimensions: `story_dimensions: string[] — İKİ AŞAMALI:
1) ÖNCE zorunlu 9 slug listesinden en az birini seç (filtre eşleşmesi bunlarla yapılır): [${_STORY_DIMS_JSON}]
2) SONRA istediğin kadar serbest açıklama ekleyebilirsin (örn: "üçlemenin ikinci filmi", "yeniden çevrim", "aynı yönetmenin önceki filmiyle bağlantılı") — bunlar filtrelenmez, kartta bilgi olarak gösterilir.`,
  color_style: 'color_style: ["black_white","color","mostly_color","mostly_bw","blue_filter","yellow_filter","selective_color","colorized","limited_palette","sepia","mono_tint","bw_red_accent","mixed_bw_color"]',
  location_mode: 'location_mode: "single"|"mostly_single"|"few"|"many"'
};
export const SEMANTIC_FIELDS = [
  "story_period", "story_geography", "character_traits",
  "narrative_style", "production_process", "sound", "reality",
  "story_dimensions", "family_content", "season", "aspect_ratio",
  "original_work", "color"
];
export const RATIO_FIELDS = ["day_ratio", "indoor_ratio", "dialogue_density"];
export const LOCATION_FIELDS = ["location_count"];
export const DETERMINISTIC_FILTERS = [
  "yearMin", "yearMax", "runtimeMin", "runtimeMax", "imdbMin", "imdbMax", "imdbVotesMin",
  "tmdbMin", "tmdbMax", "tmdbVotesMin", "genres", "original_language", "spoken_languages", "production_countries",
  "rated", "company", "keywords", "award", "director", "writers", "cast"
];
export const METATAKE_FIELDS = ["story_locations", "related_films", "related_films_detail", "location_mode", "location_count"];
export const FILMMAP_FIELDS = ["filmmap_locations", "filming_locations"];
