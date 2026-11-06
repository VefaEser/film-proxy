CREATE TABLE IF NOT EXISTS user_movies (
  user_id INTEGER NOT NULL,
  list_type TEXT NOT NULL CHECK(list_type IN ('watched','want','wont')),
  movie_id TEXT NOT NULL,
  imdb_id TEXT,
  title_original TEXT,
  title_tr TEXT,
  year INTEGER,
  imdb_rating REAL,
  imdb_votes INTEGER,
  runtime INTEGER,
  genres TEXT,
  directors TEXT,
  source TEXT NOT NULL DEFAULT 'manual',
  source_meta_json TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, list_type, movie_id)
);
CREATE INDEX IF NOT EXISTS idx_user_movies_user ON user_movies(user_id, list_type);
CREATE INDEX IF NOT EXISTS idx_user_movies_movie ON user_movies(movie_id);
CREATE INDEX IF NOT EXISTS idx_user_movies_imdb ON user_movies(imdb_id);

CREATE TABLE IF NOT EXISTS csv_imports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER,
  list_type TEXT NOT NULL,
  filename TEXT,
  content_hash TEXT,
  row_count INTEGER,
  conflicts INTEGER DEFAULT 0,
  imported_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_csv_imports_user ON csv_imports(user_id, list_type);

CREATE TABLE IF NOT EXISTS user_votes (
  user_id INTEGER NOT NULL,
  movie_id TEXT NOT NULL,
  field TEXT NOT NULL,
  value_json TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, movie_id, field)
);
CREATE INDEX IF NOT EXISTS idx_user_votes_movie ON user_votes(movie_id, field);

CREATE TABLE IF NOT EXISTS movie_field_locks (
  movie_id TEXT NOT NULL,
  field TEXT NOT NULL,
  locked_by INTEGER,
  locked_at INTEGER NOT NULL,
  PRIMARY KEY (movie_id, field)
);
CREATE INDEX IF NOT EXISTS idx_locks_movie ON movie_field_locks(movie_id);
