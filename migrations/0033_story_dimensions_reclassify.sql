-- DOSYA: migrations/0033_story_dimensions_reclassify.sql
-- Amaç: story_dimensions alanı 9 slug'dan 12 slug'a çıkarıldı (reboot, film_franchise, remake).
-- Bu değişiklik nedeniyle:
--   1) Eski 9-slug'la sınıflandırılmış story_dimensions değerleri yeniden sınıflandırılmalı
--   2) app_config'teki eski filter_info.story_dimensions (9 slug metni) silinmeli → DEFAULT (12 slug) devreye girsin
--   3) app-admin.js CLIENT_FILTER_INFO_DEFAULTS'taki yeni metin görünür olsun
--
-- NOT: Movie verisi silinmiyor; sadece hedef alan temizleniyor. Bir sonraki aramada
-- LLM 12-slug listesiyle yeniden dolduracak.

-- 1) Eski story_dimensions değerlerini movie_profiles'tan temizle
UPDATE movie_profiles
SET data_json = json_remove(data_json, '$.story_dimensions')
WHERE json_valid(data_json)
  AND json_extract(data_json, '$.story_dimensions') IS NOT NULL;

-- 2) movie_profile_fields'taki story_dimensions kayıtlarını temizle
-- Böylece findStaleFields bir sonraki aramada bu alanı "stale" olarak görür
DELETE FROM movie_profile_fields WHERE field = 'story_dimensions';

-- 3) app_config'teki eski filter_info.story_dimensions metnini sil
-- (9 slug'lı eski metin DB'de duruyorsa config.js DEFAULT'unu override ediyordu)
DELETE FROM app_config WHERE key = 'filter_info.story_dimensions';

-- Doğrulama için log (D1 Console'da kontrol edilebilir)
SELECT
  (SELECT COUNT(*) FROM movie_profiles) AS total_profiles,
  (SELECT COUNT(*) FROM movie_profile_fields WHERE field = 'story_dimensions') AS stale_field_rows,
  (SELECT COUNT(*) FROM app_config WHERE key = 'filter_info.story_dimensions') AS old_config_rows;
