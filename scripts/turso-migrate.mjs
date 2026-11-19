import { createClient } from "@libsql/client";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";

const url = process.env.TURSO_DATABASE_URL;
const authToken = process.env.TURSO_AUTH_TOKEN;
const apply = process.env.APPLY_MIGRATIONS === "true";

if (!url || !authToken) {
  throw new Error("TURSO_DATABASE_URL veya TURSO_AUTH_TOKEN eksik.");
}

// Açık izin listesi.
// Eski 42 migration ve 0044 burada bulunmuyor.
const ALLOWED = [
  {
    version: "0043",
    file: "migrations/0043_admin_tasks.sql"
  }
];

const client = createClient({ url, authToken });

function hash(content) {
  return createHash("sha256")
    .update(content, "utf8")
    .digest("hex");
}

function splitSql(sql) {
  return sql
    .split(";")
    .map(x => x.trim())
    .filter(Boolean);
}

async function tableExists(name) {
  const result = await client.execute({
    sql: `
      SELECT name
      FROM sqlite_master
      WHERE type = 'table' AND name = ?
    `,
    args: [name]
  });

  return result.rows.length > 0;
}

async function validateAdminTasks() {
  if (!(await tableExists("admin_tasks"))) {
    console.log("admin_tasks tablosu henüz bulunmuyor.");
    return;
  }

  const result = await client.execute(
    "PRAGMA table_info(admin_tasks)"
  );

  const actual = new Set(result.rows.map(row => row.name));

  const required = [
    "id",
    "admin_user_id",
    "task_type",
    "target",
    "list_type",
    "status",
    "total",
    "done",
    "failed",
    "result_json",
    "error_log",
    "created_at",
    "updated_at",
    "finished_at"
  ];

  const missing = required.filter(name => !actual.has(name));

  if (missing.length) {
    throw new Error(
      "Mevcut admin_tasks tablosu uyumsuz. Eksik sütunlar: " +
      missing.join(", ") +
      ". Otomatik değişiklik yapılmadı."
    );
  }

  console.log("Mevcut admin_tasks sütun kontrolü başarılı.");
}

async function main() {
  console.log("======================================");
  console.log("TURSO MIGRATION KONTROLÜ");
  console.log("Mod:", apply ? "APPLY" : "DRY-RUN");
  console.log("======================================");

  // İzin listesi dışındaki dosyalar asla okunmaz.
  for (const item of ALLOWED) {
    if (item.version !== "0043") {
      throw new Error("İzin verilmeyen migration: " + item.version);
    }

    if (item.file !== "migrations/0043_admin_tasks.sql") {
      throw new Error("Beklenmeyen migration dosya yolu.");
    }
  }

  const migration = ALLOWED[0];
  const sql = await readFile(migration.file, "utf8");
  const checksum = hash(sql);
  const statements = splitSql(sql);

  if (!statements.length) {
    throw new Error("Migration dosyası boş.");
  }

  await validateAdminTasks();

  const registryExists = await tableExists("schema_migrations");

  if (!registryExists) {
    console.log("schema_migrations henüz oluşturulmamış.");
  }

  let existing = null;

  if (registryExists) {
    const result = await client.execute({
      sql: `
        SELECT version, filename, checksum
        FROM schema_migrations
        WHERE version = ?
      `,
      args: [migration.version]
    });

    existing = result.rows[0] || null;
  }

  if (existing) {
    if (
      existing.filename !== migration.file ||
      existing.checksum !== checksum
    ) {
      throw new Error(
        "CHECKSUM UYUŞMAZLIĞI: 0043 dosyası uygulanmış kayıttan farklı. " +
        "İşlem durduruldu."
      );
    }

    console.log("0043 zaten uygulanmış ve checksum eşleşiyor.");
    console.log("İşlem gerekmiyor.");
    return;
  }

  console.log("Migration:", migration.file);
  console.log("SHA-256:", checksum);
  console.log("SQL komut sayısı:", statements.length);

  if (!apply) {
    console.log("--------------------------------------");
    console.log("DRY-RUN TAMAMLANDI.");
    console.log("Hiçbir tablo oluşturulmadı.");
    console.log("Hiçbir migration uygulanmadı.");
    console.log("0043 uygulanmaya hazır görünüyor.");
    console.log("0001–0042 çalıştırılmadı.");
    return;
  }

  // Kayıt tablosu yalnızca açık APPLY onayıyla oluşturulur.
  await client.execute(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version TEXT PRIMARY KEY,
      filename TEXT NOT NULL,
      checksum TEXT NOT NULL,
      applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Başka bir işlem arada 0043 kaydetmiş olabilir.
  const recheck = await client.execute({
    sql: `
      SELECT filename, checksum
      FROM schema_migrations
      WHERE version = ?
    `,
    args: [migration.version]
  });

  if (recheck.rows.length) {
    const row = recheck.rows[0];

    if (
      row.filename !== migration.file ||
      row.checksum !== checksum
    ) {
      throw new Error("0043 checksum çakışması. İşlem durduruldu.");
    }

    console.log("0043 başka bir işlem tarafından kaydedilmiş; atlandı.");
    return;
  }

  const batch = statements.map(statement => ({
    sql: statement,
    args: []
  }));

  // Migration ve kayıt aynı batch içinde yürütülür.
  batch.push({
    sql: `
      INSERT INTO schema_migrations
        (version, filename, checksum)
      VALUES (?, ?, ?)
    `,
    args: [migration.version, migration.file, checksum]
  });

  await client.batch(batch, "write");

  console.log("0043 başarıyla uygulandı ve kaydedildi.");

  await validateAdminTasks();

  console.log("Migration işlemi tamamlandı.");
}

try {
  await main();
} finally {
  client.close();
}
