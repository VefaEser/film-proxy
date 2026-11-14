-- DOSYA: migrations/0035_color_style_rename.sql
-- Amaç: color (frontend data-name) → color_style (backend field) tutarlılığı.
-- Bu migration uygulandıktan sonra tüm modüller color_style kullanacak.
--
-- Etkilenen yerler:
--   1) app_config: filter_info.color → filter_info.color_style
--   2) static_options: field = 'color' → field = 'color_style'
--   3) movie_profiles.data_json: 'color' → 'color_style' (nadiren eski kayıtlar)
--   4) movie_profile_fields: field = 'color' → field = 'color_style'
--
-- NOT: Bu migration idempotenttir — tekrar çalıştırılabilir.

-- 1) app_config: filter_info.color → filter_info.color_style
UPDATE app_config SET key = 'filter_info.color_style'
WHERE key = 'filter_info.color'
  AND NOT EXISTS (SELECT 1 FROM app_config WHERE key = 'filter_info.color_style');

-- 2) static_options: field = 'color' → field = 'color_style'
UPDATE static_options SET field = 'color_style'
WHERE field = 'color'
  AND NOT EXISTS (SELECT 1 FROM static_options so2 WHERE so2.field = 'color_style' AND so2.id = static_options.id);

-- 3) movie_profiles.data_json: eski 'color' alanı varsa 'color_style'a taşı
UPDATE movie_profiles
SET data_json = json_set(json_remove(data_json, '$.color'), '$.color_style', json_extract(data_json, '$.color'))
WHERE json_valid(data_json)
  AND json_extract(data_json, '$.color') IS NOT NULL
  AND json_extract(data_json, '$.color_style') IS NULL;

-- 4) movie_profile_fields: 'color' field'ı varsa 'color_style'a rename
UPDATE movie_profile_fields SET field = 'color_style'
WHERE field = 'color'
  AND NOT EXISTS (SELECT 1 FROM movie_profile_fields mpf2 WHERE mpf2.movie_id = movie_profile_fields.movie_id AND mpf2.field = 'color_style');

-- Doğrulama (D1 Console'da kontrol edilebilir)
SELECT
  (SELECT COUNT(*) FROM app_config WHERE key = 'filter_info.color') AS old_config_color,
  (SELECT COUNT(*) FROM app_config WHERE key = 'filter_info.color_style') AS new_config_color_style,
  (SELECT COUNT(*) FROM static_options WHERE field = 'color') AS old_static_color,
  (SELECT COUNT(*) FROM static_options WHERE field = 'color_style') AS new_static_color_style,
  (SELECT COUNT(*) FROM movie_profile_fields WHERE field = 'color') AS old_field_color,
  (SELECT COUNT(*) FROM movie_profile_fields WHERE field = 'color_style') AS new_field_color_style;
