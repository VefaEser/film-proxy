MIGRATION 0044 + GÜNCELLENMİŞ TURSO ÇALIŞTIRICISI

Dosyalar:
- migrations/0044_rating_only.sql
- scripts/turso-migrate.mjs

ÖNEMLİ:
1) Canlı Turso'da 0044 zaten uygulanmıştır. Bu SQL dosyasını canlı veritabanında tekrar çalıştırmayın.
2) DOCX'te bulunan 0044 SQL gövdesi, yeni dosya adıyla arşivlenmiştir. Canlı migration kaydındaki SHA-256 ile birebir aynı değildir. Bu nedenle dosya, canlıda uygulanmış SQL'in byte-byte kopyası olarak sunulmamaktadır.
3) Yeni çalıştırıcı 0043 ve 0044 kayıtlarını mevcut schema_migrations tablosundan doğrular. 0043 için dosya adı ve checksum, 0044 için checksum doğrulanır. İkisi de yeniden çalıştırılmaz.
4) Otomatik çalışma kapsamı yalnızca 0045 ve sonrasıdır. 0001–0042 dosyaları okunmaz/çalıştırılmaz.
5) Varsayılan mod DRY-RUN'dır. Gerçek uygulama için APPLY_MIGRATIONS=true gerekir.
6) 0045+ dosyalarında sıra boşluğu, checksum uyuşmazlığı veya eksik baseline varsa işlem durur.

Yeni çalıştırıcıyı GitHub'da scripts/turso-migrate.mjs yoluna; SQL dosyasını migrations/0044_rating_only.sql yoluna koyun.
