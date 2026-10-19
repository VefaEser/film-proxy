ALTER TABLE movie_profile_fields DROP COLUMN value_json;

DROP INDEX IF EXISTS idx_movie_profile_fields_fetched;

CREATE INDEX IF NOT EXISTS idx_movie_profile_fields_age
  ON movie_profile_fields(fetched_at);
