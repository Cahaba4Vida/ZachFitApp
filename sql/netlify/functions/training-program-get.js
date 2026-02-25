const { json } = require("./_util");
const { requireUser } = require("./_auth");
const { query } = require("./_db");

exports.handler = async (event, context) => {
  if (event.httpMethod && event.httpMethod !== "GET") {
    return json(405, { error: "Method not allowed" });
  }

  const auth = await requireUser(event, context);
  if (!auth.ok) return auth.response;

  const { userId } = auth.user;

  const r = await query(
    `select user_id, program_text, program_json, inputs, program_length_weeks, version, created_at, updated_at
       from training_programs
      where user_id = $1`,
    [userId]
  );

  if (!r.rows[0]) return json(200, { has_program: false });

  return json(200, { has_program: true, ...r.rows[0] });
};
