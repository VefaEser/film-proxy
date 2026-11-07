-- DOSYA: migrations/0025_dedupe_user_movies.sql
-- Aynı user_id + imdb_id için birden fazla kayıt varsa en son güncelleneni tut, eskileri sil (çift kart).
DELETE FROM user_movies
WHERE rowid NOT IN (
  SELECT MAX(rowid) FROM user_movies
  WHERE imdb_id IS NOT NULL AND imdb_id != ''
  GROUP BY user_id, imdb_id
)
AND imdb_id IS NOT NULL AND imdb_id != '';
