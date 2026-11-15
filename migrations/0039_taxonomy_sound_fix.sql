-- DOSYA: migrations/0039_taxonomy_sound_fix.sql
-- Faz 8 Phase D revize: technical_style sadece kamera, no_music/rare_music → sound
--
-- Sıra kritik:
--   ADIM 1: sound'a ekle (önce kopyala)
--   ADIM 2: technical_style'dan sil
--   ADIM 3: filter_info.sound sil
--   ADIM 4: filter_verdicts temizle

-- ============================================================
-- ADIM 1: technical_style'dan sound'a no_music/rare_music TAŞI
-- ============================================================
UPDATE movie_profiles
SET data_json = json_set(
  data_json,
  '$.sound',
  COALESCE(
    (SELECT json_group_array(DISTINCT combined.value) FROM (
      SELECT value FROM json_each(COALESCE(json_extract(movie_profiles.data_json, '$.sound'), json('[]')))
      UNION
      SELECT value FROM json_each(json_extract(movie_profiles.data_json, '$.technical_style'))
        WHERE value IN ('no_music','rare_music')
    ) combined),
    json('[]')
  )
)
WHERE json_valid(data_json)
  AND json_type(data_json, '$.technical_style') = 'array'
  AND EXISTS (
    SELECT 1 FROM json_each(json_extract(movie_profiles.data_json, '$.technical_style'))
    WHERE value IN ('no_music','rare_music')
  );

-- ============================================================
-- ADIM 2: technical_style'dan no_music/rare_music ÇIKAR
-- ============================================================
UPDATE movie_profiles
SET data_json = json_set(
  data_json,
  '$.technical_style',
  COALESCE(
    (SELECT json_group_array(j.value) FROM json_each(json_extract(movie_profiles.data_json, '$.technical_style')) j
      WHERE j.value NOT IN ('no_music','rare_music')),
    json('[]')
  )
)
WHERE json_valid(data_json)
  AND json_type(data_json, '$.technical_style') = 'array';

-- ============================================================
-- ADIM 3: app_config'ten eski filter_info.sound sil
-- ============================================================
DELETE FROM app_config WHERE key = 'filter_info.sound';

-- ============================================================
-- ADIM 4: filter_verdicts eski signature temizle
-- ============================================================
DELETE FROM filter_verdicts
WHERE filter_signature LIKE '%"technical_style"%'
   OR filter_signature LIKE '%"sound"%';

-- ============================================================
-- Doğrulama (workflow logunda görünür)
-- ============================================================
SELECT
  (SELECT COUNT(*) FROM movie_profiles WHERE json_valid(data_json) AND json_type(data_json, '$.technical_style') = 'array' AND EXISTS (SELECT 1 FROM json_each(json_extract(movie_profiles.data_json, '$.technical_style')) WHERE value IN ('no_music','rare_music'))) AS ts_has_music,
  (SELECT COUNT(*) FROM movie_profiles WHERE json_valid(data_json) AND json_type(data_json, '$.sound') = 'array' AND EXISTS (SELECT 1 FROM json_each(json_extract(movie_profiles.data_json, '$.sound')) WHERE value IN ('no_music','rare_music'))) AS sound_has_music,
  (SELECT COUNT(*) FROM app_config WHERE key = 'filter_info.sound') AS old_config;
