-- DOSYA: migrations/0027_filter_info_rename.sql
-- Filtre adları Türkçe etiketleriyle birebir uyumlu hale getirildi.
-- production_process → "Filmin sanatsal veya sektörel konumu"
-- story_dimensions   → "Filmin diğer filmlerle ilgisi"
-- award seçenekleri genişletildi; original_language bağlamı güncellendi.

INSERT OR REPLACE INTO app_config (key, value, updated_at) VALUES (
  'filter_info.production_process',
  '[YZ bağlamı]
FİLTRE ADI: Filmin sanatsal veya sektörel konumu. Filmin yapım biçimini, bütçesini ve sektördeki yerini sınıflandırır.
- amateur: Amatör yapım, çok düşük bütçe, öğrenci/amatör ekip.
- indie: Bağımsız film, stüdyo dışı, küçük bütçeli.
- art: Sanat filmi, deneysel anlatım, festival odaklı.
- big: Büyük prodüksiyon, 100M$+ bütçe, geniş ekip.
- bmovie: Düşük bütçeli tür sineması (B movie).
- avant: Avangart film, deneysel/anti-anlatı.
- studio: Klasik stüdyo filmi (Hollywood/benzeri).
- no_music: Müziksiz film.
- rare_music: Nadir/az müzikli film.
- handheld: El kamerası/hareketli kamera baskın.
- propaganda: İdeolojik/propaganda amaçlı.
- dogme: Dogme 95 manifestosuna uygun.',
  strftime('%s','now')
);

INSERT OR REPLACE INTO app_config (key, value, updated_at) VALUES (
  'filter_info.story_dimensions',
  '[YZ bağlamı]
FİLTRE ADI: Filmin diğer filmlerle ilgisi. Filmin başka bir filme/diziye/senaryoya olan bağlantısını sınıflandırır.
- has_sequel: Devam filmi var.
- is_sequel: Kendisi devam filmi.
- series_sequel: Bir dizideki hikayenin devamı.
- series_prequel: Bir dizideki hikayenin öncesi.
- series_spinoff: Bir dizideki karakterlerin farklı bir hikayesi.
- concept: Konsept filmi.
- similar_script_version: Aynı hikayeyi benzer bir senaryoyla anlatan başka bir film var.
- same_plot_diff_script: Aynı hikayeyi farklı bir senaryoyla anlatan başka bir film var.
- same_plot_diff_angle: Aynı hikayenin farklı bir yönünü anlatan başka bir film var.',
  strftime('%s','now')
);

INSERT OR REPLACE INTO app_config (key, value, updated_at) VALUES (
  'filter_info.original_language',
  '[YZ bağlamı]
FİLTRE ADI: Film dili. Kullanıcı "Sadece ana dili dikkate al" seçeneğini işaretlerse yalnızca original_language dikkate alınır; aksi halde spoken_languages da eşleştirilir.',
  strftime('%s','now')
);

INSERT OR REPLACE INTO app_config (key, value, updated_at) VALUES (
  'filter_info.award',
  'Büyük ödüller (Wikidata P166 kazanılan, P1411 aday gösterilen). Seçenekler: Oscar (En İyi Film), Cannes Palme d''Or, BAFTA, Altın Küre, Berlin Altın Ayı, Venedik Altın Aslan, Sundance Büyük Jüri Ödülü, Toronto People''s Choice, Cannes Grand Prix, Cannes En İyi Yönetmen, Cannes En İyi Kadın Oyuncu, Cannes En İyi Erkek Oyuncu, Berlin Gümüş Ayı, Venedik Gümüş Aslan, Avrupa Film Ödülü, César, Goya, David di Donatello, Altın Portakal, Siyad, Tokyo, Locarno Altın Leopar, Karlovy Vary Kristal Küre, San Sebastián Altın Kabuk.',
  strftime('%s','now')
);

-- === Ödül seçenekleri genişletildi (Wikidata Q-ID) ===
INSERT OR IGNORE INTO static_options (field, id, label, sort_order, updated_at) VALUES
('award', 'Q102427', 'Oscar — En İyi Film', 1, strftime('%s','now')),
('award', 'Q179808', 'Cannes — Palme d''Or', 2, strftime('%s','now')),
('award', 'Q747798', 'BAFTA — En İyi Film', 3, strftime('%s','now')),
('award', 'Q1011547', 'Altın Küre — En İyi Drama', 4, strftime('%s','now')),
('award', 'Q156749', 'Berlin — Altın Ayı', 5, strftime('%s','now')),
('award', 'Q209459', 'Venedik — Altın Aslan', 6, strftime('%s','now')),
('award', 'Q1431297', 'Sundance — Büyük Jüri Ödülü', 7, strftime('%s','now')),
('award', 'Q1780339', 'Toronto — People''s Choice', 8, strftime('%s','now')),
('award', 'Q1166177', 'Cannes — Grand Prix', 9, strftime('%s','now')),
('award', 'Q1979944', 'Cannes — En İyi Yönetmen', 10, strftime('%s','now')),
('award', 'Q1935414', 'Cannes — En İyi Kadın Oyuncu', 11, strftime('%s','now')),
('award', 'Q1935410', 'Cannes — En İyi Erkek Oyuncu', 12, strftime('%s','now')),
('award', 'Q1568169', 'Berlin — Gümüş Ayı', 13, strftime('%s','now')),
('award', 'Q2096828', 'Venedik — Gümüş Aslan', 14, strftime('%s','now')),
('award', 'Q777594', 'Avrupa Film Ödülü', 15, strftime('%s','now')),
('award', 'Q749174', 'César Ödülü', 16, strftime('%s','now')),
('award', 'Q750343', 'Goya Ödülü', 17, strftime('%s','now')),
('award', 'Q1196191', 'David di Donatello', 18, strftime('%s','now')),
('award', 'Q102427', 'Altın Portakal', 19, strftime('%s','now')),
('award', 'Q6014384', 'Siyad Ödülü', 20, strftime('%s','now')),
('award', 'Q643413', 'Tokyo — En İyi Film', 21, strftime('%s','now')),
('award', 'Q1957405', 'Locarno — Altın Leopar', 22, strftime('%s','now')),
('award', 'Q749416', 'Karlovy Vary — Kristal Küre', 23, strftime('%s','now')),
('award', 'Q977412', 'San Sebastián — Altın Kabuk', 24, strftime('%s','now'));
