-- DOSYA: migrations/0028_list_settings_and_rating.sql
-- 1) Her liste için ayrı public/private ayarı
-- 2) Site puanı için user_rating sütunu zaten var; 1-10 aralık kullanıcı arayüzünde zorlanır.

CREATE TABLE IF NOT EXISTS user_list_settings (
  user_id INTEGER NOT NULL,
  list_type TEXT NOT NULL CHECK(list_type IN ('watched','want','wont')),
  is_public INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, list_type)
);
CREATE INDEX IF NOT EXISTS idx_user_list_settings_user ON user_list_settings(user_id);

-- Eski is_public sütunu (users tablosu) varsayılan private olarak korunur;
-- yeni liste bazlı görünürlük user_list_settings üzerinden yürür.

-- Site puanı için hızlı sorgu: user_movies üzerinde user_rating filtrelenebilsin
CREATE INDEX IF NOT EXISTS idx_user_movies_user_rating_tmdb ON user_movies(tmdb_id, user_rating);
CREATE INDEX IF NOT EXISTS idx_user_movies_user_rating_imdb ON user_movies(imdb_id, user_rating);
