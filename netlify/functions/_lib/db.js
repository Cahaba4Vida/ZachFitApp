const { Pool } = require("pg");

let pool;

const shouldUseSsl = (connectionString) => {
  const sslMode = process.env.PGSSLMODE;
  if (sslMode && sslMode.toLowerCase() === "require") return true;
  if (!connectionString) return false;
  try {
    const url = new URL(connectionString);
    return url.searchParams.get("sslmode") === "require";
  } catch (err) {
    return false;
  }
};

const getPool = () => {
  if (!pool) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error("Database connection not configured");
    }
    const ssl = shouldUseSsl(connectionString)
      ? { rejectUnauthorized: false }
      : undefined;
    pool = new Pool({ connectionString, ssl });
  }
  return pool;
};

const categorizeDbError = (error) => {
  const code = error?.code;
  const message = error?.message || "";
  if (code === "28P01") return "Database authentication failed";
  if (code === "3D000") return "Database not found";
  if (code === "42P01") return "Database schema missing";
  if (code === "57P01" || code === "57P02" || code === "57P03") {
    return "Database temporarily unavailable";
  }
  if (message.includes("timeout") || message.includes("ECONNRESET")) {
    return "Database connection timed out";
  }
  if (message.includes("ENOTFOUND")) {
    return "Database host not found";
  }
  return "Database query failed";
};

const query = async (text, params) => {
  try {
    const client = getPool();
    return await client.query(text, params);
  } catch (error) {
    throw new Error(categorizeDbError(error));
  }
};

module.exports = { getPool, query };
