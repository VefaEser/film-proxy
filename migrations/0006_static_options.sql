-- Sabit seçenekler: yaş sınırı, yapım şirketi, büyük ödüller
CREATE TABLE IF NOT EXISTS static_options (
  field TEXT NOT NULL,
  id TEXT NOT NULL,
  label TEXT NOT NULL,
  extra_json TEXT,
  sort_order INTEGER DEFAULT 0,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (field, id)
);
CREATE INDEX IF NOT EXISTS idx_static_options_field ON static_options(field);

-- Yaş sınırı (6)
INSERT OR IGNORE INTO static_options (field, id, label, sort_order, updated_at) VALUES
('rated', 'G', 'G — Genel izleyici', 1, strftime('%s','now')),
('rated', 'PG', 'PG — Ebeveyn gözetimi', 2, strftime('%s','now')),
('rated', 'PG-13', 'PG-13 — 13 yaş altı ebeveyn', 3, strftime('%s','now')),
('rated', 'R', 'R — 17 yaş altı ebeveyn', 4, strftime('%s','now')),
('rated', 'NC-17', 'NC-17 — 17 yaş ve üstü', 5, strftime('%s','now')),
('rated', 'NR', 'NR — Sınıflandırılmamış', 6, strftime('%s','now'));

-- Yapım şirketleri (TMDB company ID'leri, top-15)
INSERT OR IGNORE INTO static_options (field, id, label, sort_order, updated_at) VALUES
('company', '420', 'Marvel Studios', 1, strftime('%s','now')),
('company', '174', 'Warner Bros. Pictures', 2, strftime('%s','now')),
('company', '33', 'Universal Pictures', 3, strftime('%s','now')),
('company', '4', 'Paramount Pictures', 4, strftime('%s','now')),
('company', '34', 'Sony Pictures', 5, strftime('%s','now')),
('company', '2', 'Walt Disney Pictures', 6, strftime('%s','now')),
('company', '25', '20th Century Studios', 7, strftime('%s','now')),
('company', '1632', 'Lionsgate', 8, strftime('%s','now')),
('company', '41077', 'A24', 9, strftime('%s','now')),
('company', '178464', 'Netflix', 10, strftime('%s','now')),
('company', '20580', 'Amazon Studios', 11, strftime('%s','now')),
('company', '3268', 'HBO', 12, strftime('%s','now')),
('company', '10342', 'Studio Ghibli', 13, strftime('%s','now')),
('company', '3', 'Pixar', 14, strftime('%s','now')),
('company', '521', 'DreamWorks Pictures', 15, strftime('%s','now'));

-- Büyük ödüller (Wikidata Q-ID'leri)
INSERT OR IGNORE INTO static_options (field, id, label, sort_order, updated_at) VALUES
('award', 'Q102427', 'Oscar — En İyi Film', 1, strftime('%s','now')),
('award', 'Q179808', 'Cannes — Palme d''Or', 2, strftime('%s','now')),
('award', 'Q1011547', 'Altın Küre — En İyi Drama', 3, strftime('%s','now')),
('award', 'Q747798', 'BAFTA — En İyi Film', 4, strftime('%s','now')),
('award', 'Q156749', 'Berlin — Altın Ayı', 5, strftime('%s','now')),
('award', 'Q209459', 'Venedik — Altın Aslan', 6, strftime('%s','now'));
