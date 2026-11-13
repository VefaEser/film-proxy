-- DOSYA: migrations/0030_clean_character_traits.sql
-- Eski serbest metin (İngilizce/Türkçe) character_traits ve story_dimensions değerlerini temizle.
-- Bir sonraki aramada LLM slug listesiyle yeniden dolduracak.

UPDATE movie_profiles
SET data_json = json_remove(data_json, '$.character_traits', '$.story_dimensions')
WHERE json_valid(data_json)
  AND (json_extract(data_json, '$.character_traits') IS NOT NULL
       OR json_extract(data_json, '$.story_dimensions') IS NOT NULL);

DELETE FROM movie_profile_fields WHERE field IN ('character_traits', 'story_dimensions');
