const { requireAuth } = require("./_lib/auth");
const { getUserStore } = require("./_lib/store");
const { json, error, withErrorHandling } = require("./_lib/response");
const { nowIso } = require("./_lib/utils");
const { query } = require("./_lib/db");
const { validateSchema } = require("./_lib/schema");

exports.handler = withErrorHandling(async (event) => {
  const { user, error: authError } = requireAuth(event);
  if (authError) return authError;
  const result = await query(
    `SELECT program
     FROM programs
     WHERE user_id = $1
     ORDER BY updated_at DESC
     LIMIT 1`,
    [user.userId]
  );
  const program = result.rows[0]?.program;
  if (!program) return error(404, "Program not found");
  const finalized = { ...program, status: "finalized", updatedAt: nowIso() };
  const { valid } = validateSchema("program", finalized);
  if (!valid) return error(400, "Program schema invalid");
  await query(
    `UPDATE programs
     SET program = $1, status = $2, updated_at = NOW()
     WHERE user_id = $3`,
    [finalized, "final", user.userId]
  );
  const store = getUserStore(user.userId);
  const revisions = (await store.get("programRevisions")) || [];
  const nextRevisions = [finalized, ...revisions].slice(0, 10);
  await store.set("programRevisions", nextRevisions);
  return json(200, finalized);
});
