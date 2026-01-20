const { requireAuth, isAdmin } = require("../_lib/auth");
const { getGlobalStore } = require("../_lib/store");
const { json, error, withErrorHandling } = require("../_lib/response");

exports.handler = withErrorHandling(async (event) => {
  const { user, error: authError } = requireAuth(event);
  if (authError) return authError;
  if (!isAdmin(user)) return error(403, "Forbidden");
  const store = getGlobalStore();
  const events = (await store.get("auditEvents")) || [];
  return json(200, events);
});
