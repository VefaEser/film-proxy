-- LLM çağrı telemetrisi
CREATE TABLE IF NOT EXISTS llm_calls (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts INTEGER NOT NULL,
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  key_index INTEGER NOT NULL,
  ok INTEGER NOT NULL,
  latency_ms INTEGER,
  error_snippet TEXT
);
CREATE INDEX IF NOT EXISTS idx_llm_calls_ts ON llm_calls(ts);
CREATE INDEX IF NOT EXISTS idx_llm_calls_provider ON llm_calls(provider, model);

-- Global ölü anahtarlar (429 sonrası geçici olarak devre dışı)
CREATE TABLE IF NOT EXISTS dead_keys (
  provider TEXT NOT NULL,
  key_index INTEGER NOT NULL,
  until_ts INTEGER NOT NULL,
  reason TEXT,
  PRIMARY KEY (provider, key_index)
);
CREATE INDEX IF NOT EXISTS idx_dead_keys_until ON dead_keys(until_ts);

-- Admin tarafından düzenlenebilir yapılandırma
CREATE TABLE IF NOT EXISTS app_config (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);

-- Başlangıç: prompt şablonu
INSERT OR IGNORE INTO app_config (key, value, updated_at) VALUES
('prompt_template',
'Sen bir film araştırma asistanısın. Yalnızca sağlanan kaynaklardan hareket et; kanıt yoksa null bırak, uydurma.
{{SEARCH_NOTE}}
Kullanıcı filtreleri: {{FILTERS}}
İstenen alanlar için geçerli değerler:
{{RULES}}
Sayısal alanlar 0-100 veya null. location_count integer. family_content nesne. related_films string[].
Yanıt YALNIZCA: [{"id": <id>, "<alan>": <değer>}, ...]
Filmler: {{MOVIES}}',
strftime('%s','now'));

-- Başlangıç: filtre açıklamaları (kategori)
INSERT OR IGNORE INTO app_config (key, value, updated_at) VALUES
('filter_info.genres', 'Film türü. Include seçilenlerden en az birini içermeli, exclude seçilenleri içermemelidir.', strftime('%s','now')),
('filter_info.original_language', 'Filmin özgün dili. ISO 639-1 kodu ile eşleştirilir (ör. en, tr, ja).', strftime('%s','now')),
('filter_info.production_countries', 'Yapım ülkesi. ISO 3166-1 alpha-2 kodu ile eşleştirilir (ör. US, TR, FR).', strftime('%s','now')),
('filter_info.story_locations', 'Hikâyenin geçtiği yer. Gemini tarafından etiket olarak doldurulur.', strftime('%s','now')),
('filter_info.filming_locations', 'Filmin çekildiği yer. Wikidata''dan çekilir; veri yoksa "bilinmiyor" olarak işaretlenir.', strftime('%s','now')),
('filter_info.story_period', 'Hikâyenin geçtiği dönem (ör. 2. Dünya Savaşı, 19. yüzyıl).', strftime('%s','now')),
('filter_info.story_geography', 'Coğrafya (şehir, köy, dağlık, çöl vb.).', strftime('%s','now')),
('filter_info.season', 'Hikâyenin geçtiği mevsim: winter, summer, spring, autumn.', strftime('%s','now')),
('filter_info.character_traits', 'Karakter niteliği (yaş, cinsiyet, engel durumu vb.).', strftime('%s','now')),
('filter_info.aspect_ratio', 'En-boy oranı (1:1, 4:3, 16:9, 21:9 vb.).', strftime('%s','now')),
('filter_info.narrative_style', 'Anlatım tarzı (doğrusal, geri dönüşlü, çoklu bakış açısı vb.).', strftime('%s','now')),
('filter_info.production_process', 'Çekim süreci (amatör, indie, stüdyo, sanat filmi vb.).', strftime('%s','now')),
('filter_info.sound', 'Ses özelliği (yoğun müzik, sessiz, iç ses, dış ses vb.).', strftime('%s','now')),
('filter_info.reality', 'Hikâyenin gerçekliği (gerçek olay, kurgusal, ütopik vb.).', strftime('%s','now')),
('filter_info.story_dimensions', 'Hikâye boyutları (devam filmi, dizi bağlantısı, versiyon vb.).', strftime('%s','now')),
('filter_info.sex_details', 'Cinsel içerik ayrıntısı. Yalnızca sex_nudity yoğunluğu "none" değilse etkindir.', strftime('%s','now')),
('filter_info.family_content', 'Aile rehberi. Her içerik türü için yoğunluk (none/few/side/main) ve yaklaşım (bad/neutral/legit) seçilir.', strftime('%s','now')),
('filter_info.characterDensity', 'Ana / yan / figüran karakter sayısı aralığı. Gemini''nın family_content.main_characters, supporting_characters, extras alanlarıyla eşleşir.', strftime('%s','now')),
('filter_info.nightRatio', 'Gece/gündüz dengesi. Slider yüzdesi "en az bu kadar gece" anlamına gelir.', strftime('%s','now')),
('filter_info.indoorRatio', 'İç/dış mekân oranı. Slider "en az bu kadar iç mekân" demektir.', strftime('%s','now')),
('filter_info.locationCount', 'Tek/çoklu mekân. Slider "en az bu kadar mekân" eşiğidir.', strftime('%s','now')),
('filter_info.dialogueDensity', 'Diyalog yoğunluğu. Slider "en az bu kadar konuşma" demektir.', strftime('%s','now')),
('filter_info.colorRatio', 'Renk/S&B. Slider "en az bu kadar renkli" eşiği.', strftime('%s','now')),
('filter_info.imdbMin', 'IMDb minimum puan. Bilinmiyorsa film "elendi" sayılır, yani dışlanır.', strftime('%s','now')),
('filter_info.imdbVotesMin', 'IMDb minimum oy sayısı. Bilinmiyorsa film elenir.', strftime('%s','now')),
('filter_info.tmdbMin', 'TMDB minimum puan. Bilinmiyorsa film elenir.', strftime('%s','now')),
('filter_info.runtimeMin', 'Minimum film süresi (dakika). Bilinmiyorsa "unknown" olarak işaretlenir, elenmez.', strftime('%s','now')),
('filter_info.yearMin', 'Minimum film yılı. Bilinmiyorsa film elenir.', strftime('%s','now'));
