-- DOSYA: migrations/0026_manual_movie_admin.sql
-- Admin tarafından manuel kart ekleme/düzenleme/silme için yardımcı indeks.
CREATE INDEX IF NOT EXISTS idx_user_movies_movie_id ON user_movies(movie_id);
