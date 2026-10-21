CREATE TABLE IF NOT EXISTS movie_lists (
  movie_id TEXT NOT NULL,
  list_name TEXT NOT NULL,
  position INTEGER,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (movie_id, list_name)
);
CREATE INDEX IF NOT EXISTS idx_movie_lists_name ON movie_lists(list_name, position);
