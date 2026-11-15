-- DOSYA: migrations/0037_llm_telemetry.sql
-- Faz 8 Phase B: LLM telemetry + güven düzeyi + RPM tracker (infra)
--
-- 1) llm_calls: token, fallback, cache, http_status, retry_count
-- 2) movie_profile_fields: confidence (0.0-1.0, NULL = bilinmiyor)
-- 3) llm_rpm_tracker: D1 üzerinden global RPM sayacı (monitoring; enforcement sonraki fazda)
--
-- NOT: Bu migration sadece şema değişikliği yapar; mevcut veriler korunur.

-- === 1) llm_calls genişletme ===
ALTER TABLE llm_calls ADD COLUMN input_tokens INTEGER;
ALTER TABLE llm_calls ADD COLUMN output_tokens INTEGER;
ALTER TABLE llm_calls ADD COLUMN was_fallback INTEGER DEFAULT 0;
ALTER TABLE llm_calls ADD COLUMN from_cache INTEGER DEFAULT 0;
ALTER TABLE llm_calls ADD COLUMN http_status INTEGER;
ALTER TABLE llm_calls ADD COLUMN retry_count INTEGER DEFAULT 0;

-- === 2) movie_profile_fields.confidence ===
ALTER TABLE movie_profile_fields ADD COLUMN confidence REAL;

-- === 3) llm_rpm_tracker (monitoring için; enforcement sonraki faz) ===
CREATE TABLE IF NOT EXISTS llm_rpm_tracker (
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  key_index INTEGER NOT NULL,
  window_start INTEGER NOT NULL,
  call_count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (provider, model, key_index, window_start)
);
CREATE INDEX IF NOT EXISTS idx_llm_rpm_window ON llm_rpm_tracker(window_start);

-- Doğrulama (D1 Console'da kontrol)
SELECT
  (SELECT COUNT(*) FROM pragma_table_info('llm_calls')) AS llm_calls_columns,
  (SELECT COUNT(*) FROM pragma_table_info('movie_profile_fields')) AS mpf_columns,
  (SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='llm_rpm_tracker') AS rpm_tracker_exists;
