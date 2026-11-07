-- DOSYA: migrations/0024_user_rating.sql
-- CSV "Your Rating" sütununu saklamak için user_movies'a user_rating ekle.
ALTER TABLE user_movies ADD COLUMN user_rating REAL;
CREATE INDEX IF NOT EXISTS idx_user_movies_user_rating ON user_movies(user_rating);
