-- DOSYA: migrations/0031_rating_visibility.sql
-- Kullanıcı bazlı puan görünürlüğü (varsayılan: gizli).
-- Liste görünürlüğü (user_list_settings) ile birlikte çalışır:
--   - user_list_settings.is_public: "İzlediklerim listemi kimler görebilir"
--   - users.rating_visibility:      "Verdiğim puanlar ismimle görünsün mü"

ALTER TABLE users ADD COLUMN rating_visibility TEXT NOT NULL DEFAULT 'private';
CREATE INDEX IF NOT EXISTS idx_users_rating_visibility ON users(rating_visibility);
