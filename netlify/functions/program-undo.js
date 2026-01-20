const { requireAuth } = require("./_lib/auth");
const { getUserStore } = require("./_lib/store");
const { json, error, withErrorHandling } = require("./_lib/response");

exports.handler = withErrorHandling(async (event) => {
  const { user, error: authError } = requireAuth(event);
  if (authError) return authError;
  const store = getUserStore(user.userId);
  const revisions = (await store.get("programRevisions")) || [];
  if (revisions.length < 2) {
    return error(400, "No previous revision available");
  }
  const [, previous, ...rest] = revisions;
  const nextRevisions = [previous, ...rest];
  await query(
    `UPDATE programs
     SET program = $1, status = $2, updated_at = NOW()
     WHERE user_id = $3`,
    [previous, previous.status || "draft", user.userId]
  );
  await store.set("programRevisions", nextRevisions);
  return json(200, previous);
});
