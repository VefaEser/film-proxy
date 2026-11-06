CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  register_number INTEGER NOT NULL UNIQUE,
  username TEXT NOT NULL UNIQUE COLLATE NOCASE,
  email TEXT,
  password_hash TEXT NOT NULL,
  password_salt TEXT NOT NULL,
  security_questions_json TEXT,
  is_admin INTEGER NOT NULL DEFAULT 0,
  is_approved INTEGER NOT NULL DEFAULT 0,
  is_public INTEGER NOT NULL DEFAULT 0,
  is_suspended INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  deleted_at INTEGER,
  suspended_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
CREATE INDEX IF NOT EXISTS idx_users_regnum ON users(register_number);
CREATE INDEX IF NOT EXISTS idx_users_public ON users(is_public, is_suspended);

CREATE TABLE IF NOT EXISTS user_sessions (
  id TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL,
  token_hash TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  ip TEXT,
  user_agent TEXT
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON user_sessions(user_id, expires_at);
CREATE INDEX IF NOT EXISTS idx_sessions_exp ON user_sessions(expires_at);

CREATE TABLE IF NOT EXISTS user_permissions (
  user_id INTEGER NOT NULL,
  permission TEXT NOT NULL,
  granted_by INTEGER,
  granted_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, permission)
);
CREATE INDEX IF NOT EXISTS idx_perms ON user_permissions(permission);

INSERT OR IGNORE INTO app_config (key, value, updated_at)
VALUES ('users.next_register_number', '12345', strftime('%s','now'));
