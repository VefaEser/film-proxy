-- DOSYA: migrations/0034_visual_profiles.sql
-- Amaç: Görsel analiz Aşama 1 için D1 tabloları.
-- ÖNEMLİ: Bu tablolar şu an sadece VERİ YAPISI hazırlığıdır.
-- Hiçbir Worker kodu bu tablolara otomatik yazmıyor (Faz 4'te frontend-only Canvas API ile başlayacak).
-- Backend'e geçilirse bu tablolar kullanılacak.
--
-- Kaynak yapısı:
--   visual_profiles: Film bazında görsel analiz özeti
--   visual_profile_fields: Alan bazında ölçüm (değer + güven + kaynak)
--   visual_samples: Kullanılan görsellerin kaynağı (poster, backdrop, film karesi)
--   visual_model_versions: Analiz yöntemi/model sürüm takibi
--   visual_analysis_jobs: Asenkron analiz kuyruğu
--
-- Kısıtlar (üçüncü taraf raporu madde 7):
--   - source_type: full_film | trailer | clip | promotional_image | poster | backdrop
--     (bu türler asla birbirine karıştırılmamalı)
--   - Sadece API anahtarı gerektirmeyen kaynaklar
--   - Poster analizi = film karelerinin analizi DEĞİL

-- Film bazında görsel profil özeti
CREATE TABLE IF NOT EXISTS visual_profiles (
  movie_id TEXT PRIMARY KEY,
  schema_version INTEGER NOT NULL DEFAULT 1,
  analysis_status TEXT NOT NULL DEFAULT 'pending' CHECK(analysis_status IN ('pending','partial','complete','failed')),
  updated_at INTEGER NOT NULL
);

-- Alan bazında görsel ölçüm sonuçları
CREATE TABLE IF NOT EXISTS visual_profile_fields (
  movie_id TEXT NOT NULL,
  field_name TEXT NOT NULL,
  value_json TEXT NOT NULL,
  confidence REAL,
  sample_count INTEGER DEFAULT 1,
  source_type TEXT NOT NULL CHECK(source_type IN ('poster','backdrop','promotional_image','trailer','clip','full_film')),
  model_name TEXT,
  model_version TEXT,
  analyzed_at INTEGER NOT NULL,
  PRIMARY KEY (movie_id, field_name)
);
CREATE INDEX IF NOT EXISTS idx_visual_fields_movie ON visual_profile_fields(movie_id);
CREATE INDEX IF NOT EXISTS idx_visual_fields_name ON visual_profile_fields(field_name);

-- Kullanılan görsel örnekler (kaynak + lisans takibi)
CREATE TABLE IF NOT EXISTS visual_samples (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  movie_id TEXT NOT NULL,
  source_type TEXT NOT NULL CHECK(source_type IN ('poster','backdrop','promotional_image','trailer','clip','full_film')),
  source_url TEXT NOT NULL,
  source_id TEXT,
  source_name TEXT,
  license TEXT,
  attribution TEXT,
  match_confidence REAL,
  image_hash TEXT,
  sample_timestamp REAL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_visual_samples_movie ON visual_samples(movie_id, source_type);
CREATE INDEX IF NOT EXISTS idx_visual_samples_hash ON visual_samples(image_hash);

-- Analiz yöntemi/model sürüm takibi
CREATE TABLE IF NOT EXISTS visual_model_versions (
  model_name TEXT NOT NULL,
  model_version TEXT NOT NULL,
  schema_version INTEGER NOT NULL,
  configuration_hash TEXT,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (model_name, model_version)
);

-- Asenkron analiz kuyruğu
CREATE TABLE IF NOT EXISTS visual_analysis_jobs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  movie_id TEXT NOT NULL,
  analysis_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued' CHECK(status IN ('queued','running','done','failed','skipped')),
  priority INTEGER DEFAULT 0,
  created_at INTEGER NOT NULL,
  started_at INTEGER,
  completed_at INTEGER,
  error_code TEXT,
  retry_count INTEGER DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_visual_jobs_status ON visual_analysis_jobs(status, priority);
CREATE INDEX IF NOT EXISTS idx_visual_jobs_movie ON visual_analysis_jobs(movie_id);

-- Analiz sürümü değişince yeniden analiz edilebilir; mevcut alanlar korunur.
-- Değer güncellenmediğinde analyzed_at değişmez (idempotent).
