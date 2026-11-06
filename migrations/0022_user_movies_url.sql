-- DOSYA: migrations/0022_user_movies_url.sql
-- CSV'den gelen URL bilgisini saklamak için user_movies tablosuna url sütunu ekle.
-- URL, IMDb puanına tıklanınca yönlendirme için kullanılır.
ALTER TABLE user_movies ADD COLUMN url TEXT;
