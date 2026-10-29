-- location_count yeni alan. Aslında bu migration gerekli değil çünkü alan
-- yeni eklendi ve eski profillerde hiç bulunamaz. Yalnızca ileride manuel
-- müdahale ile bozulmuş değer kalıntılarını temizlemek için idempotent
-- güvenlik ağı olarak eklenmiştir.
UPDATE movie_profiles
SET data_json = json_remove(data_json, '$.location_count')
WHERE json_valid(data_json) AND (
  json_extract(data_json, '$.location_count') IS NOT NULL
  AND (json_type(data_json, '$.location_count') != 'integer'
       OR CAST(json_extract(data_json, '$.location_count') AS INTEGER) < 1)
);

DELETE FROM movie_profile_fields WHERE field = 'location_count' AND source = 'unknown';
