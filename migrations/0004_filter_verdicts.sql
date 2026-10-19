-- Stage 1 (semantik sınıflandırma) sonuçları — 24 saat TTL
CREATE TABLE IF NOT EXISTS filter_verdicts (
  movie_id TEXT NOT NULL,
  filter_signature TEXT NOT NULL,
  verdict TEXT NOT NULL,
  reason TEXT,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (movie_id, filter_signature)
);
CREATE INDEX IF NOT EXISTS idx_filter_verdicts_created ON filter_verdicts(created_at);

-- Stage 1 ve Stage 2 prompt şablonları
INSERT OR IGNORE INTO app_config (key, value, updated_at) VALUES
('prompt_template.stage1',
'Sen bir film sınıflandırma uzmanısın. Yalnızca verilen bilgilerden hareket et; emin değilsen "unknown" de, uydurma.

ARANAN FİLM:
{{FILTER_SENTENCE}}

FİLTRE BAĞLAMLARI:
{{FILTER_CONTEXT}}

Her film için tek soru: "Bu film ARANAN FİLM tanımına uyuyor mu?"

Filmler:
{{MOVIES}}

Yanıt YALNIZCA: [{"id": <film_id>, "match": "yes"|"no"|"unknown", "reason": "<max 12 kelime>"}]',
strftime('%s','now'));

INSERT OR IGNORE INTO app_config (key, value, updated_at) VALUES
('prompt_template.stage2',
'Sen bir film veri uzmanısın. Aşağıdaki filmler hakkında veri doldur.
Yalnızca kanıtlanabilir bilgiyi yaz; bilmiyorsan null bırak.

Filmler:
{{MOVIES}}

Doldurulacak alanlar:
{{RULES}}

Yanıt YALNIZCA: [{"id": <film_id>, "<alan>": <değer>, ...}]',
strftime('%s','now'));
