const { jsonResponse, requireAdmin } = require("./lib/auth");
const { withClient } = require("./lib/db");

exports.handler = async (event) => {
  const authError = requireAdmin(event);
  if (authError) return authError;

  const teamId = event.queryStringParameters?.teamId;
  if (!teamId) {
    return jsonResponse(400, { ok: false, error: "teamId is required" });
  }

  try {
    const weeks = await withClient(async (client) => {
      const { rows } = await client.query(
        "SELECT iso_week FROM weeks WHERE team_id = $1 ORDER BY iso_week DESC",
        [teamId]
      );
      return rows.map((row) => row.iso_week);
    });

    return jsonResponse(200, { ok: true, weeks });
  } catch (error) {
    return jsonResponse(500, { ok: false, error: error.message });
  }
};
