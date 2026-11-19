
import { createClient } from "@libsql/client/web";

function normalizeValue(value) {
  if (typeof value === "bigint") return Number(value);
  return value;
}

function normalizeRow(row) {
  if (!row) return row;
  const out = {};
  for (const [key, value] of Object.entries(row)) {
    out[key] = normalizeValue(value);
  }
  return out;
}

function normalizeResult(result) {
  return {
    results: (result.rows || []).map(normalizeRow),
    success: true,
    meta: {
      duration: result?.stats?.durationMs ?? 0,
      changes: Number(result?.rowsAffected ?? 0),
      last_row_id: result?.lastInsertRowid == null
        ? null
        : normalizeValue(result.lastInsertRowid)
    }
  };
}

export function createTursoAdapter(env) {
  const url = typeof env.TURSO_DATABASE_URL === "string" ? env.TURSO_DATABASE_URL.trim() : "";
  const authToken = typeof env.TURSO_AUTH_TOKEN === "string" ? env.TURSO_AUTH_TOKEN.trim() : "";

  if (!url || !authToken) {
    throw new Error("Turso credentials are missing.");
  }

  const client = createClient({ url, authToken });

  function prepare(sql) {
    let args = [];

    const statement = {
      bind(...values) {
        args = values;
        return statement;
      },

      async first(column) {
        const result = await client.execute({ sql, args });
        const row = result.rows?.[0];
        if (!row) return null;
        const normalized = normalizeRow(row);
        return column ? normalized[column] : normalized;
      },

      async all() {
        const result = await client.execute({ sql, args });
        return normalizeResult(result);
      },

      async run() {
        const result = await client.execute({ sql, args });
        return normalizeResult(result);
      }
    };

    return statement;
  }

  async function batch(statements) {
    const queries = statements.map((statement) => {
      if (typeof statement === "string") {
        return { sql: statement, args: [] };
      }
      return {
        sql: statement.sql,
        args: statement.args || []
      };
    });

    const results = await client.batch(queries, "write");
    return results.map(normalizeResult);
  }

  return {
    prepare,
    batch,
    async exec(sql) {
      return client.execute(sql);
    }
  };
}
