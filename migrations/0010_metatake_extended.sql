-- Metatake zenginleştirme önbelleği
-- narrative_setting, kindred_films, awards, confidence alanlarını saklar.
CREATE TABLE IF NOT EXISTS metatake_extended (
  movie_id TEXT PRIMARY KEY,
  narrative_setting_json TEXT,
  kindred_films_json TEXT,
  awards_json TEXT,
  confidence REAL,
  locations_json TEXT,
  fetched_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_metatake_extended_fetched ON metatake_extended(fetched_at);
