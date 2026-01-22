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
    const members = await withClient(async (client) => {
      const { rows } = await client.query(
        `SELECT id, name, active, email, phone
         FROM members
         WHERE team_id = $1
         ORDER BY created_at ASC`,
        [teamId]
      );
      return rows;
    });

    return jsonResponse(200, { ok: true, teamId, members });
  } catch (error) {
    return jsonResponse(500, { ok: false, error: error.message });
  }
};
