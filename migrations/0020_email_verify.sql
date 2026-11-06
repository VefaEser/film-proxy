-- E-posta doğrulama durumu için sütun ekle.
-- İlk iterasyonda e-posta doğrulaması zorunlu değil; ileride Resend ile aktif edilecek.
ALTER TABLE users ADD COLUMN is_email_verified INTEGER NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS idx_users_email_verified ON users(is_email_verified);
