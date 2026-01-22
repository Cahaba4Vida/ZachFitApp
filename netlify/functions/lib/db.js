const { Pool } = require("pg");

let pool;

const getConnectionString = () =>
  process.env.DATABASE_URL_POOLER || process.env.DATABASE_URL;

const getPool = () => {
  if (!pool) {
    const connectionString = getConnectionString();
    if (!connectionString) {
      throw new Error("DATABASE_URL is not configured");
    }
    pool = new Pool({
      connectionString,
      ssl: { rejectUnauthorized: false },
    });
  }
  return pool;
};

const withClient = async (callback) => {
  const client = await getPool().connect();
  try {
    return await callback(client);
  } finally {
    client.release();
  }
};

const withTransaction = async (callback) =>
  withClient(async (client) => {
    await client.query("BEGIN");
    try {
      const result = await callback(client);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  });

module.exports = {
  getPool,
  withClient,
  withTransaction,
};
