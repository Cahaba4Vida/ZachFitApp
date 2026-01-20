const { requireAuth } = require("./_lib/auth");
const { json, withErrorHandling } = require("./_lib/response");
const { query } = require("./_lib/db");

exports.handler = withErrorHandling(async (event) => {
  const { user, error } = requireAuth(event);
  if (error) return error;
  const result = await query(
    `SELECT program, status
     FROM programs
     WHERE user_id = $1
     ORDER BY updated_at DESC
     LIMIT 1`,
    [user.userId]
  );
  const row = result.rows[0];
  return json(200, row?.program || null);
});
