INSERT OR IGNORE INTO app_config (key, value, updated_at) VALUES
('filter_info.color', 'Filmin rengi ve görsel stil seçenekleri.
[YZ bağlamı]
- black_white: Tamamen siyah beyaz.
- color: Tamamen renkli.
- mostly_color: Çoğunlukla renkli, birkaç siyah beyaz sahne.
- mostly_bw: Çoğunlukla siyah beyaz, birkaç renkli sahne.
- blue_filter: Baskın mavi tonlu renk filtresi.
- yellow_filter: Baskın sarı/amber tonlu renk filtresi.
- selective_color: Siyah beyaz ama bazı nesneler/alanlar renkli.
- colorized: Sonradan renklendirilmiş (eski siyah beyaz film).
- limited_palette: Sınırlı sayıda renk kullanılmış.
- sepia: Sepya tonu.
- mono_tint: Tek renk tonu (monokrom).
- bw_red_accent: Siyah beyaz + kırmızı vurgu.
- mixed_bw_color: Renkli ve siyah beyaz sahneler karışık.', strftime('%s','now'));

INSERT OR IGNORE INTO app_config (key, value, updated_at) VALUES
('filter_info.dialogue_density_subtitle', 'Diyalog yoğunluğu altyazı metninden hesaplanır: (Karakter sayısı / süre_dk) / 10 = yüzde. Örn: 100 dk filmde 70000 karakter = %70. Kaynak: OpenSubtitles.', strftime('%s','now')); 
