CREATE TABLE IF NOT EXISTS comments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  movie_id TEXT NOT NULL,
  user_id INTEGER NOT NULL,
  content TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected','edited')),
  edited_by INTEGER,
  edited_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_comments_movie ON comments(movie_id, status, created_at);
CREATE INDEX IF NOT EXISTS idx_comments_user ON comments(user_id, created_at);

CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  from_user_id INTEGER NOT NULL,
  to_user_id INTEGER NOT NULL,
  content TEXT NOT NULL,
  read_at INTEGER,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_messages_to ON messages(to_user_id, read_at, created_at);
CREATE INDEX IF NOT EXISTS idx_messages_from ON messages(from_user_id, created_at);

CREATE TABLE IF NOT EXISTS edit_suggestions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  movie_id TEXT NOT NULL,
  user_id INTEGER NOT NULL,
  field TEXT NOT NULL,
  suggested_value_json TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected')),
  reviewed_by INTEGER,
  reviewed_at INTEGER,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_suggestions_movie ON edit_suggestions(movie_id, status);
CREATE INDEX IF NOT EXISTS idx_suggestions_user ON edit_suggestions(user_id, status);
