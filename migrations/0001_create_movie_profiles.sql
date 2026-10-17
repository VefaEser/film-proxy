CREATE TABLE IF NOT EXISTS movie_profiles (
  movie_id TEXT PRIMARY KEY,
  title TEXT,
  year INTEGER,
  data_json TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  last_refreshed_at INTEGER
);

CREATE TABLE IF NOT EXISTS movie_profile_fields (
  movie_id TEXT NOT NULL,
  field TEXT NOT NULL,
  source TEXT NOT NULL,
  value_json TEXT,
  fetched_at INTEGER NOT NULL,
  PRIMARY KEY (movie_id, field)
);

CREATE INDEX IF NOT EXISTS idx_movie_profiles_updated
  ON movie_profiles(updated_at);

CREATE INDEX IF NOT EXISTS idx_movie_profile_fields_fetched
  ON movie_profile_fields(movie_id, fetched_at);
