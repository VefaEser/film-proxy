-- DOSYA: migrations/0041_global_movies.sql
-- Amaç: Admin panelinden HF CSV import edildiğinde (Antep CSV gibi büyük
-- kataloglar), filmlerin HAM verisini tutar. movie_profiles'tan bağımsızdır.
-- Bu tablodaki filmler kullanıcı tarafından aranabilir; AI analizi isteğe
-- bağlı (on-demand) yapılır. Your Rating sütunu BURAYA YAZILMAZ.
--
-- Antep CSV 24 sütun: Const, Your Rating, Date Rated, Title, Year, Release
-- Date, Directors, Genres, Runtime, Rating, Num Votes, Original Title, URL,
-- ... Ek sütunlar data_json._raw_csv altında saklanır.
--
-- Idempotency: (source_dataset, source_revision, source_row_hash) üçlüsü
-- aynı satırı tekrar import etmeyi engeller.

CREATE TABLE IF NOT EXISTS global_movies (
  movie_id TEXT PRIMARY KEY,
  imdb_id TEXT,
  tmdb_id INTEGER,
  title_original TEXT,
  title_tr TEXT,
  year INTEGER,
  runtime INTEGER,
  imdb_rating REAL,
  imdb_votes INTEGER,
  genres TEXT,
  directors TEXT,
  source_dataset TEXT NOT NULL,
  source_revision TEXT,
  source_row_hash TEXT NOT NULL,
  data_json TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_global_movies_imdb
  ON global_movies(imdb_id)
  WHERE imdb_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_global_movies_tmdb
  ON global_movies(tmdb_id)
  WHERE tmdb_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_global_movies_year
  ON global_movies(year);

CREATE INDEX IF NOT EXISTS idx_global_movies_source
  ON global_movies(source_dataset, source_revision);
