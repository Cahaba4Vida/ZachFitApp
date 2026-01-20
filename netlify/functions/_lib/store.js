const { query } = require("./db");

const getUserStore = (userId) => {
  const namespace = `user:${userId}`;
  return {
    get: async (key) => {
      const result = await query(
        "SELECT value FROM kv_store WHERE namespace = $1 AND key = $2",
        [namespace, key]
      );
      return result.rows[0]?.value ?? null;
    },
    set: async (key, value) => {
      await query(
        `INSERT INTO kv_store (namespace, key, value, updated_at)
         VALUES ($1, $2, $3, NOW())
         ON CONFLICT (namespace, key)
         DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
        [namespace, key, value]
      );
    },
    delete: async (key) => {
      await query("DELETE FROM kv_store WHERE namespace = $1 AND key = $2", [namespace, key]);
    },
    list: async (prefix) => {
      const result = await query(
        "SELECT key FROM kv_store WHERE namespace = $1 AND key LIKE $2 ORDER BY key ASC",
        [namespace, `${prefix}%`]
      );
      return result.rows.map((row) => row.key);
    },
  };
};

const getGlobalStore = () => {
  const namespace = "global";
  return {
    get: async (key) => {
      const result = await query(
        "SELECT value FROM kv_store WHERE namespace = $1 AND key = $2",
        [namespace, key]
      );
      return result.rows[0]?.value ?? null;
    },
    set: async (key, value) => {
      await query(
        `INSERT INTO kv_store (namespace, key, value, updated_at)
         VALUES ($1, $2, $3, NOW())
         ON CONFLICT (namespace, key)
         DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
        [namespace, key, value]
      );
    },
    list: async (prefix) => {
      const result = await query(
        "SELECT key FROM kv_store WHERE namespace = $1 AND key LIKE $2 ORDER BY key ASC",
        [namespace, `${prefix}%`]
      );
      return result.rows.map((row) => row.key);
    },
  };
};

module.exports = { getUserStore, getGlobalStore };
