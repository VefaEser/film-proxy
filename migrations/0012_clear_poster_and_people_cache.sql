-- Fix öncesi yazılmış yanlış original_poster_path değerlerini temizle
-- (bir sonraki aramada enrichClassic yeni mantıkla yeniden dolduracak)
UPDATE movie_profiles
SET data_json = json_remove(data_json, '$.original_poster_path')
WHERE json_valid(data_json);

DELETE FROM movie_profile_fields WHERE field = 'original_poster_path';

-- Senarist/oyuncu/yapımcı/yönetmen alanlarındaki bozuk kayıtları temizle
-- (Q-ID, person/123, [object Object], JSON string vb.)
UPDATE movie_profiles
SET data_json = json_remove(data_json,
  '$.writers', '$.writers_ids',
  '$.cast', '$.cast_ids',
  '$.director', '$.director_ids',
  '$.producers',
  '$.actors', '$.omdb_directors')
WHERE json_valid(data_json);

DELETE FROM movie_profile_fields
WHERE field IN ('writers','writers_ids','cast','cast_ids','director','director_ids','producers','actors','omdb_directors');
