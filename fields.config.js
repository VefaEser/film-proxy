// Film profilinde tutulan alanların tanımı.
// source: "omdb" | "wikidata" | "commons" | "tavily" | "gemini"
// ttl: saniye; null = süresiz (yalnızca manuel yenileme)

export const FIELD_DEFS = {
  // Gemini (göreceli / tahmini)
  night_ratio:       { source: "gemini",   ttl: null },
  day_ratio:         { source: "gemini",   ttl: null },
  indoor_ratio:      { source: "gemini",   ttl: null },
  location_count:    { source: "gemini",   ttl: null },
  dialogue_density:  { source: "gemini",   ttl: null },
  color_ratio:       { source: "gemini",   ttl: null },
  aspect_ratio:      { source: "gemini",   ttl: null },
  season:            { source: "gemini",   ttl: null },
  family_content:    { source: "gemini",   ttl: null },
  related_films:     { source: "gemini",   ttl: null },

  // OMDb
  imdbRating:        { source: "omdb",     ttl: 7 * 86400 },
  imdbVotes:         { source: "omdb",     ttl: 7 * 86400 },
  imdbID:            { source: "omdb",     ttl: 7 * 86400 },
  directors:         { source: "omdb",     ttl: 90 * 86400 },

  // Wikidata
  original_work:     { source: "wikidata", ttl: 90 * 86400 },
  filming_locations: { source: "wikidata", ttl: 90 * 86400 },

  // Wikimedia Commons
  commons_images:    { source: "commons",  ttl: 90 * 86400 },

  // Tavily
  web_evidence:      { source: "tavily",   ttl: 30 * 86400 }
};

export const GEMINI_FIELDS = Object.entries(FIELD_DEFS)
  .filter(([, def]) => def.source === "gemini")
  .map(([key]) => key);

export const VALID_SOURCES = ["omdb", "wikidata", "commons", "tavily", "gemini"];
