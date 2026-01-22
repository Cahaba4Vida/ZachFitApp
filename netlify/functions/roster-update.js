const { jsonResponse, requireAdmin } = require("./lib/auth");
const { parseJsonBody } = require("./lib/request");
const { withClient } = require("./lib/db");

const buildUpdate = (body) => {
  const fields = [];
  const values = [];
  let index = 1;

  const setField = (key, value) => {
    fields.push(`${key} = $${index}`);
    values.push(value);
    index += 1;
  };

  if (body.name !== undefined) {
    setField("name", body.name?.trim() || "");
  }
  if (body.active !== undefined) {
    setField("active", Boolean(body.active));
  }
  if (body.email !== undefined) {
    const email = body.email?.trim();
    setField("email", email || null);
  }
  if (body.phone !== undefined) {
    const phone = body.phone?.trim();
    setField("phone", phone || null);
  }

  setField("updated_at", new Date());

  return { fields, values };
};

exports.handler = async (event) => {
  const authError = requireAdmin(event);
  if (authError) return authError;

  if (event.httpMethod !== "PUT") {
    return jsonResponse(405, { ok: false, error: "Method not allowed" });
  }

  const body = parseJsonBody(event) || {};
  const memberId = body.memberId;
  if (!memberId) {
    return jsonResponse(400, { ok: false, error: "memberId is required" });
  }

  const { fields, values } = buildUpdate(body);
  if (fields.length === 0) {
    return jsonResponse(400, { ok: false, error: "No fields to update" });
  }

  try {
    const member = await withClient(async (client) => {
      const { rows } = await client.query(
        `UPDATE members
         SET ${fields.join(", ")}
         WHERE id = $${values.length + 1}
         RETURNING id, name, active, email, phone`,
        [...values, memberId]
      );
      return rows[0];
    });

    if (!member) {
      return jsonResponse(404, { ok: false, error: "Member not found" });
    }

    return jsonResponse(200, { ok: true, member });
  } catch (error) {
    return jsonResponse(500, { ok: false, error: error.message });
  }
};
