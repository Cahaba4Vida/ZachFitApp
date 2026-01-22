const fs = require("fs");
const path = require("path");
const { jsonResponse, requireAdmin } = require("./lib/auth");
const { withTransaction } = require("./lib/db");

const migrationDir = path.resolve(__dirname, "..", "..", "migrations");

exports.handler = async (event) => {
  const authError = requireAdmin(event);
  if (authError) return authError;

  if (event.httpMethod !== "POST") {
    return jsonResponse(405, { ok: false, error: "Method not allowed" });
  }

  try {
    await withTransaction(async (client) => {
      const migrations = fs
        .readdirSync(migrationDir)
        .filter((file) => file.endsWith(".sql"))
        .sort();
      for (const migration of migrations) {
        const sql = fs.readFileSync(path.join(migrationDir, migration), "utf8");
        await client.query(sql);
      }
    });

    return jsonResponse(200, { ok: true, migrated: true });
  } catch (error) {
    return jsonResponse(500, { ok: false, error: error.message });
  }
};
