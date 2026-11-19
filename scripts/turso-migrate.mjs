
import { createClient } from "@libsql/client";
import { readFile, readdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import { join } from "node:path";

const url = process.env.TURSO_DATABASE_URL;
const authToken = process.env.TURSO_AUTH_TOKEN;
const apply = process.env.APPLY_MIGRATIONS === "true";
const MIGRATIONS_DIR = "migrations";

const BASELINE = [
  {
    version: "0043",
    filename: "migrations/0043_admin_tasks.sql",
    checksum: "ba0674a65fbcf8808d4b04586e2f4a129446daa65ccc779b23a994506a612cc1"
  },
  {
    version: "0044",
    filename: "migrations/0044_rating_only.sql",
    checksum: "7570220eca55fbe735cabea064282a35e2b076535a7e9177416c6fe680276f19"
  }
];

if (!url || !authToken) {
  throw new Error("TURSO_DATABASE_URL veya TURSO_AUTH_TOKEN eksik.");
}

const client = createClient({ url, authToken });

const hash = value =>
  createHash("sha256").update(value, "utf8").digest("hex");

function splitSql(sql) {
  const out = [];
  let start = 0;
  let quote = null;
  let lineComment = false;
  let blockComment = false;

  for (let i = 0; i < sql.length; i++) {
    const c = sql[i];
    const n = sql[i + 1];

    if (lineComment) {
      if (c === "\n") lineComment = false;
      continue;
    }

    if (blockComment) {
      if (c === "*" && n === "/") {
        blockComment = false;
        i++;
      }
      continue;
    }

    if (quote) {
      if (c === quote) {
        if (n === quote) {
          i++;
          continue;
        }
        quote = null;
      } else if (c === "\\" && quote === "'") {
        i++;
      }
      continue;
    }

    if (c === "-" && n === "-") {
      lineComment = true;
      i++;
      continue;
    }

    if (c === "/" && n === "*") {
      blockComment = true;
      i++;
      continue;
    }

    if (c === "'" || c === '"' || c === "`") {
      quote = c;
      continue;
    }

    if (c === ";") {
      const part = sql.slice(start, i).trim();
      if (part) out.push(part);
      start = i + 1;
    }
  }

  if (quote || blockComment) {
    throw new Error("SQL içinde kapanmamış tırnak veya yorum var.");
  }

  const last = sql.slice(start).trim();
  if (last) out.push(last);

  return out;
}

async function tableExists(name) {
  const r = await client.execute({
    sql: "SELECT name FROM sqlite_master WHERE type='table' AND name=?",
    args: [name]
  });

  return r.rows.length > 0;
}

async function readRegistry(version) {
  const r = await client.execute({
    sql: "SELECT version, filename, checksum FROM schema_migrations WHERE version=?",
    args: [version]
  });

  return r.rows[0] || null;
}

async function main() {
  console.log("======================================");
  console.log("TURSO MIGRATION KONTROLÜ");
  console.log("Mod:", apply ? "APPLY" : "DRY-RUN");
  console.log("Korunan sürümler: 0001–0044");
  console.log("İzin verilen yeni sürümler: 0045+");
  console.log("======================================");

  if (!(await tableExists("schema_migrations"))) {
    throw new Error(
      "schema_migrations bulunamadı. Baseline doğrulanmadan işlem yapılamaz."
    );
  }

  for (const expected of BASELINE) {
    const row = await readRegistry(expected.version);

    if (!row) {
      throw new Error(
        `${expected.version} kayıtlı değil; işlem durduruldu.`
      );
    }

    if (row.checksum !== expected.checksum) {
      throw new Error(
        `${expected.version} checksum uyuşmazlığı; işlem durduruldu.`
      );
    }

    if (
      expected.version === "0043" &&
      row.filename !== expected.filename
    ) {
      throw new Error(
        "0043 dosya adı uyuşmazlığı; işlem durduruldu."
      );
    }

    console.log(
      `${expected.version} doğrulandı; yeniden çalıştırılmayacak.`
    );
  }

  const names = await readdir(MIGRATIONS_DIR);

  const items = names
    .map(name => {
      const m = /^(\d{4})_[a-z0-9_-]+\.sql$/i.exec(name);

      return m
        ? {
            version: m[1],
            filename: `${MIGRATIONS_DIR}/${name}`
          }
        : null;
    })
    .filter(x => x && Number(x.version) >= 45)
    .sort(
      (a, b) => Number(a.version) - Number(b.version)
    );

  if (!items.length) {
    console.log(
      "0045+ migration dosyası bulunamadı; değişiklik yok."
    );
    return;
  }

  for (let i = 0; i < items.length; i++) {
    const expectedVersion = String(45 + i).padStart(4, "0");

    if (items[i].version !== expectedVersion) {
      throw new Error(
        `Migration sıra boşluğu: ${expectedVersion} beklenirken ${items[i].version} bulundu.`
      );
    }
  }

  for (const item of items) {
    const sql = await readFile(
      join(
        MIGRATIONS_DIR,
        item.filename.split("/").at(-1)
      ),
      "utf8"
    );

    const checksum = hash(sql);
    const statements = splitSql(sql);

    if (!statements.length) {
      throw new Error(`${item.filename} boş.`);
    }

    const existing = await readRegistry(item.version);

    if (existing) {
      if (
        existing.filename !== item.filename ||
        existing.checksum !== checksum
      ) {
        throw new Error(
          `${item.version} kayıt/checksum uyuşmazlığı; işlem durduruldu.`
        );
      }

      console.log(
        `${item.version} zaten uygulanmış; checksum eşleşiyor, atlandı.`
      );
      continue;
    }

    console.log(`Hazır: ${item.filename}`);
    console.log(
      "SHA-256:",
      checksum,
      "| SQL komutu:",
      statements.length
    );

    if (!apply) {
      console.log("DRY-RUN: uygulanmadı.");
      continue;
    }

    const recheck = await readRegistry(item.version);

    if (recheck) {
      if (
        recheck.filename !== item.filename ||
        recheck.checksum !== checksum
      ) {
        throw new Error(
          `${item.version} eşzamanlı kayıt çakışması; işlem durduruldu.`
        );
      }

      console.log(
        `${item.version} başka işlemce uygulanmış; atlandı.`
      );
      continue;
    }

    const batch = statements.map(statement => ({
      sql: statement,
      args: []
    }));

    batch.push({
      sql: "INSERT INTO schema_migrations (version, filename, checksum) VALUES (?, ?, ?)",
      args: [item.version, item.filename, checksum]
    });

    await client.batch(batch, "write");

    console.log(
      `${item.version} başarıyla uygulandı ve kaydedildi.`
    );
  }

  console.log(
    "Migration kontrolü tamamlandı. 0001–0044 çalıştırılmadı."
  );
}

try {
  await main();
} finally {
  client.close();
}
