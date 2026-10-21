CREATE TABLE IF NOT EXISTS metatake_cache (
  movie_id TEXT PRIMARY KEY,
  locations_json TEXT NOT NULL,
  fetched_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_metatake_cache_fetched ON metatake_cache(fetched_at);
