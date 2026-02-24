const { json } = require("./_util");
const { requireUser } = require("./_auth");
const { query } = require("./_db");

async function ensureTable() {
  await query(`
    create table if not exists training_programs (
      user_id text primary key,
      program_text text,
      program_json jsonb,
      inputs jsonb,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    )
  `);
}

exports.handler = async (event, context) => {
  if (event.httpMethod && event.httpMethod !== "GET") {
    return json(405, { error: "Method not allowed" });
  }

  const auth = await requireUser(event, context);
  if (!auth.ok) return auth.response;

  await ensureTable();

  const { userId } = auth.user;

  const r = await query(
    `select user_id, program_text, program_json, inputs, created_at, updated_at
       from training_programs
      where user_id = $1`,
    [userId]
  );

  if (!r.rows[0]) return json(200, { has_program: false });

  return json(200, { has_program: true, ...r.rows[0] });
};
