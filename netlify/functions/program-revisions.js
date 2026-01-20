const { requireAuth } = require("./_lib/auth");
const { getUserStore } = require("./_lib/store");
const { json, withErrorHandling } = require("./_lib/response");

exports.handler = withErrorHandling(async (event) => {
  const { user, error } = requireAuth(event);
  if (error) return error;
  const store = getUserStore(user.userId);
  const revisions = (await store.get("programRevisions")) || [];
  return json(200, revisions);
});
