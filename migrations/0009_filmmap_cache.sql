-- FilmMap (moviescenemap.com) CC0 veri seti önbelleği
-- 19.707 film, 31.115 lokasyon. Birincil çekim yeri kaynağı.
CREATE TABLE IF NOT EXISTS filmmap_cache (
  movie_id TEXT PRIMARY KEY,
  locations_json TEXT NOT NULL,
  fetched_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_filmmap_cache_fetched ON filmmap_cache(fetched_at);
