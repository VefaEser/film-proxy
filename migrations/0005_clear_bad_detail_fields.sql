-- Eski sürümlerden kalan bozuk writers/cast/director/producers alanlarını
-- temizle. Bir sonraki refresh'te TMDB'den doğru formatta yeniden çekilir.
UPDATE movie_profiles
SET data_json = json_remove(data_json, '$.writers', '$.cast', '$.director', '$.producers', '$.omdb_directors')
WHERE json_valid(data_json);
