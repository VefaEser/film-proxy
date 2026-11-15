-- DOSYA: migrations/0040_taxonomy_v1.sql
-- Faz A: Taksonomi sürüm kaydı.
-- ÖNEMLİ: Sözlüğün 220 kaydı D1'e SEED EDİLMEZ. Sözlük JS sabitlerinde
-- (taxonomy.config.js backend + app-taxonomy.js frontend) tutulur.
-- D1'de yalnızca sürüm bilgisi saklanır; böylece ileride sürüm değişikliği
-- gerektiğinde cache invalidation stratejisi uygulanabilir.

INSERT OR IGNORE INTO app_config (key, value, updated_at) VALUES
('taxonomy.version', '1.0.0', strftime('%s','now'));

-- Doğrulama (D1 Console'da kontrol edilebilir)
SELECT
  (SELECT value FROM app_config WHERE key = 'taxonomy.version') AS taxonomy_version,
  (SELECT COUNT(*) FROM app_config WHERE key = 'taxonomy.version') AS record_count;
