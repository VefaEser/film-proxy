-- DOSYA: migrations/0036_add_altin_portakal_award.sql
-- Sorun: 0027 ve 0029 migration'larında Q102427 (Oscar — En İyi Film) ile çakıştığı için
-- Altın Portakal hiç DB'ye girmemişti (sort_order 19 eksik).
-- Çözüm: Doğru Q-ID ile ekle — Q3070476 = International Antalya Film Festival
-- (Festivalde herhangi bir ödül alan filmler bu filtreden geçer.)
--
-- Not: Bu Q-ID Wikidata'da doğrulanmıştır ve "award received" (P166) özelliğinde kullanılıyor.

INSERT OR IGNORE INTO static_options (field, id, label, sort_order, updated_at) VALUES
('award', 'Q3070476', 'Altın Portakal (Antalya Film Festivali)', 19, strftime('%s','now'));

-- Doğrulama: 44 ödül olmalı (43 mevcut + 1 yeni)
SELECT COUNT(*) AS award_count FROM static_options WHERE field = 'award';
SELECT id, label, sort_order FROM static_options WHERE field = 'award' AND sort_order = 19;
