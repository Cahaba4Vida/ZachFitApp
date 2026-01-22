const { jsonResponse, requireAdmin } = require("./lib/auth");
const { parseJsonBody } = require("./lib/request");
const { withClient } = require("./lib/db");

exports.handler = async (event) => {
  const authError = requireAdmin(event);
  if (authError) return authError;

  if (event.httpMethod !== "POST") {
    return jsonResponse(405, { ok: false, error: "Method not allowed" });
  }

  const teamId = event.queryStringParameters?.teamId;
  if (!teamId) {
    return jsonResponse(400, { ok: false, error: "teamId is required" });
  }

  const body = parseJsonBody(event) || {};
  const name = body.name?.trim();
  if (!name) {
    return jsonResponse(400, { ok: false, error: "name is required" });
  }

  const active = typeof body.active === "boolean" ? body.active : true;
  const email = body.email?.trim() || null;
  const phone = body.phone?.trim() || null;

  try {
    const member = await withClient(async (client) => {
      const { rows } = await client.query(
        `INSERT INTO members (team_id, name, active, email, phone)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id, name, active, email, phone`,
        [teamId, name, active, email, phone]
      );
      return rows[0];
    });

    return jsonResponse(200, { ok: true, member });
  } catch (error) {
    return jsonResponse(500, { ok: false, error: error.message });
  }
};
