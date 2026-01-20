const { requireAuth } = require("./_lib/auth");
const { getUserStore } = require("./_lib/store");
const { json, error, withErrorHandling } = require("./_lib/response");
const { parseBody, nowIso } = require("./_lib/utils");
const { query } = require("./_lib/db");
const { validateSchema } = require("./_lib/schema");

exports.handler = withErrorHandling(async (event) => {
  const { user, error: authError } = requireAuth(event);
  if (authError) return authError;
  const body = parseBody(event);
  if (!body?.program) return error(400, "Missing program");
  const program = {
    ...body.program,
    updatedAt: nowIso(),
  };
  const { valid } = validateSchema("program", program);
  if (!valid) return error(400, "Program schema invalid");
  await query(
    `INSERT INTO programs (user_id, program, status, created_at, updated_at)
     VALUES ($1, $2, $3, NOW(), NOW())
     ON CONFLICT (user_id)
     DO UPDATE SET program = EXCLUDED.program, status = EXCLUDED.status, updated_at = NOW()`,
    [user.userId, program, program.status || "draft"]
  );
  const store = getUserStore(user.userId);
  const revisions = (await store.get("programRevisions")) || [];
  const nextRevisions = [program, ...revisions].slice(0, 10);
  await store.set("programRevisions", nextRevisions);
  return json(200, program);
});
