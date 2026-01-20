const { requireAuth } = require("./_lib/auth");
const { getUserStore } = require("./_lib/store");
const {json, error, withErrorHandling } = require("./_lib/response");
const { nowIso } = require("./_lib/utils");
const { validateSchema } = require("./_lib/schema");

exports.handler = withErrorHandling(async (event) => {
  const { user, error: authError } = requireAuth(event);
  if (authError) return authError;
  const store = getUserStore(user.userId);
  const program = await store.get("program");
  if (!program) return error(404, "Program not found");
  const finalized = { ...program, status: "finalized", updatedAt: nowIso() };
  const { valid } = validateSchema("program", finalized);
  if (!valid) return error(400, "Program schema invalid");
  const revisions = (await store.get("programRevisions")) || [];
  const nextRevisions = [finalized, ...revisions].slice(0, 10);
  await store.set("program", finalized);
  await store.set("programRevisions", nextRevisions);
  return json(200, finalized);
});
