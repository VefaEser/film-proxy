-- dead_keys tablosuna model kolonu ekle ve PK'yı (provider, key_index, model) yap.
-- Böylece bir Gemini anahtarı 3.8 Flash kotasında ölürken 3.1 Lite kotası hâlâ kullanılabilir.
CREATE TABLE dead_keys_new (
  provider TEXT NOT NULL,
  key_index INTEGER NOT NULL,
  model TEXT NOT NULL DEFAULT '',
  until_ts INTEGER NOT NULL,
  reason TEXT,
  PRIMARY KEY (provider, key_index, model)
);

INSERT INTO dead_keys_new (provider, key_index, model, until_ts, reason)
  SELECT provider, key_index, '', until_ts, reason FROM dead_keys;

DROP TABLE dead_keys;
ALTER TABLE dead_keys_new RENAME TO dead_keys;
CREATE INDEX IF NOT EXISTS idx_dead_keys_until ON dead_keys(until_ts);
