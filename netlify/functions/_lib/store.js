const { Pool } = require("pg");

let pool;
let readyPromise;

const getPool = () => {
  if (pool) return pool;
  if (!process.env.DATABASE_URL) {
    const err = new Error("DATABASE_URL is not configured");
    err.expose = true;
    throw err;
  }
  const sslSetting =
    process.env.DATABASE_SSL === "false"
      ? undefined
      : { rejectUnauthorized: false };
  pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: sslSetting,
  });
  return pool;
};

const ensureTable = async () => {
  if (!readyPromise) {
    const db = getPool();
    readyPromise = db.query(`
      CREATE TABLE IF NOT EXISTS kv_store (
        namespace text not null,
        key text not null,
        value jsonb,
        updated_at timestamptz default now(),
        primary key (namespace, key)
      );
    `);
  }
  return readyPromise;
};

const buildStore = (namespace) => ({
  get: async (key) => {
    const db = getPool();
    await ensureTable();
    const { rows } = await db.query(
      "SELECT value FROM kv_store WHERE namespace = $1 AND key = $2",
      [namespace, key]
    );
    return rows[0]?.value ?? null;
  },
  set: async (key, value) => {
    const db = getPool();
    await ensureTable();
    await db.query(
      `
        INSERT INTO kv_store (namespace, key, value, updated_at)
        VALUES ($1, $2, $3, now())
        ON CONFLICT (namespace, key)
        DO UPDATE SET value = EXCLUDED.value, updated_at = now()
      `,
      [namespace, key, value]
    );
  },
  delete: async (key) => {
    const db = getPool();
    await ensureTable();
    await db.query("DELETE FROM kv_store WHERE namespace = $1 AND key = $2", [
      namespace,
      key,
    ]);
  },
  list: async (prefix) => {
    const db = getPool();
    await ensureTable();
    const { rows } = await db.query(
      "SELECT key FROM kv_store WHERE namespace = $1 AND key LIKE $2 ORDER BY key",
      [namespace, `${prefix}%`]
    );
    return rows.map((row) => row.key);
  },
});

const getUserStore = (userId) => {
  const store = buildStore("zachfitapp");
  return {
    get: async (key) => store.get(`${userId}/${key}`),
    set: async (key, value) => store.set(`${userId}/${key}`, value),
    delete: async (key) => store.delete(`${userId}/${key}`),
    list: async (prefix) => store.list(`${userId}/${prefix}`),
  };
};

const getGlobalStore = () => {
  const store = buildStore("zachfitapp");
  return {
    get: async (key) => store.get(`global/${key}`),
    set: async (key, value) => store.set(`global/${key}`, value),
    list: async (prefix) => store.list(`global/${prefix}`),
  };
};

module.exports = { getUserStore, getGlobalStore };
