-- DOSYA: migrations/0023_user_movies_tmdb_id.sql
-- CSV'den gelen filmin TMDB ID'sini saklar. Böylece movie_profiles tablosuyla
-- doğrudan eşleştirme yapılabilir (kartı olan filmler için renderFilmCard kullanılır).
ALTER TABLE user_movies ADD COLUMN tmdb_id INTEGER;
CREATE INDEX IF NOT EXISTS idx_user_movies_tmdb ON user_movies(tmdb_id);
