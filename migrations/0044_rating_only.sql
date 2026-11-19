-- DOSYA: migrations/0044_rating_only.sql
-- user_movies.list_type CHECK kısıtlaması rating_only'yi desteklemiyordu.
-- Yeni tablo oluşturup veriyi taşıyoruz (SQLite CHECK değiştirilemez).
CREATE TABLE IF NOT EXISTS user_movies_new (
user_id INTEGER NOT NULL,
list_type TEXT NOT NULL CHECK(list_type IN ('watched','want','wont','rating_only')),
movie_id TEXT NOT NULL,
imdb_id TEXT,
tmdb_id INTEGER,
title_original TEXT,
title_tr TEXT,
year INTEGER,
imdb_rating REAL,
imdb_votes INTEGER,
runtime INTEGER,
genres TEXT,
directors TEXT,
user_rating REAL,
url TEXT,
source TEXT NOT NULL DEFAULT 'manual',
source_meta_json TEXT,
created_at INTEGER NOT NULL,
updated_at INTEGER NOT NULL,
PRIMARY KEY (user_id, list_type, movie_id)
);
INSERT OR IGNORE INTO user_movies_new SELECT user_id, list_type, movie_id, imdb_id, tmdb_id, title_original, title_tr, year, imdb_rating, imdb_votes, runtime, genres, directors, user_rating, url, source, source_meta_json, created_at, updated_at FROM user_movies;
DROP TABLE user_movies;
ALTER TABLE user_movies_new RENAME TO user_movies;
CREATE INDEX IF NOT EXISTS idx_user_movies_user ON user_movies(user_id, list_type);
CREATE INDEX IF NOT EXISTS idx_user_movies_movie ON user_movies(movie_id);
CREATE INDEX IF NOT EXISTS idx_user_movies_imdb ON user_movies(imdb_id);
CREATE INDEX IF NOT EXISTS idx_user_movies_tmdb ON user_movies(tmdb_id);
CREATE INDEX IF NOT EXISTS idx_user_movies_user_rating ON user_movies(user_rating);
CREATE INDEX IF NOT EXISTS idx_user_movies_movie_id ON user_movies(movie_id);
CREATE INDEX IF NOT EXISTS idx_user_movies_user_rating_tmdb ON user_movies(tmdb_id, user_rating);
CREATE INDEX IF NOT EXISTS idx_user_movies_user_rating_imdb ON user_movies(imdb_id, user_rating);
