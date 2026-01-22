const { jsonResponse, requireAdmin } = require("./lib/auth");
const { withClient } = require("./lib/db");

exports.handler = async (event) => {
  const authError = requireAdmin(event);
  if (authError) return authError;

  try {
    const teams = await withClient(async (client) => {
      const { rows } = await client.query(
        "SELECT id, name FROM teams ORDER BY name ASC"
      );
      return rows;
    });

    return jsonResponse(200, { ok: true, teams });
  } catch (error) {
    return jsonResponse(500, { ok: false, error: error.message });
  }
};
