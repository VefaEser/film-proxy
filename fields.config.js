export const FIELD_DEFS = {
  // TMDB (detay çağrısı)
  genres:               { source: "tmdb", ttl: 90 * 86400 },
  spoken_languages:     { source: "tmdb", ttl: 90 * 86400 },
  production_countries: { source: "tmdb", ttl: 90 * 86400 },
  runtime:              { source: "tmdb", ttl: 90 * 86400 },

  // Gemini
  story_locations:    { source: "gemini", ttl: null },
  story_period:       { source: "gemini", ttl: null },
  story_geography:    { source: "gemini", ttl: null },
  character_traits:   { source: "gemini", ttl: null },
  narrative_style:    { source: "gemini", ttl: null },
  production_process: { source: "gemini", ttl: null },
  sound:              { source: "gemini", ttl: null },
  reality:            { source: "gemini", ttl: null },
  story_dimensions:   { source: "gemini", ttl: null },
  family_content:     { source: "gemini", ttl: null },
  night_ratio:        { source: "gemini", ttl: null },
  day_ratio:          { source: "gemini", ttl: null },
  indoor_ratio:       { source: "gemini", ttl: null },
  location_count:     { source: "gemini", ttl: null },
  dialogue_density:   { source: "gemini", ttl: null },
  color_ratio:        { source: "gemini", ttl: null },
  aspect_ratio:       { source: "gemini", ttl: null },
  season:             { source: "gemini", ttl: null },
  related_films:      { source: "gemini", ttl: null },

  // OMDb
  imdbRating:   { source: "omdb", ttl: 7 * 86400 },
  imdbVotes:    { source: "omdb", ttl: 7 * 86400 },
  imdbID:       { source: "omdb", ttl: 7 * 86400 },
  directors:    { source: "omdb", ttl: 90 * 86400 },

  // Wikidata
  original_work:     { source: "wikidata", ttl: 90 * 86400 },
  filming_locations: { source: "wikidata", ttl: 90 * 86400 },

  // Commons
  commons_images: { source: "commons", ttl: 90 * 86400 },

  // Tavily
  web_evidence: { source: "tavily", ttl: 30 * 86400 }
};

export const GEMINI_FIELDS = Object.entries(FIELD_DEFS)
  .filter(([, d]) => d.source === "gemini")
  .map(([k]) => k);

export const VALID_SOURCES = ["tmdb", "omdb", "wikidata", "commons", "tavily", "gemini"];
