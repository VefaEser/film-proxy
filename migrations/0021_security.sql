-- ===== DOSYA: migrations/0021_security.sql =====
-- Güvenlik: IP ve kullanıcı bazlı giriş kilidi + girişsiz admin iletişim formu.

CREATE TABLE IF NOT EXISTS login_attempts (
  ip TEXT PRIMARY KEY,
  attempts INTEGER NOT NULL DEFAULT 0,
  last_attempt_ts INTEGER NOT NULL,
  locked_until_ts INTEGER
);
CREATE INDEX IF NOT EXISTS idx_login_attempts_locked ON login_attempts(locked_until_ts);

CREATE TABLE IF NOT EXISTS user_lockouts (
  user_id INTEGER PRIMARY KEY,
  failed_attempts INTEGER NOT NULL DEFAULT 0,
  locked_until_ts INTEGER
);
CREATE INDEX IF NOT EXISTS idx_user_lockouts_locked ON user_lockouts(locked_until_ts);

CREATE TABLE IF NOT EXISTS admin_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT,
  subject TEXT,
  content TEXT NOT NULL,
  ip TEXT,
  created_at INTEGER NOT NULL,
  read_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_admin_messages_created ON admin_messages(created_at DESC);
