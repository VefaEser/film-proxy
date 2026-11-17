-- DOSYA: migrations/0042_import_jobs.sql
-- Amaç: Admin HF CSV import işlerinin takibini tutar.
-- Her import işlemi bir 'job' oluşturur; chunk'lar geldikçe ilerleme
-- burada güncellenir. Admin paneli polling ile ilerlemeyi gösterir.
--
-- Model:
--   1) Admin 'start' → yeni job satırı (status='pending')
--   2) Colab/Python chunker CSV'yi parçalara böler, her parçayı
--      'chunk' endpoint'ine POST eder → completed_chunks artar
--   3) Chunker bitince 'finish' → status='completed'
--   4) Hata olursa status='failed', error_log doldurulur
--
-- Chunk boyutu önerisi: 5-10 MB / parça. 111 MB CSV → 12-22 chunk.

CREATE TABLE IF NOT EXISTS import_jobs (
  id TEXT PRIMARY KEY,
  admin_user_id INTEGER NOT NULL,
  source_dataset TEXT NOT NULL,
  source_revision TEXT,
  source_total_rows INTEGER,
  source_total_chunks INTEGER,
  completed_chunks INTEGER NOT NULL DEFAULT 0,
  inserted_rows INTEGER NOT NULL DEFAULT 0,
  updated_rows INTEGER NOT NULL DEFAULT 0,
  skipped_rows INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK(status IN ('pending','running','completed','failed','cancelled')),
  error_log TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  finished_at INTEGER
);

CREATE INDEX IF NOT EXISTS idx_import_jobs_status
  ON import_jobs(status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_import_jobs_admin
  ON import_jobs(admin_user_id, created_at DESC);
