-- DOSYA: migrations/0032_normalize_imdb_id.sql
-- Önceki sürümlerde imdb_id iki formatta saklanmış olabilir:
--   - "0114369"     (prefixsiz, yeni format)
--   - "tt0114369"   (prefixli, eski format)
-- Bu migration tüm kayıtları prefixsiz + tmdb_id ile hizalar.

-- 1) tt önekini temizle
UPDATE user_movies
SET imdb_id = REPLACE(imdb_id, 'tt', '')
WHERE imdb_id LIKE 'tt%';

-- 2) movie_id'yi de normalize et (prefixsiz format beklenir; imdb:0114369 → korunur çünkü movie_id ayrı)
-- Eski kayıtlarda movie_id "imdb:tt0114369" ise temizle
UPDATE user_movies
SET movie_id = 'imdb:' || REPLACE(SUBSTR(movie_id, 6), 'tt', '')
WHERE movie_id LIKE 'imdb:tt%';

-- 3) tmdb_id varsa movie_id'yi tmdb:N yap (kart eşleşmesi için)
UPDATE user_movies
SET movie_id = 'tmdb:' || tmdb_id
WHERE tmdb_id IS NOT NULL
  AND movie_id LIKE 'imdb:%';
