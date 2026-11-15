-- DOSYA: migrations/0038_taxonomy_split.sql
-- Faz 8 Phase D: narrative_style + production_process → 5 alan
--
-- Nihai taksonomi:
--   1) narrative_style     — multi, reverse, linear, flashback, end_first, mid_first, no_end, alt_end, alt_narr
--   2) narrative_pace      — fast, slow
--   3) production_category — amateur, indie, big, bmovie, studio, propaganda
--   4) cinema_approach     — art, avant, dogme
--   5) technical_style     — handheld, no_music, rare_music
--
-- Bu migration dönüştürülebilir veriyi KORUR; kirli/karmaşık veri boş array'e döner
-- ve findStaleFields otomatik re-classify eder. Veri kaybı yok.
--
-- ÖNEMLİ: Tüm Phase D dosyaları deploy edildikten SONRA çalıştırılmalı.
-- Sıra: kod deploy → migration → ilk arama (re-classify).

-- ============================================================
-- ADIM 0: Yedek — migration öncesi sayılar
-- ============================================================
-- Aşağıdaki sorgular migration öncesi çalıştırılıp not alınmalı:
--   SELECT COUNT(*) FROM movie_profiles WHERE json_valid(data_json) AND json_extract(data_json, '$.narrative_style') IS NOT NULL;
--   SELECT COUNT(*) FROM movie_profiles WHERE json_valid(data_json) AND json_extract(data_json, '$.production_process') IS NOT NULL;

-- ============================================================
-- ADIM 1: narrative_style (text) → array + doğru alana dağıt
-- "linear" → $.narrative_style = ["linear"]
-- "fast"   → $.narrative_pace  = ["fast"]
-- ============================================================
UPDATE movie_profiles
SET data_json = json_set(
  data_json,
  '$.narrative_style',
  CASE
    WHEN json_extract(data_json, '$.narrative_style') IN ('multi','reverse','linear','flashback','end_first','mid_first','no_end','alt_end','alt_narr')
      THEN json_array(json_extract(data_json, '$.narrative_style'))
    ELSE json('[]')
  END,
  '$.narrative_pace',
  COALESCE(json_extract(data_json, '$.narrative_pace'), 
    CASE
      WHEN json_extract(data_json, '$.narrative_style') IN ('fast','slow')
        THEN json_array(json_extract(data_json, '$.narrative_style'))
      ELSE json('[]')
    END)
)
WHERE json_valid(data_json)
  AND json_type(data_json, '$.narrative_style') = 'text';

-- ============================================================
-- ADIM 2: narrative_style (array) → filtrele ve doğru alana dağıt
-- ["linear","suç komedisi anlatısı"] → ns=["linear"]
-- ["fast","slow","linear"] → ns=["linear"], np=["fast","slow"]
-- ["aksiyon komedisi"] → ns=[], np=[] (re-classify)
-- ============================================================
UPDATE movie_profiles
SET data_json = json_set(
  data_json,
  '$.narrative_style',
  COALESCE(
    (SELECT json_group_array(j.value) FROM json_each(json_extract(movie_profiles.data_json, '$.narrative_style')) j
      WHERE j.value IN ('multi','reverse','linear','flashback','end_first','mid_first','no_end','alt_end','alt_narr')),
    json('[]')
  ),
  '$.narrative_pace',
  COALESCE(
    (SELECT json_group_array(j.value) FROM json_each(json_extract(movie_profiles.data_json, '$.narrative_style')) j
      WHERE j.value IN ('fast','slow')),
    json('[]')
  )
)
WHERE json_valid(data_json)
  AND json_type(data_json, '$.narrative_style') = 'array';

-- ============================================================
-- ADIM 3: production_process (text) → array + doğru 3 alana dağıt
-- "indie"    → $.production_category = ["indie"]
-- "art"      → $.cinema_approach     = ["art"]
-- "handheld" → $.technical_style     = ["handheld"]
-- ============================================================
UPDATE movie_profiles
SET data_json = json_set(
  data_json,
  '$.production_category',
  COALESCE(json_extract(data_json, '$.production_category'),
    CASE
      WHEN json_extract(data_json, '$.production_process') IN ('amateur','indie','big','bmovie','studio','propaganda')
        THEN json_array(json_extract(data_json, '$.production_process'))
      ELSE json('[]')
    END),
  '$.cinema_approach',
  COALESCE(json_extract(data_json, '$.cinema_approach'),
    CASE
      WHEN json_extract(data_json, '$.production_process') IN ('art','avant','dogme')
        THEN json_array(json_extract(data_json, '$.production_process'))
      ELSE json('[]')
    END),
  '$.technical_style',
  COALESCE(json_extract(data_json, '$.technical_style'),
    CASE
      WHEN json_extract(data_json, '$.production_process') IN ('handheld','no_music','rare_music')
        THEN json_array(json_extract(data_json, '$.production_process'))
      ELSE json('[]')
    END)
)
WHERE json_valid(data_json)
  AND json_type(data_json, '$.production_process') = 'text';

-- ============================================================
-- ADIM 4: production_process (array) → filtrele ve 3 alana dağıt
-- ["bağımsız yapım"] → pc=[], ca=[], ts=[] (re-classify)
-- ["art","avant"] → ca=["art","avant"]
-- ============================================================
UPDATE movie_profiles
SET data_json = json_set(
  data_json,
  '$.production_category',
  COALESCE(
    (SELECT json_group_array(j.value) FROM json_each(json_extract(movie_profiles.data_json, '$.production_process')) j
      WHERE j.value IN ('amateur','indie','big','bmovie','studio','propaganda')),
    json('[]')
  ),
  '$.cinema_approach',
  COALESCE(
    (SELECT json_group_array(j.value) FROM json_each(json_extract(movie_profiles.data_json, '$.production_process')) j
      WHERE j.value IN ('art','avant','dogme')),
    json('[]')
  ),
  '$.technical_style',
  COALESCE(
    (SELECT json_group_array(j.value) FROM json_each(json_extract(movie_profiles.data_json, '$.production_process')) j
      WHERE j.value IN ('handheld','no_music','rare_music')),
    json('[]')
  )
)
WHERE json_valid(data_json)
  AND json_type(data_json, '$.production_process') = 'array';

-- ============================================================
-- ADIM 5: Eski alanı sil (artık production_category oldu)
-- ============================================================
UPDATE movie_profiles
SET data_json = json_remove(data_json, '$.production_process')
WHERE json_valid(data_json)
  AND json_extract(data_json, '$.production_process') IS NOT NULL;

-- ============================================================
-- ADIM 6: movie_profile_fields temizle
-- (yeni alanlar LLM çağrısında otomatik eklenecek)
-- ============================================================
DELETE FROM movie_profile_fields WHERE field IN ('narrative_style', 'production_process');

-- ============================================================
-- ADIM 7: app_config eski filter_info temizle
-- (yeni filter_info default'lar config.js'ten gelecek)
-- ============================================================
DELETE FROM app_config
WHERE key IN (
  'filter_info.narrative_style',
  'filter_info.production_process',
  'filter_info.narrative_pace',
  'filter_info.production_category',
  'filter_info.cinema_approach',
  'filter_info.technical_style'
);

-- ============================================================
-- ADIM 8: filter_verdicts eski signature temizle
-- (SCHEMA_VERSION 10→11 zaten invalidate edecek ama ekstra güvence)
-- ============================================================
DELETE FROM filter_verdicts
WHERE filter_signature LIKE '%"narrative_style"%'
   OR filter_signature LIKE '%"production_process"%';

-- ============================================================
-- DOĞRULAMA SORGULARI (sonuçları kontrol et)
-- ============================================================
-- Beklenen: still_text_ns=0, still_pp=0, nonempty_ns≥50, nonempty_np≥0
SELECT
  (SELECT COUNT(*) FROM movie_profiles WHERE json_valid(data_json) AND json_type(data_json, '$.narrative_style') = 'text') AS still_text_ns,
  (SELECT COUNT(*) FROM movie_profiles WHERE json_valid(data_json) AND json_extract(data_json, '$.production_process') IS NOT NULL) AS still_pp,
  (SELECT COUNT(*) FROM movie_profiles WHERE json_valid(data_json) AND json_type(data_json, '$.narrative_style') = 'array' AND json_array_length(json_extract(data_json, '$.narrative_style')) > 0) AS nonempty_ns,
  (SELECT COUNT(*) FROM movie_profiles WHERE json_valid(data_json) AND json_type(data_json, '$.narrative_pace') = 'array' AND json_array_length(json_extract(data_json, '$.narrative_pace')) > 0) AS nonempty_np,
  (SELECT COUNT(*) FROM movie_profiles WHERE json_valid(data_json) AND json_type(data_json, '$.production_category') = 'array' AND json_array_length(json_extract(data_json, '$.production_category')) > 0) AS nonempty_pc,
  (SELECT COUNT(*) FROM movie_profiles WHERE json_valid(data_json) AND json_type(data_json, '$.cinema_approach') = 'array' AND json_array_length(json_extract(data_json, '$.cinema_approach')) > 0) AS nonempty_ca,
  (SELECT COUNT(*) FROM movie_profiles WHERE json_valid(data_json) AND json_type(data_json, '$.technical_style') = 'array' AND json_array_length(json_extract(data_json, '$.technical_style')) > 0) AS nonempty_ts,
  (SELECT COUNT(*) FROM movie_profile_fields WHERE field IN ('narrative_style','production_process')) AS stale_field_rows,
  (SELECT COUNT(*) FROM app_config WHERE key LIKE 'filter_info.narrative%' OR key LIKE 'filter_info.production_process' OR key LIKE 'filter_info.production_category' OR key LIKE 'filter_info.cinema_approach' OR key LIKE 'filter_info.technical_style') AS stale_config;
