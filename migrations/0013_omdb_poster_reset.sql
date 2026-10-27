-- Yeni omdb_poster alanı FIELD_DEFS'e eklendi. Eski profillerde bu alan yoksa
-- bir sonraki aramada OMDb'den otomatik çekilecek. Eski hatalı poster
-- kalıntılarını temizlemek için original_poster_path'i sıfırlıyoruz
-- (migration 0012 zaten yapmıştı; idempotent tekrar).
UPDATE movie_profiles
SET data_json = json_remove(data_json, '$.omdb_poster')
WHERE json_valid(data_json) AND json_extract(data_json, '$.omdb_poster') IS NOT NULL;

DELETE FROM movie_profile_fields WHERE field = 'omdb_poster';
